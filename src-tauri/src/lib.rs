mod dw_migrate;
mod dw_runner;
mod dw_server;
mod jars;
mod mcp_server;
mod module_lib;
mod platform;
mod secure_properties;
mod workspace;

use dw_runner::{RunState, WarmupState};
use dw_server::DwServerState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Dev-only: expose the WebView2 (Edge/Chromium) Chrome DevTools Protocol on
    // port 9222 so external tooling — e.g. a Playwright MCP server — can attach
    // to the *running* app and screenshot / inspect / drive the real UI,
    // backend `invoke` round-trips included. Must be set before the webview is
    // created, hence the top of `run()`. Windows/WebView2-only (a harmless
    // no-op on macOS/Linux); never compiled into release builds.
    #[cfg(debug_assertions)]
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--remote-debugging-port=9222");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(WarmupState {
            ready: Mutex::new(false),
            error: Mutex::new(None),
        })
        .manage(RunState {
            child_pid: Mutex::new(None),
            cancelled: Mutex::new(false),
        })
        .manage(DwServerState::new())
        .manage(mcp_server::McpState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                use tauri_plugin_log::{Target, TargetKind};
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .targets([
                            // Stdout = the `npm run tauri dev` terminal. Both
                            // Rust-side log::info! AND forwarded JS console.log
                            // (via the plugin's JS API) appear here.
                            Target::new(TargetKind::Stdout),
                            // Webview target lets us write to the in-app dev
                            // console too if the user opens it.
                            Target::new(TargetKind::Webview),
                        ])
                        .build(),
                )?;
            }

            // Boot the long-lived DW evaluation server in a background thread.
            // Pays JVM + DW runtime cold-start once (~1-3s), hidden behind
            // the splash, so every subsequent Run is ~15-50ms instead of
            // re-spawning a process every time.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                log::info!("Starting DataWeave server...");
                match dw_server::start(&handle) {
                    Ok(_) => log::info!("DW server ready"),
                    Err(e) => {
                        log::warn!("DW server start failed: {}", e);
                        let state = handle.state::<WarmupState>();
                        *state.error.lock().unwrap_or_else(|e| e.into_inner()) = Some(e);
                    }
                }
                let state = handle.state::<WarmupState>();
                *state.ready.lock().unwrap_or_else(|e| e.into_inner()) = true;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            dw_runner::run_dataweave,
            dw_runner::warm_dataweave_script,
            dw_runner::cancel_dataweave,
            dw_runner::save_output_file,
            dw_runner::save_binary_file,
            dw_runner::read_text_file,
            dw_runner::is_warmed_up,
            dw_runner::get_warmup_status,
            dw_runner::restart_engine,
            dw_runner::dw_tooling,
            dw_runner::dw_format,
            dw_runner::get_log_dir,
            secure_properties::secure_properties_invoke,
            workspace::save_workspace,
            workspace::load_workspace,
            workspace::list_workspaces,
            workspace::list_workspaces_meta,
            workspace::delete_workspace,
            workspace::rename_workspace,
            workspace::duplicate_workspace_file,
            workspace::get_workspaces_dir,
            module_lib::load_modules,
            module_lib::save_modules,
            jars::list_managed_jars,
            jars::get_jars_dir,
            jars::import_jar_file,
            jars::remove_managed_jar,
            jars::download_maven_jar,
            jars::compile_java,
            mcp_server::mcp_start,
            mcp_server::mcp_stop,
            mcp_server::mcp_set_advanced,
            mcp_server::mcp_set_decrypt,
            mcp_server::mcp_status,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                dw_server::stop(app_handle);
            }
        });
}

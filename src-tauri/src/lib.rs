mod dw_runner;
mod dw_server;
mod secure_properties;
mod workspace;

use dw_runner::{CliOverride, RunState, WarmupState};
use dw_server::DwServerState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
        .manage(CliOverride {
            path: Mutex::new(None),
        })
        .manage(DwServerState::new())
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
                        *state.error.lock().unwrap() = Some(e);
                    }
                }
                let state = handle.state::<WarmupState>();
                *state.ready.lock().unwrap() = true;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            dw_runner::run_dataweave,
            dw_runner::warm_dataweave_script,
            dw_runner::cancel_dataweave,
            dw_runner::migrate_dataweave,
            dw_runner::save_output_file,
            dw_runner::save_binary_file,
            dw_runner::read_text_file,
            dw_runner::is_warmed_up,
            dw_runner::get_warmup_status,
            dw_runner::restart_cli,
            dw_runner::get_log_dir,
            dw_runner::set_cli_path_override,
            dw_runner::get_cli_path_override,
            secure_properties::secure_properties_invoke,
            workspace::save_workspace,
            workspace::load_workspace,
            workspace::list_workspaces,
            workspace::delete_workspace,
            workspace::get_workspaces_dir,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                dw_server::stop(app_handle);
            }
        });
}

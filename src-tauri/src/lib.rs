mod dw_runner;
mod workspace;

use dw_runner::WarmupState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(WarmupState {
            ready: Mutex::new(false),
            error: Mutex::new(None),
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Warm up DW CLI in a background thread
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                log::info!("Warming up DataWeave CLI...");
                match dw_runner::warmup_dw_cli(&handle) {
                    Ok(_) => log::info!("DW CLI warm-up complete"),
                    Err(e) => {
                        log::warn!("DW CLI warm-up failed: {}", e);
                        let state = handle.state::<WarmupState>();
                        *state.error.lock().unwrap() = Some(e);
                    }
                }
                // Mark as warmed up regardless (don't block the user forever)
                let state = handle.state::<WarmupState>();
                *state.ready.lock().unwrap() = true;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            dw_runner::run_dataweave,
            dw_runner::migrate_dataweave,
            dw_runner::save_output_file,
            dw_runner::read_text_file,
            dw_runner::is_warmed_up,
            dw_runner::get_warmup_status,
            workspace::save_workspace,
            workspace::load_workspace,
            workspace::list_workspaces,
            workspace::delete_workspace,
            workspace::get_workspaces_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

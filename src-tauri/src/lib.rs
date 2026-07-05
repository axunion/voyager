mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_directory,
            commands::move_entry,
            commands::move_to_trash
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

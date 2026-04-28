use std::fs;
use base64::{engine::general_purpose, Engine as _};
use tauri::Manager;

#[tauri::command]
fn load_characters(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("characters.json");

    if !path.exists() {
        return Ok(None);
    }

    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_characters(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("characters.json"), data).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_media(app: tauri::AppHandle, file_name: String, data: String) -> Result<String, String> {
    let bytes = general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| e.to_string())?;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("media");

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let dest = dir.join(&file_name);
    fs::write(&dest, bytes).map_err(|e| e.to_string())?;

    dest.to_str()
        .ok_or_else(|| "Invalid path encoding".to_string())
        .map(|s| s.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_characters, save_characters, save_media])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

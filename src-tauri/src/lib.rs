mod browser_auth;

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
async fn start_desktop_browser_auth(
    app: tauri::AppHandle,
    server_url: String,
    email: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        browser_auth::start_desktop_browser_auth(app, server_url, email)
    })
    .await
    .map_err(|e| format!("Aufgabe abgebrochen: {}", e))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            start_desktop_browser_auth
        ])
        .run(tauri::generate_context!())
        .expect("error while running Gradus21 application");
}

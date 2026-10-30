mod browser_auth;
mod keyring_auth;

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn keyring_is_available() -> bool {
    keyring_auth::is_available()
}

#[tauri::command]
fn keyring_save_secret(service: String, user: String, secret: String) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        keyring_auth::save_secret(&service, &user, &secret)
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (service, user, secret);
        Err("Keyring ist auf mobilen Plattformen nicht verfügbar.".into())
    }
}

#[tauri::command]
fn keyring_get_secret(service: String, user: String) -> Result<String, String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        keyring_auth::get_secret(&service, &user)
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (service, user);
        Err("Keyring ist auf mobilen Plattformen nicht verfügbar.".into())
    }
}

#[tauri::command]
fn keyring_delete_secret(service: String, user: String) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        keyring_auth::delete_secret(&service, &user)
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (service, user);
        Err("Keyring ist auf mobilen Plattformen nicht verfügbar.".into())
    }
}

#[tauri::command]
async fn start_desktop_browser_auth(
    app: tauri::AppHandle,
    server_url: String,
    email: Option<String>,
    session_token: Option<String>,
    transit_key_override: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        browser_auth::start_desktop_browser_auth(app, server_url, email, session_token, transit_key_override)
    })
    .await
    .map_err(|e| format!("Aufgabe abgebrochen: {}", e))?
}

#[tauri::command]
fn focus_main_window(app: tauri::AppHandle) {
    #[cfg(desktop)]
    {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[tauri::command]
fn trigger_native_haptic(style: Option<String>) {
    #[cfg(target_os = "ios")]
    {
        #[link(name = "AudioToolbox", kind = "framework")]
        extern "C" {
            fn AudioServicesPlaySystemSound(in_system_sound_id: u32);
        }
        let sound_id = match style.as_deref() {
            Some("light") | Some("selection") => 1519, // Actuate `Peek` (light Taptic tap)
            Some("boundary") | Some("error") => 1521,  // Actuate `Nope` (triple micro-pulse)
            _ => 1520,                                 // Actuate `Pop` (crisp card snap)
        };
        unsafe {
            AudioServicesPlaySystemSound(sound_id);
        }
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = style;
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_biometric::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            keyring_is_available,
            keyring_save_secret,
            keyring_get_secret,
            keyring_delete_secret,
            start_desktop_browser_auth,
            focus_main_window,
            trigger_native_haptic
        ])
        .run(tauri::generate_context!())
        .expect("error while running Gradus21 application");
}

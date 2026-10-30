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
        use std::ffi::{c_char, c_void};
        use std::sync::OnceLock;

        extern "C" {
            fn dlopen(filename: *const c_char, flags: i32) -> *mut c_void;
            fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
        }

        type PlaySystemSoundFn = unsafe extern "C" fn(u32);
        static PLAY_SOUND: OnceLock<Option<PlaySystemSoundFn>> = OnceLock::new();

        let func = PLAY_SOUND.get_or_init(|| unsafe {
            let handle = dlopen(
                b"/System/Library/Frameworks/AudioToolbox.framework/AudioToolbox\0".as_ptr()
                    as *const c_char,
                0x1, // RTLD_LAZY
            );
            if handle.is_null() {
                return None;
            }
            let sym = dlsym(
                handle,
                b"AudioServicesPlaySystemSound\0".as_ptr() as *const c_char,
            );
            if sym.is_null() {
                None
            } else {
                Some(std::mem::transmute::<*mut c_void, PlaySystemSoundFn>(sym))
            }
        });

        if let Some(play) = func {
            let sound_id = match style.as_deref() {
                Some("light") | Some("selection") => 1519, // Actuate `Peek` (light Taptic tap)
                Some("boundary") | Some("error") => 1521,  // Actuate `Nope` (triple micro-pulse)
                _ => 1520,                                 // Actuate `Pop` (crisp card snap)
            };
            unsafe {
                play(sound_id);
            }
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

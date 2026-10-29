#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn save_secret(service: &str, user: &str, secret: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(service, user).map_err(|e| e.to_string())?;
    entry.set_password(secret).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn get_secret(service: &str, user: &str) -> Result<String, String> {
    let entry = keyring::Entry::new(service, user).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn delete_secret(service: &str, user: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(service, user).map_err(|e| e.to_string())?;
    let _ = entry.delete_credential();
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn is_available() -> bool {
    true
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn is_available() -> bool {
    false
}

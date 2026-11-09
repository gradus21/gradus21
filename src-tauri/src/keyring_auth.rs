pub fn validate_keyring_params(service: &str, user: &str) -> Result<(), String> {
    let clean_service = service.trim();
    if clean_service != "de.gradus21.app" && !clean_service.starts_with("de.gradus21.") {
        return Err(
            "Ungültiger Keyring-Service-Namespace (nur 'de.gradus21.app' erlaubt).".into(),
        );
    }
    if !clean_service
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    {
        return Err("Ungültige Zeichen im Keyring-Service-Namen.".into());
    }
    let clean_user = user.trim();
    if clean_user.is_empty() || clean_user.len() > 128 {
        return Err("Ungültige Benutzer-Kennung für den Schlüsselbund.".into());
    }
    if !clean_user
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '@'))
    {
        return Err("Ungültige Zeichen in der Benutzer-Kennung.".into());
    }
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn save_secret(service: &str, user: &str, secret: &str) -> Result<(), String> {
    validate_keyring_params(service, user)?;
    if secret.is_empty() || secret.len() > 4096 {
        return Err("Ungültige Schlüsselgröße für den Schlüsselbund.".into());
    }
    let entry = keyring::Entry::new(service.trim(), user.trim()).map_err(|e| e.to_string())?;
    entry.set_password(secret).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn get_secret(service: &str, user: &str) -> Result<String, String> {
    validate_keyring_params(service, user)?;
    let entry = keyring::Entry::new(service.trim(), user.trim()).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn delete_secret(service: &str, user: &str) -> Result<(), String> {
    validate_keyring_params(service, user)?;
    let entry = keyring::Entry::new(service.trim(), user.trim()).map_err(|e| e.to_string())?;
    let _ = entry.delete_credential();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_keyring_params;

    #[test]
    fn test_keyring_namespace_isolation() {
        assert!(validate_keyring_params("de.gradus21.app", "user-123").is_ok());
        assert!(validate_keyring_params("de.gradus21.desktop", "user-123").is_ok());
        assert!(validate_keyring_params("chrome", "user-123").is_err());
        assert!(validate_keyring_params("ssh", "user-123").is_err());
        assert!(validate_keyring_params("de.gradus21.app", "").is_err());
        assert!(validate_keyring_params("de.gradus21.app", &"x".repeat(129)).is_err());
        assert!(validate_keyring_params("de.gradus21.app\nfoo", "user-123").is_err());
        assert!(validate_keyring_params("de.gradus21.app", "user\x00bad").is_err());
        assert!(validate_keyring_params("de.gradus21.app", "user@school.de").is_ok());
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn is_available() -> bool {
    true
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn is_available() -> bool {
    false
}

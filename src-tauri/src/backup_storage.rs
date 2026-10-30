use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

static LAST_SNAPSHOT_MS: AtomicU64 = AtomicU64::new(0);

/// Formats a Unix epoch timestamp (seconds) into `YYYY-MM-DDTHH-MM-SS` (UTC) without external crates.
pub fn format_epoch_iso_filename(epoch_secs: u64) -> String {
    let secs_per_day = 86_400u64;
    let days = (epoch_secs / secs_per_day) as i64;
    let rem = epoch_secs % secs_per_day;
    let hour = rem / 3600;
    let minute = (rem % 3600) / 60;
    let second = rem % 60;

    // Howard Hinnant's civil_from_days algorithm
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    format!(
        "{:04}-{:02}-{:02}T{:02}-{:02}-{:02}",
        year, m, d, hour, minute, second
    )
}

fn resolve_home_dir(app: Option<&AppHandle>) -> Option<PathBuf> {
    if let Some(a) = app {
        if let Ok(h) = a.path().home_dir() {
            return Some(h);
        }
    }
    if let Ok(h) = std::env::var("HOME") {
        if !h.trim().is_empty() {
            return Some(PathBuf::from(h));
        }
    }
    if let Ok(up) = std::env::var("USERPROFILE") {
        if !up.trim().is_empty() {
            return Some(PathBuf::from(up));
        }
    }
    None
}

fn resolve_default_base_dir(app: &AppHandle) -> PathBuf {
    #[cfg(any(target_os = "ios", target_os = "android"))]
    {
        if let Ok(doc) = app.path().document_dir() {
            return doc;
        }
        if let Ok(data) = app.path().app_local_data_dir() {
            return data;
        }
        if let Ok(data) = app.path().app_data_dir() {
            return data;
        }
    }

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        if let Ok(doc) = app.path().document_dir() {
            return doc;
        }
        if let Some(home) = resolve_home_dir(Some(app)) {
            return home;
        }
        if let Ok(data) = app.path().app_local_data_dir() {
            return data;
        }
    }

    PathBuf::from(".")
}

/// Expands `~`, `$HOME`, `%USERPROFILE%`, `%LOCALAPPDATA%` and resolves relative paths.
pub fn expand_backup_path(app: Option<&AppHandle>, raw_path: &str) -> Result<PathBuf, String> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err("Der Backup-Pfad darf nicht leer sein.".into());
    }

    let mut expanded = trimmed.to_string();

    if expanded == "~" || expanded.starts_with("~/") || expanded.starts_with("~\\") {
        if let Some(home) = resolve_home_dir(app) {
            let suffix = &expanded[1..].trim_start_matches(['/', '\\']);
            let full = if suffix.is_empty() {
                home
            } else {
                home.join(suffix)
            };
            expanded = full.to_string_lossy().to_string();
        }
    }

    if expanded.contains("$HOME") {
        if let Some(home) = resolve_home_dir(app) {
            expanded = expanded.replace("$HOME", &home.to_string_lossy());
        }
    }

    if expanded.to_uppercase().contains("%USERPROFILE%") {
        if let Some(home) = resolve_home_dir(app) {
            let home_str = home.to_string_lossy();
            expanded = expanded
                .replace("%USERPROFILE%", &home_str)
                .replace("%userprofile%", &home_str);
        }
    }

    if expanded.to_uppercase().contains("%LOCALAPPDATA%") {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            expanded = expanded
                .replace("%LOCALAPPDATA%", &local_app_data)
                .replace("%localappdata%", &local_app_data);
        }
    }

    let path = PathBuf::from(&expanded);
    if path.is_absolute() {
        Ok(path)
    } else if let Some(a) = app {
        Ok(resolve_default_base_dir(a).join(path))
    } else if let Some(home) = resolve_home_dir(None) {
        Ok(home.join(path))
    } else {
        Ok(path)
    }
}

pub fn get_default_backup_dir(app: &AppHandle) -> Result<String, String> {
    let base = resolve_default_base_dir(app);
    let target = base.join("Gradus21-Backups");
    Ok(target.to_string_lossy().to_string())
}

pub fn validate_and_prepare_backup_dir(
    app: Option<&AppHandle>,
    raw_path: &str,
) -> Result<String, String> {
    let dir = expand_backup_path(app, raw_path)?;
    std::fs::create_dir_all(&dir).map_err(|e| {
        format!(
            "Backup-Ordner '{}' konnte nicht erstellt oder geöffnet werden: {}",
            dir.display(),
            e
        )
    })?;

    let probe = dir.join(".gradus21_write_probe");
    std::fs::write(&probe, b"gradus21-ok").map_err(|e| {
        format!(
            "Keine Schreibberechtigung im Backup-Ordner '{}': {}",
            dir.display(),
            e
        )
    })?;
    let _ = std::fs::remove_file(&probe);

    Ok(dir.to_string_lossy().to_string())
}

pub fn pick_backup_dir(
    app: &AppHandle,
    initial_dir: Option<String>,
) -> Result<Option<String>, String> {
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;

        let start_dir = initial_dir
            .as_deref()
            .and_then(|p| expand_backup_path(Some(app), p).ok())
            .unwrap_or_else(|| resolve_default_base_dir(app));
        let start_str = start_dir.to_string_lossy().to_string();

        // 1. Try zenity (GNOME / GTK / Ubuntu / Pop!_OS / Mint / Debian)
        let mut zenity_cmd = Command::new("zenity");
        zenity_cmd
            .arg("--file-selection")
            .arg("--directory")
            .arg("--title=Gradus21 — Separaten Backup-Ordner auswählen");
        if start_dir.exists() {
            zenity_cmd.arg(format!("--filename={}/", start_str.trim_end_matches('/')));
        }
        if let Ok(output) = zenity_cmd.output() {
            if output.status.success() {
                let chosen = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !chosen.is_empty() {
                    let validated = validate_and_prepare_backup_dir(Some(app), &chosen)?;
                    return Ok(Some(validated));
                }
            }
            return Ok(None);
        }

        // 2. Try kdialog (KDE Plasma)
        let mut kdialog_cmd = Command::new("kdialog");
        kdialog_cmd
            .arg("--getexistingdirectory")
            .arg(if start_dir.exists() { &start_str } else { "." })
            .arg("--title")
            .arg("Gradus21 — Separaten Backup-Ordner auswählen");
        if let Ok(output) = kdialog_cmd.output() {
            if output.status.success() {
                let chosen = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !chosen.is_empty() {
                    let validated = validate_and_prepare_backup_dir(Some(app), &chosen)?;
                    return Ok(Some(validated));
                }
            }
            return Ok(None);
        }

        // 3. Try qarma
        if let Ok(output) = Command::new("qarma")
            .arg("--file-selection")
            .arg("--directory")
            .arg("--title=Gradus21 — Separaten Backup-Ordner auswählen")
            .output()
        {
            if output.status.success() {
                let chosen = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !chosen.is_empty() {
                    let validated = validate_and_prepare_backup_dir(Some(app), &chosen)?;
                    return Ok(Some(validated));
                }
            }
            return Ok(None);
        }

        Err("Kein grafischer Ordner-Dialog (zenity/kdialog) auf dem System installiert. Bitte gib den gewünschten Backup-Pfad direkt im Eingabefeld ein oder klicke auf 'Standard-Pfad nutzen'.".into())
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let _ = initial_dir;
        let script = r#"POSIX path of (choose folder with prompt "Gradus21 — Separaten Backup-Ordner auswählen:")"#;
        match Command::new("osascript").arg("-e").arg(script).output() {
            Ok(output) => {
                if output.status.success() {
                    let chosen = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !chosen.is_empty() {
                        let validated = validate_and_prepare_backup_dir(Some(app), &chosen)?;
                        return Ok(Some(validated));
                    }
                }
                Ok(None)
            }
            Err(e) => Err(format!("macOS Ordner-Auswahl fehlgeschlagen: {}", e)),
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let _ = initial_dir;
        let ps_script = r#"
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = 'Gradus21 — Separaten Backup-Ordner auswählen'
$f.ShowNewFolderButton = $true
if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Out.Write($f.SelectedPath)
}
"#;
        match Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Sta", "-Command", ps_script])
            .output()
        {
            Ok(output) => {
                if output.status.success() {
                    let chosen = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !chosen.is_empty() {
                        let validated = validate_and_prepare_backup_dir(Some(app), &chosen)?;
                        return Ok(Some(validated));
                    }
                }
                Ok(None)
            }
            Err(e) => Err(format!("Windows Ordner-Auswahl fehlgeschlagen: {}", e)),
        }
    }

    #[cfg(any(target_os = "ios", target_os = "android"))]
    {
        let target = initial_dir
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(get_default_backup_dir(app)?);
        let validated = validate_and_prepare_backup_dir(Some(app), &target)?;
        Ok(Some(validated))
    }
}

pub fn export_backup_file(
    app: &AppHandle,
    filename: &str,
    vault_json: &str,
    preferred_dir: Option<String>,
) -> Result<Option<String>, String> {
    let base_dir = preferred_dir
        .as_deref()
        .and_then(|p| expand_backup_path(Some(app), p).ok())
        .or_else(|| app.path().download_dir().ok())
        .unwrap_or_else(|| resolve_default_base_dir(app));

    let _ = std::fs::create_dir_all(&base_dir);
    let default_target = base_dir.join(filename);
    let default_target_str = default_target.to_string_lossy().to_string();

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;

        if let Ok(output) = Command::new("zenity")
            .arg("--file-selection")
            .arg("--save")
            .arg("--confirm-overwrite")
            .arg("--title=Gradus21 Tresor-Backup speichern")
            .arg(format!("--filename={}", default_target_str))
            .output()
        {
            if output.status.success() {
                let chosen = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !chosen.is_empty() {
                    let target = PathBuf::from(&chosen);
                    write_file_atomic_or_direct(&target, vault_json.as_bytes())?;
                    return Ok(Some(chosen));
                }
            }
            return Ok(None);
        }

        if let Ok(output) = Command::new("kdialog")
            .arg("--getsavefilename")
            .arg(&default_target_str)
            .arg("*.gradus21")
            .arg("--title")
            .arg("Gradus21 Tresor-Backup speichern")
            .output()
        {
            if output.status.success() {
                let chosen = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !chosen.is_empty() {
                    let target = PathBuf::from(&chosen);
                    write_file_atomic_or_direct(&target, vault_json.as_bytes())?;
                    return Ok(Some(chosen));
                }
            }
            return Ok(None);
        }

        // Fallback if no GUI dialog binary is installed: save directly to Downloads / preferred_dir
        write_file_atomic_or_direct(&default_target, vault_json.as_bytes())?;
        Ok(Some(default_target_str))
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let safe_name = filename.replace('"', "");
        let script = format!(
            r#"POSIX path of (choose file name with prompt "Gradus21 Tresor-Backup speichern:" default name "{}")"#,
            safe_name
        );
        if let Ok(output) = Command::new("osascript").arg("-e").arg(&script).output() {
            if output.status.success() {
                let chosen = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !chosen.is_empty() {
                    let target = PathBuf::from(&chosen);
                    write_file_atomic_or_direct(&target, vault_json.as_bytes())?;
                    return Ok(Some(chosen));
                }
            }
            return Ok(None);
        }
        write_file_atomic_or_direct(&default_target, vault_json.as_bytes())?;
        Ok(Some(default_target_str))
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let safe_name = filename.replace('\'', "");
        let ps_script = format!(
            r#"
Add-Type -AssemblyName System.Windows.Forms
$s = New-Object System.Windows.Forms.SaveFileDialog
$s.Title = 'Gradus21 Tresor-Backup speichern'
$s.Filter = 'Gradus21 Tresor-Backup (*.gradus21)|*.gradus21|Alle Dateien (*.*)|*.*'
$s.FileName = '{}'
if ($s.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    [Console]::Out.Write($s.FileName)
}}
"#,
            safe_name
        );
        if let Ok(output) = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Sta", "-Command", &ps_script])
            .output()
        {
            if output.status.success() {
                let chosen = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !chosen.is_empty() {
                    let target = PathBuf::from(&chosen);
                    write_file_atomic_or_direct(&target, vault_json.as_bytes())?;
                    return Ok(Some(chosen));
                }
            }
            return Ok(None);
        }
        write_file_atomic_or_direct(&default_target, vault_json.as_bytes())?;
        Ok(Some(default_target_str))
    }

    #[cfg(any(target_os = "ios", target_os = "android"))]
    {
        write_file_atomic_or_direct(&default_target, vault_json.as_bytes())?;
        Ok(Some(default_target_str))
    }
}

fn write_file_atomic_or_direct(target: &Path, content: &[u8]) -> Result<(), String> {
    let tmp_name = format!(
        ".{}.tmp",
        target
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("gradus21_backup")
    );
    let tmp_path = target.with_file_name(tmp_name);
    if std::fs::write(&tmp_path, content).is_ok() {
        if std::fs::rename(&tmp_path, target).is_ok() {
            return Ok(());
        }
        let _ = std::fs::remove_file(&tmp_path);
    }
    std::fs::write(target, content).map_err(|e| {
        format!(
            "Backup-Datei '{}' konnte nicht geschrieben werden: {}",
            target.display(),
            e
        )
    })
}

pub fn write_vault_backup_to_dir(
    dir: &Path,
    vault_json: &str,
    user_id: Option<&str>,
    force_snapshot: bool,
    snapshot_interval_ms: u64,
    max_snapshots: usize,
) -> Result<serde_json::Value, String> {
    std::fs::create_dir_all(dir).map_err(|e| {
        format!(
            "Backup-Ordner '{}' konnte nicht erstellt werden: {}",
            dir.display(),
            e
        )
    })?;

    let raw_uid = user_id.unwrap_or_default().trim();
    let safe_uid: String = if raw_uid.is_empty() {
        "default".to_string()
    } else {
        raw_uid
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                    c
                } else {
                    '_'
                }
            })
            .collect()
    };

    let main_filename = format!("gradus21_vault_backup_{}.gradus21", safe_uid);
    let legacy_filename = "gradus21-vault-latest.gradus21";

    // 1. Write canonical latest backup file
    let main_path = dir.join(&main_filename);
    write_file_atomic_or_direct(&main_path, vault_json.as_bytes())?;

    // Also maintain legacy latest filename compatibility
    let legacy_path = dir.join(legacy_filename);
    let _ = write_file_atomic_or_direct(&legacy_path, vault_json.as_bytes());

    // 2. Periodic or forced snapshot
    let now_dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let now_ms = now_dur.as_millis() as u64;
    let now_secs = now_dur.as_secs();
    let last_ms = LAST_SNAPSHOT_MS.load(Ordering::Relaxed);

    let should_snapshot =
        force_snapshot || last_ms == 0 || now_ms.saturating_sub(last_ms) >= snapshot_interval_ms;

    let mut saved_snapshot_name = main_filename.clone();
    let date_str = format_epoch_iso_filename(now_secs);

    if should_snapshot {
        LAST_SNAPSHOT_MS.store(now_ms, Ordering::Relaxed);
        let snapshot_filename = format!("gradus21_vault_backup_{}_{}.gradus21", safe_uid, date_str);
        let snapshot_path = dir.join(&snapshot_filename);
        write_file_atomic_or_direct(&snapshot_path, vault_json.as_bytes())?;
        saved_snapshot_name = snapshot_filename;

        // 3. Retention rotation (keep at most max_snapshots timestamped files)
        if let Ok(entries) = std::fs::read_dir(dir) {
            let suffix_main = format!("{}.gradus21", safe_uid);
            let mut snapshot_files: Vec<String> = entries
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false))
                .filter_map(|e| e.file_name().into_string().ok())
                .filter(|name| {
                    (name.starts_with("gradus21_vault_backup_")
                        || name.starts_with("gradus21-vault-"))
                        && name.ends_with(".gradus21")
                        && !name.ends_with(&suffix_main)
                        && !name.contains("latest")
                })
                .collect();

            if snapshot_files.len() > max_snapshots {
                snapshot_files.sort();
                let to_delete = snapshot_files.len() - max_snapshots;
                for old_name in snapshot_files.into_iter().take(to_delete) {
                    let _ = std::fs::remove_file(dir.join(old_name));
                }
            }
        }
    }

    Ok(serde_json::json!({
        "filename": saved_snapshot_name,
        "timestamp": date_str,
        "resolvedPath": dir.to_string_lossy().to_string()
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_epoch_iso_filename() {
        // 2026-10-30T11:47:02Z = 1793360822
        let formatted = format_epoch_iso_filename(1_793_360_822);
        assert_eq!(formatted, "2026-10-30T11-47-02");
    }

    #[test]
    fn test_write_vault_backup_and_rotation() {
        let temp_dir = std::env::temp_dir().join(format!(
            "gradus21_backup_test_{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));

        let res = write_vault_backup_to_dir(
            &temp_dir,
            r#"{"userId":"u1","classEnvelopes":[]}"#,
            Some("user-123"),
            true,
            0,
            2,
        )
        .expect("backup write should succeed");

        assert!(temp_dir.join("gradus21_vault_backup_user-123.gradus21").exists());
        assert!(temp_dir.join("gradus21-vault-latest.gradus21").exists());
        assert!(res["resolvedPath"].as_str().unwrap().contains("gradus21_backup_test_"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

use rand::RngCore;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

#[derive(serde::Deserialize)]
struct CallbackBody {
    state: String,
    session: Option<serde_json::Value>,
    encrypted_payload: Option<String>,
}

/// Starts an ephemeral loopback HTTP server, opens the system browser to the Gradus21 auth page,
/// and awaits the unlocked session callback.
pub fn start_desktop_browser_auth(
    app: AppHandle,
    server_url: String,
    email: Option<String>,
) -> Result<serde_json::Value, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Fehler beim Binden des lokalen Loopback-Servers: {}", e))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Fehler beim Konfigurieren des Sockets: {}", e))?;

    let port = listener
        .local_addr()
        .map_err(|e| format!("Fehler beim Ermitteln des Ports: {}", e))?
        .port();

    let mut state_bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut state_bytes);
    let state_hex: String = state_bytes.iter().map(|b| format!("{:02x}", b)).collect();

    let mut transit_key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut transit_key);
    let transit_key_hex: String = transit_key.iter().map(|b| format!("{:02x}", b)).collect();

    let base = server_url.trim_end_matches('/');
    let mut auth_url = format!("{}/?desktop_auth=1&port={}&state={}", base, port, state_hex);
    if let Some(ref e) = email {
        let trimmed = e.trim();
        if !trimmed.is_empty() {
            auth_url.push_str("&email=");
            for b in trimmed.bytes() {
                if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
                    auth_url.push(b as char);
                } else {
                    auth_url.push_str(&format!("%{:02X}", b));
                }
            }
        }
    }
    auth_url.push_str("#transit_key=");
    auth_url.push_str(&transit_key_hex);

    // Open browser via tauri-plugin-opener
    #[cfg(desktop)]
    {
        use tauri_plugin_opener::OpenerExt;
        let _ = app.opener().open_url(&auth_url, None::<&str>);
    }

    let start_time = Instant::now();
    let timeout = Duration::from_secs(300); // 5 minutes timeout

    while start_time.elapsed() < timeout {
        match listener.accept() {
            Ok((mut stream, _addr)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buffer = Vec::with_capacity(4096);
                let mut chunk = [0u8; 1024];

                // Read HTTP request header
                let mut header_end = None;
                loop {
                    match stream.read(&mut chunk) {
                        Ok(0) => break,
                        Ok(n) => {
                            buffer.extend_from_slice(&chunk[..n]);
                            if let Some(pos) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
                                header_end = Some(pos + 4);
                                break;
                            }
                        }
                        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            std::thread::sleep(Duration::from_millis(50));
                            continue;
                        }
                        Err(_) => break,
                    }
                }

                if let Some(pos) = header_end {
                    let header_str = String::from_utf8_lossy(&buffer[..pos]);
                    let first_line = header_str.lines().next().unwrap_or("");

                    if first_line.starts_with("OPTIONS") {
                        // CORS Preflight Response
                        let resp = "HTTP/1.1 200 OK\r\n\
                                    Access-Control-Allow-Origin: *\r\n\
                                    Access-Control-Allow-Methods: POST, OPTIONS\r\n\
                                    Access-Control-Allow-Headers: Content-Type\r\n\
                                    Content-Length: 0\r\n\
                                    Connection: close\r\n\r\n";
                        let _ = stream.write_all(resp.as_bytes());
                        let _ = stream.flush();
                        continue;
                    }

                    if first_line.starts_with("POST") {
                        // Extract Content-Length
                        let mut content_length: usize = 0;
                        for line in header_str.lines() {
                            if line.to_ascii_lowercase().starts_with("content-length:") {
                                if let Some(val) = line.split(':').nth(1) {
                                    content_length = val.trim().parse().unwrap_or(0);
                                }
                            }
                        }

                        // Read remaining body if not fully read
                        while buffer.len() < pos + content_length {
                            match stream.read(&mut chunk) {
                                Ok(0) => break,
                                Ok(n) => buffer.extend_from_slice(&chunk[..n]),
                                Err(_) => break,
                            }
                        }

                        let body_slice = if buffer.len() >= pos + content_length {
                            &buffer[pos..pos + content_length]
                        } else {
                            &buffer[pos..]
                        };

                        if let Ok(callback_req) = serde_json::from_slice::<CallbackBody>(body_slice) {
                            if callback_req.state == state_hex {
                                let session_value = if let Some(enc) = callback_req.encrypted_payload {
                                    match gradus21_core::crypto::decrypt_transit_payload(&transit_key, &enc) {
                                        Ok(decrypted_json) => {
                                            serde_json::from_str::<serde_json::Value>(&decrypted_json)
                                                .map_err(|e| format!("JSON-Formatfehler im entschlüsselten Payload: {}", e))?
                                        }
                                        Err(e) => {
                                            return Err(format!("Fehler beim Entschlüsseln des Authentifizierungs-Payloads: {:?}", e));
                                        }
                                    }
                                } else if let Some(sess) = callback_req.session {
                                    sess
                                } else {
                                    return Err("Keine Session-Daten übergeben".into());
                                };

                                // Send successful response HTML
                                let html = r#"<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gradus21 — Anmeldung erfolgreich</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #1e293b; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 40px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4); }
    .icon { width: 64px; height: 64px; background: #059669; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 24px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px 0; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0; }
    .badge { display: inline-block; padding: 6px 14px; background: rgba(5, 150, 105, 0.15); border: 1px solid rgba(5, 150, 105, 0.4); color: #34d399; border-radius: 9999px; font-size: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </div>
    <h1>Anmeldung erfolgreich!</h1>
    <p>Deine Gradus21 Desktop-App wurde entsperrt. Du kannst dieses Browser-Fenster jetzt schließen und in der Desktop-App weiterarbeiten.</p>
    <div class="badge">Sichere Zero-Knowledge Verbindung</div>
  </div>
</body>
</html>"#;

                                let resp = format!(
                                    "HTTP/1.1 200 OK\r\n\
                                     Content-Type: text/html; charset=utf-8\r\n\
                                     Access-Control-Allow-Origin: *\r\n\
                                     Content-Length: {}\r\n\
                                     Connection: close\r\n\r\n{}",
                                    html.len(),
                                    html
                                );
                                let _ = stream.write_all(resp.as_bytes());
                                let _ = stream.flush();

                                // Bring main window to front
                                #[cfg(desktop)]
                                {
                                    if let Some(window) = app.get_webview_window("main") {
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                }

                                return Ok(session_value);
                            }
                        }
                    }
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => {
                return Err(format!("Netzwerkfehler im Loopback-Listener: {}", e));
            }
        }
    }

    Err("Zeitüberschreitung: Die Passkey-Anmeldung im Browser wurde nicht innerhalb von 5 Minuten abgeschlossen.".into())
}

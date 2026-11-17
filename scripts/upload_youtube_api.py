#!/usr/bin/env python3
"""
Gradus21 YouTube Data API v3 Uploader
Automates channel branding, playlist creation, resumable upload of all 6 guide
videos, custom thumbnail assignment, and playlist ordering.

Prerequisites (one-time per Google account / GCP project):
1. Create the "Gradus21" channel at https://www.youtube.com/channel_switcher
2. Create an OAuth 2.0 Client ID (Desktop app) in GCP project "gradus21" and
   download client_secret*.json into ~/Downloads/ (or save directly to
   ~/.config/gradus21/youtube_client_secret.json).
"""

import argparse
import glob
import json
import os
import shutil
import sys
import time
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

SCOPES = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",
]

GCP_PROJECT_ID = "gradus21"
CONFIG_DIR = Path.home() / ".config" / "gradus21"
CLIENT_SECRET_DEST = CONFIG_DIR / "youtube_client_secret.json"
TOKEN_PATH = CONFIG_DIR / "youtube_token.json"
DEFAULT_ASSETS_DIR = Path.home() / "Downloads" / "Gradus21-Guide-Videos"

CHANNEL_DESCRIPTION = """Gradus21 – Die datenschutzkonforme Notenverwaltung für Lehrkräfte.

Alle Noten, Schnitte und Zeugnisnoten sicher an einem Ort:
• Klassen-Matrix mit Live-Notenberechnung
• Speed-Grading per Tastatur nach der Korrektur
• 360°-Schülerakte für Elterngespräche inkl. A4-Druckbogen & Wunschnoten-Rechner
• Flexibler Gewichtungs-Baukasten ohne Excel-Formeln (inkl. G/M/E-Differenzierung)
• Beamer-Schutz (Alt+P) & echte Zero-Knowledge-Verschlüsselung direkt auf dem Gerät

Website & Downloads: https://gradus21.de
Datenschutz & AVV: https://gradus21.de/datenschutz"""

CHANNEL_KEYWORDS = (
    'Gradus21 Notenverwaltung "Lehrer Software" "Excel Alternative Lehrer" '
    'Notenrechner "Speed Grading" Zeugnisnoten "Datenschutz Schule" '
    '"DSGVO Notenapp" Notenschlüssel'
)

PLAYLIST_TITLE = "Gradus21 Funktions-Guide & Schnellstart"
AI_TRANSPARENCY_NOTICE = (
    "\n\n---\nℹ️ Transparenz-Hinweis: Die Sprechstimme in diesem Video wurde mithilfe von "
    "Neural-TTS (KI-Sprachsynthese auf Deutsch) erzeugt. Alle gezeigten Funktionen, "
    "Rechner und Masken zeigen die echte Gradus21-Anwendung."
)
PLAYLIST_DESCRIPTION = (
    "Alle 6 Kapitel des interaktiven Gradus21-Guides als kompakte Video-Tutorials "
    "auf Deutsch – vom Excel-Import über Speed-Grading und eigenen Notenschlüssel "
    "bis zum Beamer-Schutz."
)

VIDEO_SPECS = [
    {
        "key": "01",
        "position": 0,
        "video_file": "01_Schnellstart_und_Ueberblick.mp4",
        "thumb_file": "01_Thumbnail_Schnellstart_und_Ueberblick.png",
        "title": "Gradus21 Schnellstart: Alle 4 Arbeitsmodi in unter 2 Minuten | Kapitel 1",
        "description": (
            "Lerne Gradus21 im Schnelldurchlauf kennen: Alle Noten, Schnitte und "
            "Zeugnisnoten an einem Ort – lokal verschlüsselt auf deinem Gerät.\n\n"
            "In diesem Video siehst du alle vier Arbeitsmodi im Überblick sowie den "
            "Beamer-Schutz für das Klassenzimmer.\n\n"
            "Kapitel im Video:\n"
            "00:00 Willkommen & Beispielklasse laden\n"
            "00:17 Klasse anlegen oder Excel importieren\n"
            "00:28 1. Klassen-Matrix (Gesamtübersicht)\n"
            "00:45 2. Speed-Grading (Korrektur per Tastatur)\n"
            "01:02 3. Schüler-360°-Akte (Elterngespräch & Simulator)\n"
            "01:17 4. Gewichtungs-Baukasten (ohne Formeln)\n"
            "01:35 Beamer-Schutz (Alt+P) testen\n\n"
            "Mehr Infos & Download: https://gradus21.de"
        ),
        "tags": [
            "Gradus21",
            "Notenverwaltung",
            "Lehrer App",
            "Excel Alternative Lehrer",
            "Schnellstart",
            "Klassenmatrix",
            "Speed Grading",
            "Beamer Schutz",
            "DSGVO",
        ],
    },
    {
        "key": "02",
        "position": 1,
        "video_file": "02_Erste_Klasse_und_Excel_Import.mp4",
        "thumb_file": "02_Thumbnail_Erste_Klasse_und_Excel_Import.png",
        "title": "Erste Klasse anlegen & Excel-Listen (.xlsx) importieren | Gradus21 Guide (Kapitel 2)",
        "description": (
            "So übernimmst du bestehende Klassenlisten aus Excel in Sekunden nach "
            "Gradus21 oder startest direkt mit der integrierten Beispielklasse.\n\n"
            "Kapitel im Video:\n"
            "00:00 Neue Klasse starten & Import öffnen\n"
            "00:14 Automatische Spaltenerkennung & Beispielklasse\n"
            "00:29 Schüler:innen & Prüfungen im Halbjahr verwalten\n\n"
            "Mehr Infos & Download: https://gradus21.de"
        ),
        "tags": [
            "Gradus21",
            "Excel Import",
            "Klassenliste importieren",
            "Notenliste Excel",
            "Lehrer Software",
            "Klassenverwaltung",
        ],
    },
    {
        "key": "03",
        "position": 2,
        "video_file": "03_Eigenes_Bewertungsmodell.mp4",
        "thumb_file": "03_Thumbnail_Eigenes_Bewertungsmodell.png",
        "title": "Gewichtung, Notenschlüssel & G/M/E-Differenzierung ohne Formeln | Gradus21 Guide (Kapitel 3)",
        "description": (
            "Stelle deinen eigenen Fach-Notenschlüssel, Kategorien-Gewichtungen "
            "und Streichnoten einfach per Schieberegler ein – ganz ohne "
            "fehleranfällige Tabellenformeln.\n\n"
            "Kapitel im Video:\n"
            "00:00 Der Gewichtungs-Baukasten\n"
            "00:13 1. Kategorien & Streichnoten festlegen\n"
            "00:29 2. Notenschlüssel & Binnendifferenzierung (G / M / E)\n"
            "00:47 3. Basis-Setup & Skala (1–6 oder 0–15 Punkte)\n"
            "00:59 4. Live-Check, Sandbox & Vorlagen speichern\n\n"
            "Mehr Infos & Download: https://gradus21.de"
        ),
        "tags": [
            "Gradus21",
            "Notenschlüssel",
            "Gewichtung Noten",
            "Binnendifferenzierung",
            "Streichnoten",
            "Oberstufe 15 Punkte",
            "Bewertungsmodell",
        ],
    },
    {
        "key": "04",
        "position": 3,
        "video_file": "04_Speed_Grading_und_Notenspiegel.mp4",
        "thumb_file": "04_Thumbnail_Speed_Grading_und_Notenspiegel.png",
        "title": "Speed-Grading: Arbeiten in Sekunden eintragen & Notenspiegel prüfen | Gradus21 Guide (Kapitel 4)",
        "description": (
            "Klassenarbeit oder Test korrigiert? Im Speed-Grading-Modus trägst du "
            "Prozent, Rohpunkte oder Direktnoten blitzschnell per Tastatur ein und "
            "behältst den Notenspiegel live im Blick.\n\n"
            "Kapitel im Video:\n"
            "00:00 Fokus auf eine einzelne Prüfung\n"
            "00:14 Tastatur-Navigation (Enter) & Attest-Vermerk (K)\n"
            "00:26 Live-Notenspiegel & Maßstab direkt anpassen\n\n"
            "Mehr Infos & Download: https://gradus21.de"
        ),
        "tags": [
            "Gradus21",
            "Speed Grading",
            "Notenspiegel",
            "Klassenarbeit eintragen",
            "Notenrechner",
            "Korrekturhilfe Lehrer",
        ],
    },
    {
        "key": "05",
        "position": 4,
        "video_file": "05_Schueler_360_Akte_und_Simulator.mp4",
        "thumb_file": "05_Thumbnail_Schueler_360_Akte_und_Simulator.png",
        "title": "360°-Schülerakte, Wunschnoten-Rechner & Elternsprechtagsbogen | Gradus21 Guide (Kapitel 5)",
        "description": (
            "Perfekt vorbereitet ins Elterngespräch: Alle Einzelnoten, der Vergleich "
            "zwischen Schriftlich und Mündlich, der Was-wäre-wenn-Wunschnoten-Rechner "
            "und der druckfertige DIN-A4-Bogen mit einem Klick.\n\n"
            "Kapitel im Video:\n"
            "00:00 Die 360°-Akte im Überblick\n"
            "00:16 Stärken & Schwächen im Klassenvergleich\n"
            "00:26 Wunschnoten-Rechner (Was-wäre-wenn-Simulator)\n"
            "00:40 Elternsprechtagsbogen als DIN-A4 drucken\n\n"
            "Mehr Infos & Download: https://gradus21.de"
        ),
        "tags": [
            "Gradus21",
            "Schülerakte",
            "Elterngespräch",
            "Elternsprechtag",
            "Wunschnoten Rechner",
            "Was wäre wenn Simulator",
        ],
    },
    {
        "key": "06",
        "position": 5,
        "video_file": "06_Datenschutz_und_Beamer_Schutz.mp4",
        "thumb_file": "06_Thumbnail_Datenschutz_und_Beamer_Schutz.png",
        "title": "Datenschutz für Schulen: Beamer-Schutz (Alt+P) & Zero-Knowledge-Tresor | Gradus21 Guide (Kapitel 6)",
        "description": (
            "Schülerdaten gehören geschützt – auch im Klassenzimmer. Sieh dir an, "
            "wie du mit Alt+P sofort alle Namen und Noten unscharf stellst, komplett "
            "offline arbeitest und deine Daten per Zero-Knowledge-Verschlüsselung sicherst.\n\n"
            "Kapitel im Video:\n"
            "00:00 Beamer-Schutz per Klick oder Alt+P\n"
            "00:16 Lokale Zero-Knowledge-Verschlüsselung\n"
            "00:27 Offline-Betrieb & automatisches Ordner-Backup\n"
            "00:38 Verschlüsselter Cloud-Sync nur nach Wunsch\n\n"
            "Mehr Infos & AVV-Leitfaden: https://gradus21.de/datenschutz"
        ),
        "tags": [
            "Gradus21",
            "Datenschutz Schule",
            "DSGVO Lehrer",
            "Beamer Schutz",
            "Zero Knowledge",
            "E2EE Verschlüsselung",
            "Offline Notenverwaltung",
        ],
    },
]


def is_oauth_client_secret(path: Path) -> bool:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return isinstance(data, dict) and ("installed" in data or "web" in data)
    except Exception:
        return False


def discover_client_secret(explicit_path: str | None) -> Path | None:
    if explicit_path:
        p = Path(explicit_path).expanduser().resolve()
        if p.exists() and is_oauth_client_secret(p):
            return p
        raise FileNotFoundError(f"Ungültige OAuth-Client-Secret-Datei: {p}")

    if CLIENT_SECRET_DEST.exists() and is_oauth_client_secret(CLIENT_SECRET_DEST):
        return CLIENT_SECRET_DEST

    downloads_dir = Path.home() / "Downloads"
    candidates = sorted(
        (Path(p) for p in glob.glob(str(downloads_dir / "client_secret*.json"))),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for cand in candidates:
        if is_oauth_client_secret(cand):
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            os.chmod(CONFIG_DIR, 0o700)
            shutil.copy2(cand, CLIENT_SECRET_DEST)
            os.chmod(CLIENT_SECRET_DEST, 0o600)
            print(f"✔ OAuth-Client-Secret erkannt und sicher gespeichert: {CLIENT_SECRET_DEST}")
            return CLIENT_SECRET_DEST

    return None


def print_oauth_setup_help() -> None:
    print(
        "\n❌ Kein OAuth-2.0-Client-Secret gefunden.\n"
        f"   Erwarteter Pfad: {CLIENT_SECRET_DEST}\n"
        "   (oder eine Datei 'client_secret_*.json' in ~/Downloads)\n\n"
        "Einmalige Einrichtung in ~2 Minuten:\n"
        "1. Falls noch nicht geschehen, Kanal 'Gradus21' anlegen:\n"
        "   https://www.youtube.com/channel_switcher\n"
        "2. OAuth-Zustimmungsbildschirm prüfen & dich als Testnutzer eintragen:\n"
        f"   https://console.cloud.google.com/apis/credentials/consent?project={GCP_PROJECT_ID}\n"
        "3. OAuth-Client-ID erstellen (Anwendungstyp: 'Desktop-App'), JSON herunterladen:\n"
        f"   https://console.cloud.google.com/apis/credentials?project={GCP_PROJECT_ID}\n"
        "4. Danach einfach erneut ausführen:\n"
        "   bash /home/julian/coding/gradus21/scripts/upload-youtube-videos.sh\n",
        file=sys.stderr,
    )


def get_youtube_client(secret_path: Path):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(CONFIG_DIR, 0o700)

    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(secret_path), SCOPES)
            creds = flow.run_local_server(
                port=0,
                open_browser=True,
                authorization_prompt_message=(
                    "\n==> Bitte im Browser mit dem Konto / Kanal 'Gradus21' anmelden:\n    {url}\n"
                ),
                success_message="Gradus21 YouTube-Autorisierung erfolgreich! Dieses Tab kann geschlossen werden.",
            )

        TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
        os.chmod(TOKEN_PATH, 0o600)

    return build("youtube", "v3", credentials=creds)


def load_state(state_path: Path) -> dict:
    if state_path.exists():
        try:
            return json.loads(state_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"videos": {}}


def save_state(state_path: Path, state: dict) -> None:
    state_path.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def update_channel_branding(youtube, banner_path: Path) -> dict:
    resp = youtube.channels().list(part="id,snippet,brandingSettings", mine=True).execute()
    items = resp.get("items", [])
    if not items:
        raise RuntimeError(
            "Kein YouTube-Kanal für diesen Account gefunden. "
            "Bitte zuerst unter https://www.youtube.com/channel_switcher einen Kanal erstellen."
        )

    channel = items[0]
    channel_id = channel["id"]
    channel_title = channel.get("snippet", {}).get("title", "<unbekannt>")
    print(f"✔ Authentifizierter Kanal: {channel_title} ({channel_id})")

    banner_media = MediaFileUpload(str(banner_path), mimetype="image/png", resumable=False)
    banner_resp = youtube.channelBanners().insert(media_body=banner_media).execute()
    banner_url = banner_resp["url"]
    print(f"✔ Kanalbanner hochgeladen: {banner_path.name}")

    branding = channel.get("brandingSettings", {})
    ch_settings = branding.setdefault("channel", {})
    ch_settings["description"] = CHANNEL_DESCRIPTION
    ch_settings["keywords"] = CHANNEL_KEYWORDS
    ch_settings["defaultLanguage"] = "de"
    ch_settings["country"] = "DE"

    img_settings = branding.setdefault("image", {})
    img_settings["bannerExternalUrl"] = banner_url

    youtube.channels().update(
        part="brandingSettings",
        body={"id": channel_id, "brandingSettings": branding},
    ).execute()
    print("✔ Kanalbeschreibung, Keywords, Sprache (de) und Banner aktualisiert.")
    print(
        "  Hinweis: Das Profilbild (00_Kanal_Profilbild_800x800.png) kann wegen "
        "YouTube-API-Einschränkung nur einmalig in YouTube Studio gesetzt werden."
    )
    return {"id": channel_id, "title": channel_title}


def ensure_playlist(youtube, privacy: str) -> tuple[str, set[str]]:
    page_token = None
    playlist_id = None
    while True:
        resp = (
            youtube.playlists()
            .list(part="id,snippet,status", mine=True, maxResults=50, pageToken=page_token)
            .execute()
        )
        for item in resp.get("items", []):
            if item.get("snippet", {}).get("title") == PLAYLIST_TITLE:
                playlist_id = item["id"]
                break
        page_token = resp.get("nextPageToken")
        if playlist_id or not page_token:
            break

    if playlist_id:
        print(f"✔ Vorhandene Playlist gefunden: {PLAYLIST_TITLE} ({playlist_id})")
    else:
        created = (
            youtube.playlists()
            .insert(
                part="snippet,status",
                body={
                    "snippet": {
                        "title": PLAYLIST_TITLE,
                        "description": PLAYLIST_DESCRIPTION,
                        "defaultLanguage": "de",
                    },
                    "status": {"privacyStatus": privacy},
                },
            )
            .execute()
        )
        playlist_id = created["id"]
        print(f"✔ Neue Playlist erstellt: {PLAYLIST_TITLE} ({playlist_id})")
        return playlist_id, set()

    existing_video_ids: set[str] = set()
    page_token = None
    try:
        while True:
            items_resp = (
                youtube.playlistItems()
                .list(
                    part="contentDetails",
                    playlistId=playlist_id,
                    maxResults=50,
                    pageToken=page_token,
                )
                .execute()
            )
            for item in items_resp.get("items", []):
                vid = item.get("contentDetails", {}).get("videoId")
                if vid:
                    existing_video_ids.add(vid)
            page_token = items_resp.get("nextPageToken")
            if not page_token:
                break
    except HttpError as err:
        if err.resp.status == 404:
            existing_video_ids = set()
        else:
            raise

    return playlist_id, existing_video_ids


def video_exists_on_youtube(youtube, video_id: str) -> bool:
    if not video_id:
        return False
    resp = youtube.videos().list(part="id", id=video_id).execute()
    return len(resp.get("items", [])) > 0


def upload_resumable_video(youtube, video_path: Path, spec: dict, privacy: str) -> str:
    media = MediaFileUpload(
        str(video_path),
        mimetype="video/mp4",
        chunksize=4 * 1024 * 1024,
        resumable=True,
    )
    title = spec["title"]
    if len(title) > 100:
        title = title[:97] + "..."

    desc = spec["description"]
    if AI_TRANSPARENCY_NOTICE not in desc:
        desc = desc.strip() + AI_TRANSPARENCY_NOTICE

    request = youtube.videos().insert(
        part="snippet,status",
        body={
            "snippet": {
                "title": title,
                "description": desc,
                "tags": spec["tags"],
                "categoryId": "27",
                "defaultLanguage": "de",
                "defaultAudioLanguage": "de",
            },
            "status": {
                "privacyStatus": privacy,
                "selfDeclaredMadeForKids": False,
                "containsSyntheticMedia": True,
                "embeddable": True,
            },
        },
        media_body=media,
    )

    response = None
    retry = 0
    while response is None:
        try:
            status, response = request.next_chunk()
            if status:
                pct = int(status.progress() * 100)
                print(f"   Upload {spec['video_file']}: {pct}%")
        except HttpError as err:
            if err.resp.status in (500, 502, 503, 504) and retry < 5:
                retry += 1
                time.sleep(2**retry)
                continue
            raise

    return response["id"]


def set_video_thumbnail(youtube, video_id: str, thumb_path: Path) -> bool:
    try:
        youtube.thumbnails().set(
            videoId=video_id,
            media_body=MediaFileUpload(str(thumb_path), mimetype="image/png", resumable=False),
        ).execute()
        return True
    except HttpError as err:
        if err.resp.status == 403:
            print(
                f"   ⚠️  Thumbnail für {video_id} übersprungen (HTTP 403): "
                "Eigene Thumbnails erfordern bei neuen Kanälen einmalige "
                "Telefon-Verifizierung unter https://www.youtube.com/verify"
            )
            return False
        raise


def validate_assets(assets_dir: Path, selected_specs: list[dict]) -> Path:
    banner_path = assets_dir / "00_Kanal_Banner_2560x1440.png"
    if not banner_path.exists():
        raise FileNotFoundError(f"Kanalbanner fehlt: {banner_path}")

    for spec in selected_specs:
        v_path = assets_dir / spec["video_file"]
        t_path = assets_dir / spec["thumb_file"]
        if not v_path.exists():
            raise FileNotFoundError(f"Video fehlt: {v_path}")
        if not t_path.exists():
            raise FileNotFoundError(f"Thumbnail fehlt: {t_path}")
        if t_path.stat().st_size >= 2 * 1024 * 1024:
            raise ValueError(f"Thumbnail überschreitet YouTube-Limit (2 MB): {t_path}")

    return banner_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Upload Gradus21 Guide videos to YouTube via Data API v3.")
    parser.add_argument(
        "--assets-dir",
        default=str(DEFAULT_ASSETS_DIR),
        help="Directory containing MP4 videos, banner, and thumbnails.",
    )
    parser.add_argument(
        "--privacy",
        choices=("public", "unlisted", "private"),
        default="public",
        help="YouTube visibility for uploaded videos and playlist (default: public).",
    )
    parser.add_argument(
        "--chapter",
        action="append",
        default=[],
        help="Optional chapter key(s) to upload (e.g. 01, 02).",
    )
    parser.add_argument(
        "--client-secret",
        default=None,
        help="Path to OAuth 2.0 client_secret JSON file.",
    )
    parser.add_argument(
        "--skip-channel-update",
        action="store_true",
        help="Skip uploading channel banner and updating channel description.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate all files and metadata without connecting to YouTube.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    assets_dir = Path(args.assets_dir).expanduser().resolve()

    selected_specs = (
        [s for s in VIDEO_SPECS if s["key"] in set(args.chapter)]
        if args.chapter
        else list(VIDEO_SPECS)
    )
    if not selected_specs:
        print(f"Keine passenden Kapitel für --chapter={args.chapter}", file=sys.stderr)
        return 1

    banner_path = validate_assets(assets_dir, selected_specs)

    if args.dry_run:
        secret = discover_client_secret(args.client_secret)
        print("==> [DRY-RUN] Alle lokalen Assets & Metadaten validiert:")
        print(f"    Assets-Ordner : {assets_dir}")
        print(f"    Kanalbanner   : {banner_path.name} ({banner_path.stat().st_size // 1024} KB)")
        print(f"    Playlist      : {PLAYLIST_TITLE} (Sichtbarkeit: {args.privacy})")
        for spec in selected_specs:
            v_size_mb = (assets_dir / spec["video_file"]).stat().st_size / (1024 * 1024)
            t_size_kb = (assets_dir / spec["thumb_file"]).stat().st_size / 1024
            print(
                f"    [{spec['key']}] {spec['video_file']} ({v_size_mb:.1f} MB) + "
                f"{spec['thumb_file']} ({t_size_kb:.0f} KB) -> {spec['title']}"
            )
        if secret:
            print(f"    OAuth-Secret  : gefunden ({secret})")
        else:
            print(
                f"    OAuth-Secret  : noch nicht vorhanden (erwartet unter {CLIENT_SECRET_DEST} "
                "oder ~/Downloads/client_secret*.json)"
            )
        return 0

    secret_path = discover_client_secret(args.client_secret)
    if not secret_path:
        print_oauth_setup_help()
        return 2

    youtube = get_youtube_client(secret_path)
    state_path = assets_dir / "youtube_uploaded_videos.json"
    state = load_state(state_path)

    if not args.skip_channel_update:
        ch_info = update_channel_branding(youtube, banner_path)
        state["channel_id"] = ch_info["id"]
        state["channel_title"] = ch_info["title"]
        save_state(state_path, state)

    playlist_id, existing_playlist_vids = ensure_playlist(youtube, args.privacy)
    state["playlist_id"] = playlist_id
    state["playlist_url"] = f"https://www.youtube.com/playlist?list={playlist_id}"
    save_state(state_path, state)

    for spec in selected_specs:
        key = spec["key"]
        video_path = assets_dir / spec["video_file"]
        thumb_path = assets_dir / spec["thumb_file"]
        entry = state.setdefault("videos", {}).get(key, {})
        video_id = entry.get("video_id")

        if video_id and video_exists_on_youtube(youtube, video_id):
            print(f"✔ [{key}] Bereits hochgeladen: https://youtu.be/{video_id}")
        else:
            print(f"==> [{key}] Lade hoch: {spec['video_file']}...")
            video_id = upload_resumable_video(youtube, video_path, spec, args.privacy)
            entry = {
                "video_id": video_id,
                "url": f"https://youtu.be/{video_id}",
                "title": spec["title"],
                "thumbnail_applied": False,
                "in_playlist": False,
            }
            state["videos"][key] = entry
            save_state(state_path, state)
            print(f"✔ [{key}] Hochgeladen: https://youtu.be/{video_id}")

        if not entry.get("thumbnail_applied"):
            ok = set_video_thumbnail(youtube, video_id, thumb_path)
            if ok:
                entry["thumbnail_applied"] = True
                save_state(state_path, state)
                print(f"✔ [{key}] Thumbnail gesetzt: {thumb_path.name}")

        if video_id not in existing_playlist_vids:
            for attempt in range(5):
                try:
                    youtube.playlistItems().insert(
                        part="snippet",
                        body={
                            "snippet": {
                                "playlistId": playlist_id,
                                "position": spec["position"],
                                "resourceId": {"kind": "youtube#video", "videoId": video_id},
                            }
                        },
                    ).execute()
                    existing_playlist_vids.add(video_id)
                    entry["in_playlist"] = True
                    save_state(state_path, state)
                    print(f"✔ [{key}] Zur Playlist hinzugefügt (Position {spec['position'] + 1})")
                    break
                except HttpError as err:
                    if err.resp.status in (404, 500, 503) and attempt < 4:
                        time.sleep(2 * (attempt + 1))
                        continue
                    raise

    print("\n🎉 Fertig! Übersicht aller hochgeladenen Gradus21-Videos:")
    print(f"   Playlist: {state['playlist_url']}")
    for spec in selected_specs:
        v = state["videos"].get(spec["key"], {})
        print(f"   [{spec['key']}] {v.get('url')} — {spec['title']}")
    print(f"\nStatus gespeichert unter: {state_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
Gradus21 YouTube Starter-Kit Generator
Creates ready-to-upload assets in both:
- /home/julian/coding/gradus21/dist-videos/youtube-kit/
- /home/julian/Downloads/Gradus21-Guide-Videos/

Outputs:
1. 00_Kanal_Profilbild_800x800.png (800 x 800 RGB PNG)
2. 00_Kanal_Banner_2560x1440.png (2560 x 1440 RGB PNG, safe-area compliant 1546x423)
3. 6 video thumbnails (1280 x 720 RGB PNG < 2 MB) using real keyframes from the generated MP4s
4. YOUTUBE_SETUP_UND_TEXTE.md (copy-paste channel settings, titles, descriptions + timestamps, tags)
"""

import base64
import os
import shutil
import subprocess
from pathlib import Path
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
GUIDE_VIDEO_DIR = REPO_ROOT / "dist-videos" / "guide"
KIT_DIR = REPO_ROOT / "dist-videos" / "youtube-kit"
DOWNLOADS_DIR = Path.home() / "Downloads" / "Gradus21-Guide-Videos"

KIT_DIR.mkdir(parents=True, exist_ok=True)
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

CHROME_BIN = "/snap/bin/chromium"
FFMPEG_BIN = str(
    Path.home()
    / ".cache"
    / "gradus21-video-tools"
    / "node"
    / "node_modules"
    / "ffmpeg-static"
    / "ffmpeg"
)


def encode_b64(path: Path) -> str:
    ext = path.suffix.lower().replace(".", "")
    mime = (
        "image/png"
        if ext == "png"
        else "image/svg+xml"
        if ext == "svg"
        else "font/woff2"
        if ext == "woff2"
        else "image/jpeg"
    )
    with open(path, "rb") as f:
        return f"data:{mime};base64," + base64.b64encode(f.read()).decode("utf-8")


ICON_PNG = encode_b64(REPO_ROOT / "web" / "public" / "gradus21-app-icon.svg")
MAC_MATRIX = encode_b64(
    REPO_ROOT / "fastlane" / "screenshots_mac" / "de-DE" / "1_Mac_Matrix.png"
)

FONT_BOLD = encode_b64(
    REPO_ROOT.parent
    / "gradus21-website"
    / "assets"
    / "fonts"
    / "plus_jakarta_sans-800-latin.woff2"
)
FONT_SEMI = encode_b64(
    REPO_ROOT.parent
    / "gradus21-website"
    / "assets"
    / "fonts"
    / "plus_jakarta_sans-600-latin.woff2"
)
FONT_REG = encode_b64(
    REPO_ROOT.parent
    / "gradus21-website"
    / "assets"
    / "fonts"
    / "plus_jakarta_sans-400-latin.woff2"
)
FONT_MONO = encode_b64(
    REPO_ROOT.parent
    / "gradus21-website"
    / "assets"
    / "fonts"
    / "jetbrains_mono-600-latin.woff2"
)

BASE_CSS = f"""
@font-face {{
    font-family: 'Plus Jakarta Sans';
    src: url('{FONT_BOLD}') format('woff2');
    font-weight: 800;
    font-style: normal;
}}
@font-face {{
    font-family: 'Plus Jakarta Sans';
    src: url('{FONT_SEMI}') format('woff2');
    font-weight: 600;
    font-style: normal;
}}
@font-face {{
    font-family: 'Plus Jakarta Sans';
    src: url('{FONT_REG}') format('woff2');
    font-weight: 400;
    font-style: normal;
}}
@font-face {{
    font-family: 'JetBrains Mono';
    src: url('{FONT_MONO}') format('woff2');
    font-weight: 600;
    font-style: normal;
}}
* {{
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    -webkit-font-smoothing: antialiased;
}}
body {{
    background-color: #031726;
    color: #F8FAFC;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    overflow: hidden;
    position: relative;
}}
"""


def render_html_to_png(html_content: str, width: int, height: int, output_png: Path) -> None:
    temp_html = KIT_DIR / f"_temp_{output_png.stem}.html"
    temp_png = KIT_DIR / f"_raw_{output_png.stem}.png"
    try:
        temp_html.write_text(html_content, encoding="utf-8")
        cmd = [
            CHROME_BIN,
            "--headless",
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            f"--window-size={width},{height}",
            f"--screenshot={temp_png}",
            f"file://{temp_html}",
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        with Image.open(temp_png) as img:
            rgb_img = img.convert("RGB")
            if rgb_img.size != (width, height):
                rgb_img = rgb_img.resize((width, height), Image.Resampling.LANCZOS)
            rgb_img.save(output_png, format="PNG", optimize=True)
    finally:
        if temp_html.exists():
            temp_html.unlink()
        if temp_png.exists():
            temp_png.unlink()

    shutil.copy2(output_png, DOWNLOADS_DIR / output_png.name)
    size_kb = output_png.stat().st_size / 1024
    print(f"✔ {output_png.name} [{width}x{height}, {size_kb:.0f} KB]")


def extract_video_frame_b64(video_name: str, seek_seconds: float) -> str:
    video_path = GUIDE_VIDEO_DIR / video_name
    if not video_path.exists():
        raise FileNotFoundError(f"Video nicht gefunden: {video_path}")
    frame_path = KIT_DIR / f"_frame_{video_path.stem}.png"
    try:
        subprocess.run(
            [
                FFMPEG_BIN,
                "-y",
                "-ss",
                str(seek_seconds),
                "-i",
                str(video_path),
                "-vframes",
                "1",
                str(frame_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return encode_b64(frame_path)
    finally:
        if frame_path.exists():
            frame_path.unlink()


def render_profile_avatar() -> None:
    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{BASE_CSS}
body {{
    width: 800px;
    height: 800px;
    background: radial-gradient(560px 560px at 50% 42%, rgba(20, 184, 166, 0.34) 0%, rgba(8, 47, 73, 0.25) 58%, transparent 100%),
                linear-gradient(155deg, #02121E 0%, #062238 55%, #031726 100%);
    display: flex;
    align-items: center;
    justify-content: center;
}}
.ring-outer {{
    position: absolute;
    width: 660px;
    height: 660px;
    border-radius: 50%;
    border: 2px dashed rgba(94, 234, 212, 0.22);
}}
.ring-inner {{
    position: absolute;
    width: 560px;
    height: 560px;
    border-radius: 50%;
    border: 1.5px solid rgba(56, 189, 248, 0.18);
}}
.icon-frame {{
    position: relative;
    width: 520px;
    height: 520px;
    display: flex;
    align-items: center;
    justify-content: center;
}}
.icon-frame img {{
    width: 520px;
    height: 520px;
    display: block;
    filter: drop-shadow(0 28px 64px rgba(0, 0, 0, 0.65)) drop-shadow(0 0 54px rgba(45, 212, 191, 0.25));
}}
</style>
</head>
<body>
    <div class="ring-outer"></div>
    <div class="ring-inner"></div>
    <div class="icon-frame">
        <img src="{ICON_PNG}" alt="Gradus21">
    </div>
</body>
</html>"""
    render_html_to_png(html, 800, 800, KIT_DIR / "00_Kanal_Profilbild_800x800.png")


def render_channel_banner() -> None:
    # YouTube Banner 2560x1440: safe area on all devices is 1546x423 centered
    # -> left=507px, top=508.5px, width=1546px, height=423px
    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{BASE_CSS}
body {{
    width: 2560px;
    height: 1440px;
    background:
        radial-gradient(1200px 780px at 72% 50%, rgba(20, 184, 166, 0.30) 0%, rgba(8, 47, 73, 0.14) 65%, transparent 100%),
        radial-gradient(900px 650px at 26% 48%, rgba(56, 189, 248, 0.14) 0%, transparent 70%),
        linear-gradient(155deg, #02121E 0%, #062238 48%, #082F49 76%, #031726 100%);
    display: flex;
    align-items: center;
    justify-content: center;
}}
.bg-ring-1 {{
    position: absolute;
    width: 1700px;
    height: 1700px;
    border-radius: 50%;
    border: 2px dashed rgba(94, 234, 212, 0.09);
    right: -250px;
    top: -130px;
}}
.bg-ring-2 {{
    position: absolute;
    width: 1200px;
    height: 1200px;
    border-radius: 50%;
    border: 2px solid rgba(56, 189, 248, 0.08);
    left: -300px;
    bottom: -240px;
}}
/* Exact YouTube Safe Area: 1546 x 423 centered */
.safe-area {{
    width: 1546px;
    height: 423px;
    padding: 20px 36px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 44px;
    position: relative;
    z-index: 10;
}}
.left {{
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
}}
.brand-top {{
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 18px;
}}
.brand-icon {{
    width: 60px;
    height: 60px;
    filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45));
}}
.wordmark {{
    font-size: 38px;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: #FFFFFF;
    line-height: 1;
}}
.wordmark .accent {{
    background: linear-gradient(135deg, #5EEAD4 0%, #2DD4BF 55%, #38BDF8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}}
.e2ee-pill {{
    font-family: 'JetBrains Mono', monospace;
    font-size: 16px;
    font-weight: 600;
    color: #5EEAD4;
    background: rgba(15, 118, 110, 0.35);
    border: 1.5px solid rgba(94, 234, 212, 0.45);
    border-radius: 9999px;
    padding: 6px 16px;
    letter-spacing: 0.06em;
}}
h1 {{
    font-size: 46px;
    font-weight: 800;
    line-height: 1.12;
    letter-spacing: -0.03em;
    color: #FFFFFF;
    margin-bottom: 14px;
}}
h1 .highlight {{
    background: linear-gradient(135deg, #5EEAD4 0%, #2DD4BF 55%, #38BDF8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}}
p.sub {{
    font-size: 21px;
    font-weight: 600;
    color: #CBD5E1;
    letter-spacing: -0.01em;
    margin-bottom: 18px;
}}
.feature-row {{
    display: flex;
    flex-wrap: nowrap;
    gap: 12px;
}}
.chip {{
    font-size: 16px;
    font-weight: 600;
    color: #E2E8F0;
    background: rgba(8, 47, 73, 0.72);
    border: 1.5px solid rgba(56, 189, 248, 0.30);
    border-radius: 12px;
    padding: 8px 16px;
    white-space: nowrap;
}}
.right {{
    width: 530px;
    height: 356px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}}
.device-frame {{
    width: 520px;
    border-radius: 18px;
    overflow: hidden;
    border: 2px solid rgba(94, 234, 212, 0.42);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65), 0 0 50px rgba(45, 212, 191, 0.22);
    transform: perspective(1200px) rotateY(-8deg) rotateX(2deg);
    background: #0F172A;
}}
.device-frame img {{
    width: 100%;
    height: auto;
    display: block;
}}
</style>
</head>
<body>
    <div class="bg-ring-1"></div>
    <div class="bg-ring-2"></div>
    <div class="safe-area">
        <div class="left">
            <div class="brand-top">
                <img src="{ICON_PNG}" class="brand-icon" alt="Gradus21">
                <span class="wordmark">Gradus<span class="accent">21</span></span>
                <span class="e2ee-pill">ZERO-KNOWLEDGE E2EE</span>
            </div>
            <h1>Noten, Schnitte &amp; Zeugnisnoten – <span class="highlight">sicher an einem Ort.</span></h1>
            <p class="sub">Die datenschutzkonforme Excel-Alternative für Lehrkräfte · Lokal verschlüsselt</p>
            <div class="feature-row">
                <div class="chip">Klassen-Matrix</div>
                <div class="chip">Speed-Grading</div>
                <div class="chip">360°-Schülerakte</div>
                <div class="chip">Beamer-Schutz</div>
            </div>
        </div>
        <div class="right">
            <div class="device-frame">
                <img src="{MAC_MATRIX}" alt="Gradus21 Klassen-Matrix">
            </div>
        </div>
    </div>
</body>
</html>"""
    render_html_to_png(html, 2560, 1440, KIT_DIR / "00_Kanal_Banner_2560x1440.png")


THUMBNAIL_SPECS = [
    {
        "out_name": "01_Thumbnail_Schnellstart_und_Ueberblick.png",
        "video_name": "01_Schnellstart_und_Ueberblick.mp4",
        "seek_sec": 30.0,
        "badge": "KAPITEL 1 · SCHNELLSTART",
        "title_html": 'Alle 4 Modi im <span class="highlight">Überblick</span>',
        "subhead": "Matrix, Speed-Grading, 360°-Akte &amp; Baukasten in 100 Sekunden.",
        "pills": ["Klassen-Matrix", "Speed-Grading", "Beamer-Schutz"],
    },
    {
        "out_name": "02_Thumbnail_Erste_Klasse_und_Excel_Import.png",
        "video_name": "02_Erste_Klasse_und_Excel_Import.mp4",
        "seek_sec": 16.0,
        "badge": "KAPITEL 2 · KLASSEN-START",
        "title_html": 'Erste Klasse &amp; <span class="highlight">Excel-Import</span>',
        "subhead": ".xlsx-Listen per Drag &amp; Drop übernehmen und sofort starten.",
        "pills": [".xlsx Drag & Drop", "Spaltenerkennung", "Vorlagen"],
    },
    {
        "out_name": "03_Thumbnail_Eigenes_Bewertungsmodell.png",
        "video_name": "03_Eigenes_Bewertungsmodell.mp4",
        "seek_sec": 32.0,
        "badge": "KAPITEL 3 · KONFIGURATOR",
        "title_html": 'Gewichtung &amp; <span class="highlight">Notenschlüssel</span>',
        "subhead": "Kategorien, Streichnoten &amp; Binnendifferenzierung ohne Formeln.",
        "pills": ["Kategorien-Töpfe", "G / M / E Niveau", "Live-Sandbox"],
    },
    {
        "out_name": "04_Thumbnail_Speed_Grading_und_Notenspiegel.png",
        "video_name": "04_Speed_Grading_und_Notenspiegel.mp4",
        "seek_sec": 18.0,
        "badge": "KAPITEL 4 · KORREKTUR",
        "title_html": '<span class="highlight">Speed-Grading</span> &amp; Notenspiegel',
        "subhead": "Noten im Sekundentakt per Tastatur erfassen – inklusive Atteste.",
        "pills": ["Tastatur-Fokus", "Attest mit K", "Live-Schnitt"],
    },
    {
        "out_name": "05_Thumbnail_Schueler_360_Akte_und_Simulator.png",
        "video_name": "05_Schueler_360_Akte_und_Simulator.mp4",
        "seek_sec": 30.0,
        "badge": "KAPITEL 5 · ELTERNGESPRÄCH",
        "title_html": '360°-Schülerakte &amp; <span class="highlight">Simulator</span>',
        "subhead": "Stärkenprofil, Wunschnoten-Rechner &amp; DIN-A4-Elternbogen.",
        "pills": ["Stärkenprofil", "Wunschnoten-Rechner", "A4-Druckbogen"],
    },
    {
        "out_name": "06_Thumbnail_Datenschutz_und_Beamer_Schutz.png",
        "video_name": "06_Datenschutz_und_Beamer_Schutz.mp4",
        "seek_sec": 7.0,
        "badge": "KAPITEL 6 · DATENSCHUTZ",
        "title_html": '<span class="highlight">Beamer-Schutz</span> &amp; Sicherheit',
        "subhead": "Namen per Alt+P verbergen, lokal verschlüsseln &amp; offline arbeiten.",
        "pills": ["Alt+P Unschärfe", "Zero-Knowledge E2EE", "Offline-Backup"],
    },
]


def render_thumbnail(spec: dict) -> None:
    frame_b64 = extract_video_frame_b64(spec["video_name"], spec["seek_sec"])
    pills_html = "".join(f'<div class="pill">{p}</div>' for p in spec["pills"])

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{BASE_CSS}
body {{
    width: 1280px;
    height: 720px;
    background:
        radial-gradient(700px 540px at 78% 50%, rgba(20, 184, 166, 0.34) 0%, rgba(8, 47, 73, 0.14) 68%, transparent 100%),
        radial-gradient(520px 420px at 18% 24%, rgba(56, 189, 248, 0.16) 0%, transparent 72%),
        linear-gradient(155deg, #02121E 0%, #062238 48%, #082F49 78%, #031726 100%);
    padding: 52px 58px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 40px;
}}
.ring {{
    position: absolute;
    width: 900px;
    height: 900px;
    border-radius: 50%;
    border: 2px dashed rgba(94, 234, 212, 0.11);
    right: -180px;
    top: -90px;
}}
.left {{
    width: 550px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative;
    z-index: 10;
}}
.brand-row {{
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 24px;
}}
.brand-row img {{
    width: 52px;
    height: 52px;
    filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45));
}}
.wordmark {{
    font-size: 30px;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: #FFFFFF;
}}
.wordmark .accent {{
    background: linear-gradient(135deg, #5EEAD4 0%, #2DD4BF 55%, #38BDF8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}}
.badge {{
    display: inline-flex;
    align-items: center;
    width: fit-content;
    font-family: 'JetBrains Mono', monospace;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: #5EEAD4;
    background: rgba(15, 118, 110, 0.34);
    border: 1.5px solid rgba(94, 234, 212, 0.48);
    border-radius: 9999px;
    padding: 8px 20px;
    margin-bottom: 22px;
    box-shadow: 0 0 26px rgba(45, 212, 191, 0.22);
}}
h1 {{
    font-size: 56px;
    font-weight: 800;
    line-height: 1.08;
    letter-spacing: -0.035em;
    color: #FFFFFF;
    margin-bottom: 20px;
}}
h1 .highlight {{
    background: linear-gradient(135deg, #5EEAD4 0%, #2DD4BF 55%, #38BDF8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}}
p.sub {{
    font-size: 22px;
    font-weight: 400;
    line-height: 1.4;
    color: #CBD5E1;
    margin-bottom: 28px;
}}
.pills {{
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}}
.pill {{
    font-size: 17px;
    font-weight: 600;
    color: #F1F5F9;
    background: rgba(8, 47, 73, 0.72);
    border: 1.5px solid rgba(56, 189, 248, 0.32);
    border-radius: 12px;
    padding: 9px 16px;
}}
.right {{
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 10;
}}
.frame-card {{
    width: 590px;
    border-radius: 20px;
    overflow: hidden;
    border: 2.5px solid rgba(94, 234, 212, 0.45);
    box-shadow: 0 28px 70px rgba(0, 0, 0, 0.72), 0 0 60px rgba(45, 212, 191, 0.22);
    transform: perspective(1100px) rotateY(-6deg) rotateX(1.5deg);
    background: #0F172A;
}}
.frame-card img {{
    width: 100%;
    height: auto;
    display: block;
}}
.guide-tag {{
    position: absolute;
    bottom: -14px;
    right: 16px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    font-weight: 600;
    color: #031726;
    background: linear-gradient(135deg, #5EEAD4 0%, #2DD4BF 100%);
    padding: 7px 16px;
    border-radius: 9999px;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45);
}}
</style>
</head>
<body>
    <div class="ring"></div>
    <div class="left">
        <div class="brand-row">
            <img src="{ICON_PNG}" alt="Gradus21">
            <span class="wordmark">Gradus<span class="accent">21</span></span>
        </div>
        <div class="badge">{spec["badge"]}</div>
        <h1>{spec["title_html"]}</h1>
        <p class="sub">{spec["subhead"]}</p>
        <div class="pills">{pills_html}</div>
    </div>
    <div class="right">
        <div class="frame-card">
            <img src="{frame_b64}" alt="Gradus21 Vorschau">
        </div>
        <div class="guide-tag">DEUTSCHER VIDEO-GUIDE</div>
    </div>
</body>
</html>"""
    render_html_to_png(html, 1280, 720, KIT_DIR / spec["out_name"])


SETUP_DOC = """# YouTube-Kanal-Setup & Upload-Vorlagen für **Gradus21**

Alle Videos, Kanalgrafiken und Vorschaubilder liegen fertig in diesem Ordner.

---

## 1. Neuen YouTube-Kanal „Gradus21“ anlegen (ca. 1 Minute)

1. Öffne im Browser: **https://www.youtube.com/channel_switcher** (eingeloggt mit deinem gewünschten Google-Konto).
2. Klicke auf **„Kanal erstellen“**.
3. Kanalname eingeben: **`Gradus21`** → bestätigen.
4. Öffne danach **YouTube Studio** → **Anpassen** (*Customization*):
   - **Tab „Profil“ / Branding**:
     - **Profilbild hochladen**: `00_Kanal_Profilbild_800x800.png`
     - **Bannerbild hochladen**: `00_Kanal_Banner_2560x1440.png`
     - **Name**: `Gradus21`
     - **Handle**: `@Gradus21` (falls belegt z. B. `@Gradus21App`)
     - **Beschreibung** *(Copy & Paste)*:

```text
Gradus21 – Die datenschutzkonforme Notenverwaltung für Lehrkräfte.

Alle Noten, Schnitte und Zeugnisnoten sicher an einem Ort:
• Klassen-Matrix mit Live-Notenberechnung
• Speed-Grading per Tastatur nach der Korrektur
• 360°-Schülerakte für Elterngespräche inkl. A4-Druckbogen & Wunschnoten-Rechner
• Flexibler Gewichtungs-Baukasten ohne Excel-Formeln (inkl. G/M/E-Differenzierung)
• Beamer-Schutz (Alt+P) & echte Zero-Knowledge-Verschlüsselung direkt auf dem Gerät

🌐 Website & Downloads: https://gradus21.de
🔒 Datenschutz & AVV: https://gradus21.de/datenschutz
```

     - **Links**:
       - Titel: `Website & Download` → URL: `https://gradus21.de`
       - Titel: `Schul-Leitfaden & AVV` → URL: `https://gradus21.de/avv`
   - **Einstellungen → Kanal → Standardinformationen / Keywords**:
     `Gradus21, Notenverwaltung, Lehrer Software, Excel Alternative Lehrer, Notenrechner, Speed Grading, Zeugnisnoten, Datenschutz Schule, DSGVO Notenapp, Notenschlüssel`

---

## 2. Playlist anlegen

In YouTube Studio unter **Inhalte → Playlists → Neue Playlist**:
- **Titel**: `Gradus21 Funktions-Guide & Schnellstart`
- **Sichtbarkeit**: `Öffentlich`
- **Beschreibung**: `Alle 6 Kapitel des interaktiven Gradus21-Guides als kompakte Video-Tutorials auf Deutsch – vom Excel-Import über Speed-Grading und eigenen Notenschlüssel bis zum Beamer-Schutz.`

---

## 3. Die 6 Videos hochladen (Drag & Drop + Copy & Paste)

Du kannst in YouTube Studio oben rechts auf **Erstellen → Videos hochladen** klicken und alle 6 `.mp4`-Dateien gleichzeitig reinziehen. Danach einfach pro Video Titel, Beschreibung, Thumbnail und Tags übernehmen und zur Playlist **`Gradus21 Funktions-Guide & Schnellstart`** hinzufügen.

---

### Video 1: Schnellstart & Überblick (`01_Schnellstart_und_Ueberblick.mp4`)
- **Video-Datei**: `01_Schnellstart_und_Ueberblick.mp4`
- **Thumbnail**: `01_Thumbnail_Schnellstart_und_Ueberblick.png`
- **Titel**:
```text
Gradus21 Schnellstart: Alle 4 Arbeitsmodi in unter 2 Minuten | Kapitel 1
```
- **Beschreibung**:
```text
Lerne Gradus21 im Schnelldurchlauf kennen: Alle Noten, Schnitte und Zeugnisnoten an einem Ort – lokal verschlüsselt auf deinem Gerät.

In diesem Video siehst du alle vier Arbeitsmodi im Überblick sowie den Beamer-Schutz für das Klassenzimmer.

⏱️ Kapitel im Video:
00:00 Willkommen & Beispielklasse laden
00:17 Klasse anlegen oder Excel importieren
00:28 1. Klassen-Matrix (Gesamtübersicht)
00:45 2. Speed-Grading (Korrektur per Tastatur)
01:02 3. Schüler-360°-Akte (Elterngespräch & Simulator)
01:17 4. Gewichtungs-Baukasten (ohne Formeln)
01:35 Beamer-Schutz (Alt+P) testen

🔗 Mehr Infos & Download: https://gradus21.de
📺 Alle Guide-Kapitel in der Playlist: Gradus21 Funktions-Guide & Schnellstart
```
- **Tags**:
```text
Gradus21, Notenverwaltung, Lehrer App, Excel Alternative Lehrer, Schnellstart, Klassenmatrix, Speed Grading, Beamer Schutz, DSGVO
```

---

### Video 2: Erste Klasse & Excel-Import (`02_Erste_Klasse_und_Excel_Import.mp4`)
- **Video-Datei**: `02_Erste_Klasse_und_Excel_Import.mp4`
- **Thumbnail**: `02_Thumbnail_Erste_Klasse_und_Excel_Import.png`
- **Titel**:
```text
Erste Klasse anlegen & Excel-Listen (.xlsx) importieren | Gradus21 Guide (Kapitel 2)
```
- **Beschreibung**:
```text
So übernimmst du bestehende Klassenlisten aus Excel in Sekunden nach Gradus21 oder startest direkt mit der integrierten Beispielklasse.

⏱️ Kapitel im Video:
00:00 Neue Klasse starten & Import öffnen
00:14 Automatische Spaltenerkennung & Beispielklasse
00:29 Schüler:innen & Prüfungen im Halbjahr verwalten

🔗 Mehr Infos & Download: https://gradus21.de
```
- **Tags**:
```text
Gradus21, Excel Import, Klassenliste importieren, Notenliste Excel, Lehrer Software, Klassenverwaltung
```

---

### Video 3: Eigenes Bewertungsmodell & Notenschlüssel (`03_Eigenes_Bewertungsmodell.mp4`)
- **Video-Datei**: `03_Eigenes_Bewertungsmodell.mp4`
- **Thumbnail**: `03_Thumbnail_Eigenes_Bewertungsmodell.png`
- **Titel**:
```text
Gewichtung, Notenschlüssel & G/M/E-Differenzierung ohne Formeln | Gradus21 Guide (Kapitel 3)
```
- **Beschreibung**:
```text
Stelle deinen eigenen Fach-Notenschlüssel, Kategorien-Gewichtungen und Streichnoten einfach per Schieberegler ein – ganz ohne fehleranfällige Tabellenformeln.

⏱️ Kapitel im Video:
00:00 Der Gewichtungs-Baukasten
00:13 1. Kategorien & Streichnoten festlegen
00:29 2. Notenschlüssel & Binnendifferenzierung (G / M / E)
00:47 3. Basis-Setup & Skala (1–6 oder 0–15 Punkte)
00:59 4. Live-Check, Sandbox & Vorlagen speichern

🔗 Mehr Infos & Download: https://gradus21.de
```
- **Tags**:
```text
Gradus21, Notenschlüssel, Gewichtung Noten, Binnendifferenzierung, Streichnoten, Oberstufe 15 Punkte, Bewertungsmodell
```

---

### Video 4: Speed-Grading & Live-Notenspiegel (`04_Speed_Grading_und_Notenspiegel.mp4`)
- **Video-Datei**: `04_Speed_Grading_und_Notenspiegel.mp4`
- **Thumbnail**: `04_Thumbnail_Speed_Grading_und_Notenspiegel.png`
- **Titel**:
```text
Speed-Grading: Arbeiten in Sekunden eintragen & Notenspiegel live prüfen | Gradus21 Guide (Kapitel 4)
```
- **Beschreibung**:
```text
Klassenarbeit oder Test korrigiert? Im Speed-Grading-Modus trägst du Prozent, Rohpunkte oder Direktnoten blitzschnell per Tastatur ein und behältst den Notenspiegel live im Blick.

⏱️ Kapitel im Video:
00:00 Fokus auf eine einzelne Prüfung
00:14 Tastatur-Navigation (Enter) & Attest-Vermerk (K)
00:26 Live-Notenspiegel & Maßstab direkt anpassen

🔗 Mehr Infos & Download: https://gradus21.de
```
- **Tags**:
```text
Gradus21, Speed Grading, Notenspiegel, Klassenarbeit eintragen, Notenrechner, Korrekturhilfe Lehrer
```

---

### Video 5: Schüler-360°-Akte & Wunschnoten-Simulator (`05_Schueler_360_Akte_und_Simulator.mp4`)
- **Video-Datei**: `05_Schueler_360_Akte_und_Simulator.mp4`
- **Thumbnail**: `05_Thumbnail_Schueler_360_Akte_und_Simulator.png`
- **Titel**:
```text
360°-Schülerakte, Wunschnoten-Rechner & Elternsprechtagsbogen | Gradus21 Guide (Kapitel 5)
```
- **Beschreibung**:
```text
Perfekt vorbereitet ins Elterngespräch: Alle Einzelnoten, der Vergleich zwischen Schriftlich und Mündlich, der Was-wäre-wenn-Wunschnoten-Rechner und der druckfertige DIN-A4-Bogen mit einem Klick.

⏱️ Kapitel im Video:
00:00 Die 360°-Akte im Überblick
00:16 Stärken & Schwächen im Klassenvergleich
00:26 Wunschnoten-Rechner (Was-wäre-wenn-Simulator)
00:40 Elternsprechtagsbogen als DIN-A4 drucken

🔗 Mehr Infos & Download: https://gradus21.de
```
- **Tags**:
```text
Gradus21, Schülerakte, Elterngespräch, Elternsprechtag, Wunschnoten Rechner, Was wäre wenn Simulator
```

---

### Video 6: Datenschutz & Beamer-Schutz (`06_Datenschutz_und_Beamer_Schutz.mp4`)
- **Video-Datei**: `06_Datenschutz_und_Beamer_Schutz.mp4`
- **Thumbnail**: `06_Thumbnail_Datenschutz_und_Beamer_Schutz.png`
- **Titel**:
```text
Datenschutz in der Schule: Beamer-Schutz (Alt+P) & Zero-Knowledge-Tresor | Gradus21 Guide (Kapitel 6)
```
- **Beschreibung**:
```text
Schülerdaten gehören geschützt – auch im Klassenzimmer. Sieh dir an, wie du mit Alt+P sofort alle Namen und Noten unscharf stellst, komplett offline arbeitest und deine Daten per Zero-Knowledge-Verschlüsselung sicherst.

⏱️ Kapitel im Video:
00:00 Beamer-Schutz per Klick oder Alt+P
00:16 Lokale Zero-Knowledge-Verschlüsselung
00:27 Offline-Betrieb & automatisches Ordner-Backup
00:38 Verschlüsselter Cloud-Sync nur nach Wunsch

🔗 Mehr Infos & AVV-Leitfaden: https://gradus21.de/datenschutz
```
- **Tags**:
```text
Gradus21, Datenschutz Schule, DSGVO Lehrer, Beamer Schutz, Zero Knowledge, E2EE Verschlüsselung, Offline Notenverwaltung
```

---

## Checkliste vor dem Veröffentlichen in YouTube Studio
- **Zielgruppe** bei allen 6 Videos auf: *„Nein, es ist nicht speziell für Kinder erstellt“* setzen (Tool richtet sich an Lehrkräfte).
- **Sprache & Untertitel**: `Deutsch`.
- **Kategorie**: `Bildung` oder `Wissenschaft & Technik`.
"""


def write_setup_doc() -> None:
    (KIT_DIR / "YOUTUBE_SETUP_UND_TEXTE.md").write_text(SETUP_DOC, encoding="utf-8")
    (DOWNLOADS_DIR / "YOUTUBE_SETUP_UND_TEXTE.md").write_text(SETUP_DOC, encoding="utf-8")
    print("✔ YOUTUBE_SETUP_UND_TEXTE.md erstellt")


def main() -> None:
    render_profile_avatar()
    render_channel_banner()
    for spec in THUMBNAIL_SPECS:
        render_thumbnail(spec)
    write_setup_doc()
    print(f"\nFertig! YouTube-Starter-Kit liegt bereit unter:\n  - {DOWNLOADS_DIR}\n  - {KIT_DIR}")


if __name__ == "__main__":
    main()

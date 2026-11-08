#!/usr/bin/env python3
"""
Gradus21 Windows Store & Xbox Asset Generator
Renders production-ready creative assets according to Microsoft Store Partner Center Guidelines:

1. Windows and Xbox image — 16:9 Super hero art:
   - 1920 x 1080 px & 3840 x 2160 px
   - Strictly NO product title ('Gradus21' omitted, as Store PDP UI overlays title & action buttons)
   - Left safe area preserved for native Store UI overlay

2. Store logos — 9:16 Poster art:
   - 720 x 1080 px & 1440 x 2160 px
   - Required for Xbox & highly recommended for Windows 10/11
   - Features prominent product title & icon in upper 2/3

3. Store logos — 1:1 Box art:
   - 1080 x 1080 px & 2160 x 2160 px
   - Recommended for best display in store layouts & Xbox dashboard
   - Features centered brand icon, title, and floating feature showcase

Accepted file types: .png (< 50 MB, 24-bit RGB, opaque)
"""

import os
import sys
import shutil
import base64
import functools
import subprocess
from pathlib import Path
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR_WIN = REPO_ROOT / "dist-windows" / "store_assets"
OUTPUT_DIR_FASTLANE = REPO_ROOT / "fastlane" / "creative_assets" / "windows_store"

def get_chrome_bin():
    # 1. Environment variable override
    env_bin = os.environ.get("CHROME_BIN") or os.environ.get("CHROMIUM_BIN")
    if env_bin and (shutil.which(env_bin) or os.path.exists(env_bin)):
        return env_bin

    # 2. System PATH
    candidates = [
        "chromium",
        "google-chrome",
        "chrome",
        "chromium-browser",
        "msedge",
        "microsoft-edge",
    ]
    for name in candidates:
        found = shutil.which(name)
        if found:
            return found

    # 3. Known platform locations
    platform_paths = [
        # Linux
        "/snap/bin/chromium",
        "/usr/bin/chromium",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        # macOS
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        # Windows
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
    ]
    for p in platform_paths:
        if p and os.path.exists(p):
            return p

    raise RuntimeError(
        "Chromium, Chrome or Edge binary not found! Please install Chromium/Chrome/Edge or set CHROME_BIN."
    )

def encode_b64(path):
    if not path.exists():
        print(f"Warning: File not found: {path}", file=sys.stderr)
        return ""
    with open(path, "rb") as f:
        ext = path.suffix.lower().replace(".", "")
        mime = "image/png" if ext == "png" else "image/svg+xml" if ext == "svg" else "font/woff2" if ext == "woff2" else "image/jpeg"
        return f"data:{mime};base64," + base64.b64encode(f.read()).decode("utf-8")

@functools.lru_cache(maxsize=None)
def get_icon_png():
    return encode_b64(REPO_ROOT / "web" / "public" / "gradus21-app-icon.png")

@functools.lru_cache(maxsize=None)
def get_mac_matrix():
    return encode_b64(REPO_ROOT / "fastlane" / "screenshots_mac" / "de-DE" / "1_Mac_Matrix.png")

# Fonts (in-repo fonts preferred, fallback to website directory)
def resolve_font_path(local_name, website_name):
    local_path = REPO_ROOT / "web" / "public" / "fonts" / local_name
    if local_path.exists():
        return local_path
    website_path = REPO_ROOT.parent / "gradus21-website" / "assets" / "fonts" / website_name
    if website_path.exists():
        return website_path
    return local_path

@functools.lru_cache(maxsize=None)
def get_base_css():
    font_bold = encode_b64(resolve_font_path("plus_jakarta_sans-800-43.woff2", "plus_jakarta_sans-800-latin.woff2"))
    font_semi = encode_b64(resolve_font_path("plus_jakarta_sans-600-35.woff2", "plus_jakarta_sans-600-latin.woff2"))
    font_reg  = encode_b64(resolve_font_path("plus_jakarta_sans-400-27.woff2", "plus_jakarta_sans-400-latin.woff2"))
    font_mono = encode_b64(resolve_font_path("jetbrains_mono-600-17.woff2", "jetbrains_mono-600-latin.woff2"))

    return f"""
@font-face {{
    font-family: 'Plus Jakarta Sans';
    src: url('{font_bold}') format('woff2');
    font-weight: 800;
    font-style: normal;
}}
@font-face {{
    font-family: 'Plus Jakarta Sans';
    src: url('{font_semi}') format('woff2');
    font-weight: 600;
    font-style: normal;
}}
@font-face {{
    font-family: 'Plus Jakarta Sans';
    src: url('{font_reg}') format('woff2');
    font-weight: 400;
    font-style: normal;
}}
@font-face {{
    font-family: 'JetBrains Mono';
    src: url('{font_mono}') format('woff2');
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
    background-color: #020C14;
    color: #F8FAFC;
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
    overflow: hidden;
    position: relative;
}}

.highlight {{
    background: linear-gradient(135deg, #5EEAD4 0%, #2DD4BF 55%, #38BDF8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}}

.hero-badge, .poster-badge, .box-badge {{
    display: inline-flex;
    align-items: center;
    background: rgba(15, 118, 110, 0.28);
    border: 2px solid rgba(94, 234, 212, 0.45);
    box-shadow: 0 0 35px rgba(45, 212, 191, 0.25);
    border-radius: 9999px;
    font-weight: 700;
    color: #5EEAD4;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}}

.pill-tag, .poster-pill, .box-pill {{
    display: inline-flex;
    align-items: center;
    background: rgba(8, 47, 73, 0.65);
    border: 1.5px solid rgba(56, 189, 248, 0.3);
    backdrop-filter: blur(14px);
    font-weight: 600;
    color: #E2E8F0;
}}

.floating-glass-card, .poster-floating-card, .box-floating-card {{
    position: absolute;
    background: rgba(6, 26, 43, 0.88);
    backdrop-filter: blur(28px);
    border: 2px solid rgba(94, 234, 212, 0.5);
    box-shadow: 0 35px 80px rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    z-index: 30;
}}
"""

def render_html_to_png(html_content, width_high, height_high, output_png_high, width_low, height_low, output_png_low, chrome_bin=None):
    chrome = chrome_bin or get_chrome_bin()
    OUTPUT_DIR_WIN.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR_FASTLANE.mkdir(parents=True, exist_ok=True)

    temp_html = OUTPUT_DIR_WIN / f"_temp_{output_png_high.stem}.html"
    temp_png = OUTPUT_DIR_WIN / f"_raw_{output_png_high.stem}.png"

    try:
        with open(temp_html, "w", encoding="utf-8") as f:
            f.write(html_content)

        cmd = [
            chrome,
            "--headless=new",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            f"--window-size={width_high},{height_high}",
            f"--screenshot={temp_png}",
            temp_html.as_uri()
        ]
        subprocess.run(cmd, check=True)

        # Post-process with Pillow: High-Res
        with Image.open(temp_png) as img:
            rgb_img = img.convert("RGB")
            if rgb_img.size != (width_high, height_high):
                rgb_img = rgb_img.resize((width_high, height_high), Image.Resampling.LANCZOS)
            rgb_img.save(output_png_high, format="PNG", optimize=True)
            size_high_mb = output_png_high.stat().st_size / (1024 * 1024)
            print(f"✓ Generated High-Res: {output_png_high.name} [{width_high}x{height_high}, RGB, {size_high_mb:.2f} MB]")

            # Downsample to target low-res with Lanczos
            img_low = rgb_img.resize((width_low, height_low), Image.Resampling.LANCZOS)
            img_low.save(output_png_low, format="PNG", optimize=True)
            size_low_mb = output_png_low.stat().st_size / (1024 * 1024)
            print(f"✓ Generated Standard: {output_png_low.name} [{width_low}x{height_low}, RGB, {size_low_mb:.2f} MB]")

        # Mirror to fastlane directory
        shutil.copy2(output_png_high, OUTPUT_DIR_FASTLANE / output_png_high.name)
        shutil.copy2(output_png_low, OUTPUT_DIR_FASTLANE / output_png_low.name)
    finally:
        if temp_html.exists():
            temp_html.unlink()
        if temp_png.exists():
            temp_png.unlink()

# =========================================================================
# 1. Windows and Xbox 16:9 Super Hero Art (3840x2160 & 1920x1080)
# =========================================================================

def get_super_hero_art_html(screen_b64=None, active_tab_name="Englisch • Klasse 9b", accent_color="#2DD4BF", subtle_tilt=True):
    """
    Renders the 16:9 Super Hero Art strictly compliant with Microsoft Store PDP specs:
    - Left 42% is calm, clean negative space dedicated to native Store UI overlays (Icon, Title, 'Open' CTA, Description)
    - Right 58% stages an elevated Windows 11 Fluent frame displaying the Gradus21 interface
    - Zero tiny raster text in the banner to prevent unreadable, muddy rendering in responsive viewports
    - Seamless dark obsidian/slate background with soft directional emerald/teal lighting
    """
    if screen_b64 is None:
        screen_b64 = get_mac_matrix()
    icon_b64 = get_icon_png()

    transform_style = "perspective(2800px) rotateY(-4.5deg) rotateX(1.8deg)" if subtle_tilt else "none"

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{get_base_css()}

body {{
    width: 3840px;
    height: 2160px;
    background-color: #060A10;
    background-image: 
        radial-gradient(1700px 1300px at 75% 50%, rgba(20, 184, 166, 0.22) 0%, rgba(14, 116, 144, 0.08) 50%, transparent 75%),
        radial-gradient(1100px 800px at 92% 18%, rgba(56, 189, 248, 0.12) 0%, transparent 60%),
        radial-gradient(1300px 1000px at 15% 50%, #030609 0%, #060A10 100%);
    position: relative;
    overflow: hidden;
    margin: 0;
    padding: 0;
}}

/* Left Safe Zone (0 - 45%): Left strictly empty for native Store PDP UI */

/* Right Showcase Zone */
.stage-container {{
    position: absolute;
    right: 120px;
    top: 50%;
    transform: translateY(-50%);
    width: 2100px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}}

.app-window {{
    width: 2040px;
    height: 1330px;
    background: #0D1622;
    border-radius: 24px;
    border: 2px solid rgba(255, 255, 255, 0.18);
    box-shadow: 
        0 60px 160px rgba(0, 0, 0, 0.88),
        0 25px 50px rgba(0, 0, 0, 0.6),
        0 0 110px rgba(45, 212, 191, 0.20);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transform: {transform_style};
    position: relative;
}}

/* Windows 11 Titlebar */
.titlebar {{
    height: 64px;
    background: #0F1B2B;
    border-bottom: 1.5px solid rgba(255, 255, 255, 0.09);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
}}

.titlebar-brand {{
    display: flex;
    align-items: center;
    gap: 14px;
}}

.titlebar-icon {{
    width: 26px;
    height: 26px;
    border-radius: 6px;
}}

.titlebar-text {{
    font-size: 20px;
    font-weight: 600;
    color: #F1F5F9;
    letter-spacing: -0.01em;
}}

.titlebar-tab {{
    font-size: 17px;
    font-weight: 600;
    color: #5EEAD4;
    background: rgba(45, 212, 191, 0.14);
    border: 1px solid rgba(94, 234, 212, 0.35);
    padding: 4px 16px;
    border-radius: 6px;
    margin-left: 12px;
}}

.titlebar-controls {{
    display: flex;
    align-items: center;
    gap: 22px;
    color: #94A3B8;
    font-size: 18px;
}}

.screen-area {{
    width: 100%;
    flex: 1;
    overflow: hidden;
    background: #FFFFFF;
}}

.screen-area img {{
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top left;
    display: block;
}}

/* Single discreet accent badge on bottom-left of window */
.floating-accent {{
    position: absolute;
    bottom: -22px;
    left: 40px;
    background: rgba(10, 20, 30, 0.94);
    backdrop-filter: blur(20px);
    border: 1.5px solid rgba(94, 234, 212, 0.5);
    border-radius: 9999px;
    padding: 14px 32px;
    display: flex;
    align-items: center;
    gap: 14px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
    z-index: 50;
}}

.accent-indicator {{
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #2DD4BF;
    box-shadow: 0 0 12px #2DD4BF;
}}

.accent-title {{
    font-size: 20px;
    font-weight: 700;
    color: #FFFFFF;
}}

.accent-tag {{
    font-size: 18px;
    font-weight: 600;
    color: #5EEAD4;
    font-family: 'JetBrains Mono', monospace;
}}

/* Smooth bottom scrim for store content transition */
.bottom-scrim {{
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 280px;
    background: linear-gradient(to bottom, transparent 0%, rgba(6, 10, 16, 0.5) 50%, #060A10 100%);
    pointer-events: none;
    z-index: 20;
}}
</style>
</head>
<body>

<div class="stage-container">
    <div class="app-window">
        <div class="titlebar">
            <div class="titlebar-brand">
                <img src="{icon_b64}" class="titlebar-icon" alt="">
                <div class="titlebar-text">Gradus21</div>
                <div class="titlebar-tab">{active_tab_name}</div>
            </div>
            <div class="titlebar-controls">
                <div>—</div>
                <div>▢</div>
                <div>✕</div>
            </div>
        </div>
        <div class="screen-area">
            <img src="{screen_b64}" alt="Gradus21 Notenmatrix">
        </div>
    </div>

    <div class="floating-accent">
        <div class="accent-indicator"></div>
        <div class="accent-title">100 % Offline-First</div>
        <div class="accent-tag">• Zero-Knowledge E2EE</div>
    </div>
</div>

<div class="bottom-scrim"></div>

</body>
</html>"""

# =========================================================================
# 2. Store Logos — 9:16 Poster Art (1440x2160 & 720x1080)
# =========================================================================

def get_poster_art_html():
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{get_base_css()}

body {{
    width: 1440px;
    height: 2160px;
    background: radial-gradient(1000px 900px at 50% 25%, rgba(15, 118, 110, 0.45) 0%, rgba(8, 47, 73, 0.12) 60%, transparent 100%),
                radial-gradient(800px 700px at 80% 85%, rgba(56, 189, 248, 0.18) 0%, transparent 70%),
                linear-gradient(175deg, #020C14 0%, #061A2B 35%, #08283E 70%, #031422 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 100px 80px 90px 80px;
    text-align: center;
}}

/* Top Brand & Title Section (Upper 1/3) */
.poster-top {{
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    z-index: 10;
}}

.poster-badge {{
    padding: 12px 32px;
    font-size: 20px;
    margin-bottom: 32px;
}}

.poster-brand-row {{
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 28px;
    margin-bottom: 16px;
}}

.poster-app-icon {{
    width: 140px;
    height: 140px;
    border-radius: 34px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), 0 0 40px rgba(45, 212, 191, 0.35);
    border: 2.5px solid rgba(94, 234, 212, 0.5);
}}

.poster-title {{
    font-size: 110px;
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -0.04em;
    color: #FFFFFF;
}}

.poster-subtitle {{
    font-size: 34px;
    font-weight: 500;
    color: #94A3B8;
    letter-spacing: -0.01em;
    margin-bottom: 40px;
}}

/* Middle Showcase Frame (Center) */
.poster-showcase {{
    position: relative;
    width: 1240px;
    height: 860px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 15;
}}

.poster-mockup-frame {{
    width: 1180px;
    height: 740px;
    background: #0A141E;
    border-radius: 24px;
    border: 2.5px solid rgba(255, 255, 255, 0.15);
    box-shadow: 0 40px 100px rgba(0, 0, 0, 0.8), 0 0 70px rgba(45, 212, 191, 0.25);
    overflow: hidden;
    position: relative;
    transform: perspective(1400px) rotateX(4deg);
}}

.poster-mockup-frame img {{
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top left;
    display: block;
}}

/* Floating feature chips */
.poster-floating-card {{
    border-radius: 20px;
    padding: 18px 28px;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.65);
    gap: 18px;
}}

.pfc-top {{
    top: 10px;
    right: 0px;
    border-color: rgba(56, 189, 248, 0.55);
}}

.pfc-bot {{
    bottom: 10px;
    left: 0px;
}}

.pfc-icon {{
    font-size: 28px;
}}

.pfc-text-title {{
    font-size: 22px;
    font-weight: 700;
    color: #FFFFFF;
    text-align: left;
}}

.pfc-text-sub {{
    font-size: 16px;
    font-weight: 500;
    color: #5EEAD4;
    font-family: 'JetBrains Mono', monospace;
    text-align: left;
}}

/* Bottom Feature Pills & Compliance Bar (Lower 1/3) */
.poster-bottom {{
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 22px;
    width: 100%;
    z-index: 20;
}}

.poster-pills-row {{
    display: flex;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
}}

.poster-pill {{
    border-radius: 14px;
    padding: 14px 26px;
    font-size: 22px;
}}

.poster-footer-caption {{
    font-size: 20px;
    font-weight: 500;
    color: #64748B;
    letter-spacing: 0.02em;
}}
</style>
</head>
<body>

<div class="poster-top">
    <div class="poster-badge">✦ ZERO-KNOWLEDGE E2EE • 100 % OFFLINE ✦</div>
    <div class="poster-brand-row">
        <img src="{get_icon_png()}" class="poster-app-icon" alt="Gradus21 Icon">
        <h1 class="poster-title">Gradus<span class="highlight">21</span></h1>
    </div>
    <div class="poster-subtitle">Formelfreie Notenverwaltung im 21. Jahrhundert</div>
</div>

<div class="poster-showcase">
    <div class="poster-mockup-frame">
        <img src="{get_mac_matrix()}" alt="Gradus21 Notenmatrix">
    </div>
    <div class="poster-floating-card pfc-top">
        <div class="pfc-icon">⚡</div>
        <div>
            <div class="pfc-text-title">Speed-Grading Tastatur</div>
            <div class="pfc-text-sub">30 Arbeiten in 4 Minuten</div>
        </div>
    </div>
    <div class="poster-floating-card pfc-bot">
        <div class="pfc-icon">📊</div>
        <div>
            <div class="pfc-text-title">Attest-Automatik</div>
            <div class="pfc-text-sub">Kein #DIV/0! Formelfehler</div>
        </div>
    </div>
</div>

<div class="poster-bottom">
    <div class="poster-pills-row">
        <div class="poster-pill">🛡️ 100 % DSGVO</div>
        <div class="poster-pill">🔒 AES-256-GCM</div>
        <div class="poster-pill">💻 100 % Offline</div>
    </div>
    <div class="poster-footer-caption">Entwickelt für zeitgemäßen Unterricht an deutschen Schulen</div>
</div>

</body>
</html>"""

# =========================================================================
# 3. Store Logos — 1:1 Box Art (2160x2160 & 1080x1080)
# =========================================================================

def get_box_art_html():
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{get_base_css()}

body {{
    width: 2160px;
    height: 2160px;
    background: radial-gradient(1300px 1100px at 50% 36%, rgba(15, 118, 110, 0.45) 0%, rgba(8, 47, 73, 0.15) 60%, transparent 100%),
                radial-gradient(1000px 800px at 85% 85%, rgba(56, 189, 248, 0.18) 0%, transparent 70%),
                linear-gradient(165deg, #020C14 0%, #061A2B 35%, #08283E 70%, #031422 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 130px 120px 110px 120px;
    text-align: center;
}}

/* Ambient circular glow lines */
.box-glow-ring {{
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    border: 2px dashed rgba(45, 212, 191, 0.16);
}}
.ring-1 {{ width: 1400px; height: 1400px; top: 120px; }}

.box-top-section {{
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 10;
}}

.box-badge {{
    padding: 14px 38px;
    font-size: 24px;
    margin-bottom: 40px;
}}

.box-icon-container {{
    position: relative;
    margin-bottom: 32px;
}}

.box-app-icon {{
    width: 240px;
    height: 240px;
    border-radius: 56px;
    border: 3.5px solid rgba(94, 234, 212, 0.55);
    box-shadow: 0 30px 70px rgba(0, 0, 0, 0.75), 0 0 60px rgba(45, 212, 191, 0.4);
}}

.box-title {{
    font-size: 140px;
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -0.04em;
    color: #FFFFFF;
    margin-bottom: 12px;
}}

.box-subtitle {{
    font-size: 38px;
    font-weight: 500;
    color: #94A3B8;
    letter-spacing: -0.01em;
}}

/* Center-Lower App Preview */
.box-showcase-section {{
    position: relative;
    width: 1840px;
    height: 820px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 15;
}}

.box-mockup-frame {{
    width: 1720px;
    height: 720px;
    background: #0A141E;
    border-radius: 26px;
    border: 3px solid rgba(255, 255, 255, 0.16);
    box-shadow: 0 45px 120px rgba(0, 0, 0, 0.85), 0 0 80px rgba(45, 212, 191, 0.25);
    overflow: hidden;
    position: relative;
    transform: perspective(1600px) rotateX(3deg);
}}

.box-mockup-frame img {{
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top left;
    display: block;
}}

/* Floating badges on corners */
.box-floating-card {{
    border-radius: 22px;
    padding: 20px 32px;
    gap: 20px;
}}

.bfc-right {{
    top: 20px;
    right: 0px;
    border-color: rgba(56, 189, 248, 0.55);
}}

.bfc-left {{
    bottom: 20px;
    left: 0px;
}}

.bfc-icon {{
    font-size: 30px;
}}

.bfc-text-title {{
    font-size: 24px;
    font-weight: 700;
    color: #FFFFFF;
    text-align: left;
}}

.bfc-text-sub {{
    font-size: 18px;
    font-weight: 500;
    color: #5EEAD4;
    font-family: 'JetBrains Mono', monospace;
    text-align: left;
}}

/* Bottom Feature Pills */
.box-bottom-section {{
    display: flex;
    justify-content: center;
    gap: 20px;
    width: 100%;
    z-index: 20;
}}

.box-pill {{
    border-radius: 16px;
    padding: 16px 32px;
    font-size: 24px;
}}
</style>
</head>
<body>

<div class="box-glow-ring ring-1"></div>

<div class="box-top-section">
    <div class="box-badge">✦ ZERO-KNOWLEDGE E2EE • 100 % OFFLINE ✦</div>
    <div class="box-icon-container">
        <img src="{get_icon_png()}" class="box-app-icon" alt="Gradus21 Icon">
    </div>
    <h1 class="box-title">Gradus<span class="highlight">21</span></h1>
    <div class="box-subtitle">Sichere &amp; formelfreie Notenverwaltung</div>
</div>

<div class="box-showcase-section">
    <div class="box-mockup-frame">
        <img src="{get_mac_matrix()}" alt="Gradus21 Notenmatrix">
    </div>
    <div class="box-floating-card bfc-right">
        <div class="bfc-icon">⚡</div>
        <div>
            <div class="bfc-text-title">Speed-Grading Tastatur</div>
            <div class="bfc-text-sub">Sekundenschnelle Eingabe</div>
        </div>
    </div>
    <div class="box-floating-card bfc-left">
        <div class="bfc-icon">📊</div>
        <div>
            <div class="bfc-text-title">Attest-Automatik</div>
            <div class="bfc-text-sub">Formelfreie Durchschnitte</div>
        </div>
    </div>
</div>

<div class="box-bottom-section">
    <div class="box-pill">⚡ Speed-Grading</div>
    <div class="box-pill">📊 Attest-Automatik</div>
    <div class="box-pill">🛡️ Zero-Knowledge E2EE</div>
    <div class="box-pill">💻 100 % Offline</div>
</div>

</body>
</html>"""

def main():
    chrome_bin = get_chrome_bin()
    OUTPUT_DIR_WIN.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR_FASTLANE.mkdir(parents=True, exist_ok=True)

    print("==================================================================")
    print("  Generating Windows Store & Xbox Graphics Package:")
    print("  1. 16:9 Super hero art (3840x2160 & 1920x1080) [NO Title]")
    print("  2. 9:16 Poster art    (1440x2160 & 720x1080)   [With Title]")
    print("  3. 1:1 Box art        (2160x2160 & 1080x1080)  [With Title]")
    print("==================================================================")

    # ---------------------------------------------------------------------
    # 1. 16:9 Super Hero Art (Strictly PDP-Compliant: Left Safe Area, Crisp Product Showcase)
    # ---------------------------------------------------------------------
    c1_html = get_super_hero_art_html(
        screen_b64=get_mac_matrix(),
        active_tab_name="Englisch • Klasse 9b",
        accent_color="#2DD4BF",
        subtle_tilt=True # Subtle Fluent isometric tilt (perspective 2800px, -4.5deg Y, 1.8deg X)
    )

    out_hero_4k = OUTPUT_DIR_WIN / "super_hero_art_3840x2160.png"
    out_hero_1080 = OUTPUT_DIR_WIN / "super_hero_art_1920x1080.png"
    render_html_to_png(c1_html, 3840, 2160, out_hero_4k, 1920, 1080, out_hero_1080, chrome_bin=chrome_bin)

    # ---------------------------------------------------------------------
    # 2. 9:16 Poster Art (Xbox Required & Windows 10/11 Main Logo)
    # ---------------------------------------------------------------------
    poster_html = get_poster_art_html()
    out_poster_high = OUTPUT_DIR_WIN / "poster_art_1440x2160.png"
    out_poster_low  = OUTPUT_DIR_WIN / "poster_art_720x1080.png"
    render_html_to_png(poster_html, 1440, 2160, out_poster_high, 720, 1080, out_poster_low, chrome_bin=chrome_bin)

    # ---------------------------------------------------------------------
    # 3. 1:1 Box Art (Store Layouts & Xbox Dashboard Tile)
    # ---------------------------------------------------------------------
    box_html = get_box_art_html()
    out_box_high = OUTPUT_DIR_WIN / "box_art_2160x2160.png"
    out_box_low  = OUTPUT_DIR_WIN / "box_art_1080x1080.png"
    render_html_to_png(box_html, 2160, 2160, out_box_high, 1080, 1080, out_box_low, chrome_bin=chrome_bin)

    print("\n✅ Successfully generated all Windows Store & Xbox graphics!")
    print(f"📁 Target directories:\n  - {OUTPUT_DIR_WIN}\n  - {OUTPUT_DIR_FASTLANE}")

if __name__ == "__main__":
    main()

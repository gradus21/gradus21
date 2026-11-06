#!/usr/bin/env python3
"""
Gradus21 Store Asset Generator
Renders production-ready creative assets according to Apple App Store Asset Best Practices:
1. Product Page Headers (21:9 — 3840 x 1646 px, Opaque RGB PNG)
2. Search Results Creative Assets (3:2 — 3840 x 2560 px, Opaque RGB PNG)
3. Google Play Feature Graphic (1024 x 500 px, Opaque RGB PNG)

Complies with:
- Apple App Store Asset Best Practices (https://developer.apple.com/app-store/asset-best-practices/)
- No alpha channel (strictly 24-bit RGB)
- Safe Area guidelines (top status bar overlay & bottom metadata fade buffer)
- 4+ Age rating compliance (no pricing, no external URLs, no prohibited claims)
"""

import os
import sys
import base64
import subprocess
from pathlib import Path
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "fastlane" / "creative_assets"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

CHROME_BIN = "/snap/bin/chromium"

def encode_b64(path):
    with open(path, "rb") as f:
        ext = path.suffix.lower().replace(".", "")
        mime = "image/png" if ext == "png" else "image/svg+xml" if ext == "svg" else "font/woff2" if ext == "woff2" else "image/jpeg"
        return f"data:{mime};base64," + base64.b64encode(f.read()).decode("utf-8")

# Assets
LOGO_SVG = encode_b64(REPO_ROOT / "web" / "public" / "gradus21-logo.svg")
ICON_PNG = encode_b64(REPO_ROOT / "web" / "public" / "gradus21-app-icon.png")
IPAD_MATRIX = encode_b64(REPO_ROOT / "fastlane" / "screenshots_ios" / "de-DE" / "1_iPadPro_Matrix.png")
IPAD_SPEED = encode_b64(REPO_ROOT / "fastlane" / "screenshots_ios" / "de-DE" / "2_iPadPro_SpeedGrading.png")
IPAD_360 = encode_b64(REPO_ROOT / "fastlane" / "screenshots_ios" / "de-DE" / "3_iPadPro_Student360.png")
IPHONE_SPEED = encode_b64(REPO_ROOT / "fastlane" / "screenshots_ios" / "de-DE" / "2_iPhone67_SpeedGrading.png")
MAC_MATRIX = encode_b64(REPO_ROOT / "fastlane" / "screenshots_mac" / "de-DE" / "1_Mac_Matrix.png")

# Fonts
FONT_BOLD = encode_b64(REPO_ROOT.parent / "gradus21-website" / "assets" / "fonts" / "plus_jakarta_sans-800-latin.woff2")
FONT_SEMI = encode_b64(REPO_ROOT.parent / "gradus21-website" / "assets" / "fonts" / "plus_jakarta_sans-600-latin.woff2")
FONT_REG  = encode_b64(REPO_ROOT.parent / "gradus21-website" / "assets" / "fonts" / "plus_jakarta_sans-400-latin.woff2")
FONT_MONO = encode_b64(REPO_ROOT.parent / "gradus21-website" / "assets" / "fonts" / "jetbrains_mono-600-latin.woff2")

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

def render_html_to_png(html_content, width, height, output_png):
    temp_html = OUTPUT_DIR / f"_temp_{output_png.stem}.html"
    with open(temp_html, "w", encoding="utf-8") as f:
        f.write(html_content)

    temp_png = OUTPUT_DIR / f"_raw_{output_png.stem}.png"
    
    cmd = [
        CHROME_BIN,
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        f"--window-size={width},{height}",
        f"--screenshot={temp_png}",
        f"file://{temp_html}"
    ]
    subprocess.run(cmd, check=True)
    temp_html.unlink()

    # Post-process with Pillow: Ensure RGB mode (NO alpha channel!), exact size
    with Image.open(temp_png) as img:
        rgb_img = img.convert("RGB")
        if rgb_img.size != (width, height):
            rgb_img = rgb_img.resize((width, height), Image.Resampling.LANCZOS)
        rgb_img.save(output_png, format="PNG", optimize=True)
    
    temp_png.unlink()
    print(f"Generated: {output_png.name} [{width}x{height}, RGB, Opaque]")

# ==========================================
# 1. Product Page Header Templates (21:9 - 3840x1646)
# ==========================================

def get_header_html(badge_text, title_html, subhead, tags, device_css, device_inner, accent_glow="#2DD4BF"):
    tags_html = "".join([f'<div class="pill-tag">{t}</div>' for t in tags])
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{BASE_CSS}
body {{
    width: 3840px;
    height: 1646px;
    background: radial-gradient(1200px 900px at 78% 45%, rgba(15, 118, 110, 0.38) 0%, rgba(8, 47, 73, 0.1) 70%, transparent 100%),
                radial-gradient(1000px 700px at 20% 30%, rgba(45, 212, 191, 0.15) 0%, transparent 70%),
                linear-gradient(160deg, #02121E 0%, #062238 45%, #082F49 75%, #031726 100%);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 160px;
}}

/* Safe Area Protection Grid */
.safe-container {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 100%;
    /* Top margin for iOS navigation controls, Bottom margin for App Store dock fade */
    padding-top: 140px;
    padding-bottom: 240px;
    position: relative;
    z-index: 10;
}}

/* Ambient Bottom Fade (Apple App Store metadata overlay safety) */
.bottom-ambient-fade {{
    position: absolute;
    bottom: 0;
    left: 0;
    width: 3840px;
    height: 480px;
    background: linear-gradient(to bottom, rgba(3, 23, 38, 0) 0%, rgba(3, 23, 38, 0.85) 60%, #031726 100%);
    pointer-events: none;
    z-index: 20;
}}

.left-content {{
    width: 1720px;
    display: flex;
    flex-direction: column;
    justify-content: center;
}}

.badge-wrapper {{
    display: inline-flex;
    align-items: center;
    gap: 16px;
    background: rgba(15, 118, 110, 0.25);
    border: 2px solid rgba(94, 234, 212, 0.4);
    box-shadow: 0 0 35px rgba(45, 212, 191, 0.25);
    border-radius: 9999px;
    padding: 14px 34px;
    font-size: 26px;
    font-weight: 700;
    color: #5EEAD4;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    width: fit-content;
    margin-bottom: 40px;
}}

.brand-row {{
    display: flex;
    align-items: center;
    gap: 28px;
    margin-bottom: 30px;
}}

.brand-logo-img {{
    height: 64px;
    width: auto;
    filter: drop-shadow(0 4px 18px rgba(45, 212, 191, 0.3));
}}

h1.hero-title {{
    font-size: 88px;
    font-weight: 800;
    line-height: 1.08;
    letter-spacing: -0.04em;
    color: #FFFFFF;
    margin-bottom: 36px;
}}

h1.hero-title .highlight {{
    background: linear-gradient(135deg, #5EEAD4 0%, #2DD4BF 50%, #38BDF8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}}

p.hero-subhead {{
    font-size: 34px;
    font-weight: 400;
    line-height: 1.45;
    color: #94A3B8;
    margin-bottom: 48px;
    max-width: 1540px;
}}

.tags-row {{
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
}}

.pill-tag {{
    display: inline-flex;
    align-items: center;
    background: rgba(8, 47, 73, 0.6);
    border: 1.5px solid rgba(56, 189, 248, 0.28);
    backdrop-filter: blur(12px);
    border-radius: 18px;
    padding: 16px 30px;
    font-size: 27px;
    font-weight: 600;
    color: #E2E8F0;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
}}

.right-showcase {{
    position: relative;
    width: 1720px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}}

/* Decorative background glowing rings */
.glow-ring {{
    position: absolute;
    border-radius: 50%;
    border: 2px dashed rgba(45, 212, 191, 0.18);
    pointer-events: none;
}}
.glow-ring-1 {{ width: 1400px; height: 1400px; }}
.glow-ring-2 {{ width: 1050px; height: 1050px; border-color: rgba(56, 189, 248, 0.22); }}

{device_css}
</style>
</head>
<body>
<div class="bottom-ambient-fade"></div>
<div class="safe-container">
    <div class="left-content">
        <div class="badge-wrapper">
            <span>{badge_text}</span>
        </div>
        <div class="brand-row">
            <img src="{LOGO_SVG}" class="brand-logo-img" alt="Gradus21">
        </div>
        <h1 class="hero-title">{title_html}</h1>
        <p class="hero-subhead">{subhead}</p>
        <div class="tags-row">
            {tags_html}
        </div>
    </div>
    <div class="right-showcase">
        <div class="glow-ring glow-ring-1"></div>
        <div class="glow-ring glow-ring-2"></div>
        {device_inner}
    </div>
</div>
</body>
</html>"""

# Device CSS and HTML snippets for Header
DEVICE_HEADER_CONCEPT1_CSS = f"""
.ipad-mockup {{
    position: relative;
    width: 1350px;
    height: 980px;
    background: #0B1118;
    border-radius: 46px;
    padding: 22px;
    box-shadow: 0 50px 120px rgba(0, 0, 0, 0.75), 0 0 60px rgba(45, 212, 191, 0.22);
    border: 3px solid rgba(255, 255, 255, 0.15);
    transform: perspective(1600px) rotateY(-8deg) rotateX(4deg) rotateZ(1deg);
    overflow: hidden;
}}

.ipad-screen {{
    width: 100%;
    height: 100%;
    border-radius: 28px;
    overflow: hidden;
    background: #082F49;
    position: relative;
}}

.ipad-screen img {{
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}}

/* Floating glass card */
.floating-glass-card {{
    position: absolute;
    bottom: -30px;
    left: -40px;
    background: rgba(8, 47, 73, 0.88);
    backdrop-filter: blur(28px);
    border: 2px solid rgba(94, 234, 212, 0.5);
    border-radius: 24px;
    padding: 26px 36px;
    box-shadow: 0 30px 70px rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    gap: 22px;
    z-index: 30;
    transform: perspective(1600px) rotateY(-4deg);
}}

.floating-glass-card-2 {{
    position: absolute;
    top: -20px;
    right: -20px;
    background: rgba(3, 23, 38, 0.9);
    backdrop-filter: blur(28px);
    border: 2px solid rgba(56, 189, 248, 0.45);
    border-radius: 22px;
    padding: 22px 32px;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    gap: 18px;
    z-index: 30;
}}

.card-icon-box {{
    width: 58px;
    height: 58px;
    border-radius: 16px;
    background: linear-gradient(135deg, #0F766E, #082F49);
    border: 1.5px solid #2DD4BF;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
}}
.card-text-title {{
    font-size: 24px;
    font-weight: 700;
    color: #F8FAFC;
    margin-bottom: 4px;
}}
.card-text-sub {{
    font-size: 19px;
    font-weight: 500;
    color: #5EEAD4;
    font-family: 'JetBrains Mono', monospace;
}}
"""

DEVICE_HEADER_CONCEPT1_INNER = f"""
<div class="ipad-mockup">
    <div class="ipad-screen">
        <img src="{IPAD_MATRIX}" alt="Gradus21 Notenmatrix">
    </div>
</div>
<div class="floating-glass-card">
    <div class="card-icon-box">📊</div>
    <div>
        <div class="card-text-title">Klasse 9b • Notenmatrix</div>
        <div class="card-text-sub">Ø 2,34 • Formelfrei &amp; Konferenzfertig</div>
    </div>
</div>
<div class="floating-glass-card-2">
    <div class="card-icon-box">✓</div>
    <div>
        <div class="card-text-title">Attest-Automatik</div>
        <div class="card-text-sub">Kein #DIV/0! Formelfehler</div>
    </div>
</div>
"""

# ==========================================
# 2. Search Results Templates (3:2 - 3840x2560)
# ==========================================

def get_search_html(badge_text, headline, subhead, screen_img, feature_cards):
    cards_html = "".join([f"""
    <div class="search-feature-card">
        <div class="sfc-icon">{c['icon']}</div>
        <div class="sfc-content">
            <div class="sfc-title">{c['title']}</div>
            <div class="sfc-desc">{c['desc']}</div>
        </div>
    </div>
    """ for c in feature_cards])

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{BASE_CSS}
body {{
    width: 3840px;
    height: 2560px;
    background: radial-gradient(1600px 1200px at 50% 20%, rgba(15, 118, 110, 0.35) 0%, rgba(8, 47, 73, 0.05) 75%, transparent 100%),
                radial-gradient(1400px 900px at 85% 80%, rgba(56, 189, 248, 0.18) 0%, transparent 70%),
                linear-gradient(175deg, #02101B 0%, #062035 40%, #082F49 70%, #031726 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 160px 180px 120px 180px;
}}

.top-hero-section {{
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 3400px;
    z-index: 10;
}}

.search-badge {{
    display: inline-flex;
    align-items: center;
    gap: 16px;
    background: rgba(15, 118, 110, 0.28);
    border: 2px solid rgba(94, 234, 212, 0.45);
    box-shadow: 0 0 40px rgba(45, 212, 191, 0.28);
    border-radius: 9999px;
    padding: 18px 46px;
    font-size: 32px;
    font-weight: 700;
    color: #5EEAD4;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 40px;
}}

.search-headline {{
    font-size: 130px;
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -0.04em;
    color: #FFFFFF;
    margin-bottom: 30px;
}}

.search-headline .hl-teal {{
    background: linear-gradient(135deg, #5EEAD4 0%, #2DD4BF 55%, #38BDF8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}}

.search-subhead {{
    font-size: 46px;
    font-weight: 400;
    line-height: 1.4;
    color: #94A3B8;
    max-width: 2800px;
    margin-bottom: 60px;
}}

.center-device-showcase {{
    position: relative;
    width: 2800px;
    height: 1320px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    z-index: 10;
}}

.ipad-search-frame {{
    width: 2500px;
    height: 1400px;
    background: #0A0F15;
    border-radius: 56px;
    padding: 24px;
    border: 3.5px solid rgba(255, 255, 255, 0.16);
    box-shadow: 0 60px 140px rgba(0, 0, 0, 0.8), 0 0 80px rgba(45, 212, 191, 0.2);
    overflow: hidden;
    position: relative;
}}

.ipad-search-screen {{
    width: 100%;
    height: 100%;
    border-radius: 36px;
    overflow: hidden;
    background: #082F49;
}}

.ipad-search-screen img {{
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}}

.bottom-feature-bar {{
    display: flex;
    justify-content: center;
    gap: 40px;
    width: 100%;
    max-width: 3400px;
    z-index: 20;
    margin-top: 40px;
}}

.search-feature-card {{
    flex: 1;
    background: rgba(8, 47, 73, 0.75);
    border: 2px solid rgba(56, 189, 248, 0.35);
    backdrop-filter: blur(20px);
    border-radius: 28px;
    padding: 34px 40px;
    display: flex;
    align-items: center;
    gap: 28px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
}}

.sfc-icon {{
    width: 76px;
    height: 76px;
    border-radius: 20px;
    background: linear-gradient(135deg, #0F766E, #031726);
    border: 2px solid #5EEAD4;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 38px;
    flex-shrink: 0;
}}

.sfc-title {{
    font-size: 32px;
    font-weight: 700;
    color: #FFFFFF;
    margin-bottom: 6px;
}}

.sfc-desc {{
    font-size: 24px;
    font-weight: 500;
    color: #94A3B8;
    line-height: 1.35;
}}
</style>
</head>
<body>
<div class="top-hero-section">
    <div class="search-badge">{badge_text}</div>
    <h1 class="search-headline">{headline}</h1>
    <p class="search-subhead">{subhead}</p>
</div>

<div class="center-device-showcase">
    <div class="ipad-search-frame">
        <div class="ipad-search-screen">
            <img src="{screen_img}" alt="Gradus21 Feature Screen">
        </div>
    </div>
</div>

<div class="bottom-feature-bar">
    {cards_html}
</div>
</body>
</html>"""

# ==========================================
# 3. Google Play Feature Graphic (1024x500)
# ==========================================

def get_google_play_html():
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{BASE_CSS}
body {{
    width: 1024px;
    height: 500px;
    background: radial-gradient(500px 350px at 75% 50%, rgba(15, 118, 110, 0.4) 0%, transparent 80%),
                linear-gradient(135deg, #02101B 0%, #062035 50%, #082F49 100%);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 60px;
}}

.gp-left {{
    width: 530px;
    display: flex;
    flex-direction: column;
}}

.gp-badge {{
    display: inline-flex;
    align-items: center;
    background: rgba(15, 118, 110, 0.3);
    border: 1.5px solid rgba(94, 234, 212, 0.45);
    border-radius: 9999px;
    padding: 6px 18px;
    font-size: 12px;
    font-weight: 700;
    color: #5EEAD4;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    width: fit-content;
    margin-bottom: 16px;
}}

.gp-title {{
    font-size: 40px;
    font-weight: 800;
    line-height: 1.12;
    color: #FFFFFF;
    margin-bottom: 12px;
    letter-spacing: -0.03em;
}}

.gp-title span {{
    color: #2DD4BF;
}}

.gp-sub {{
    font-size: 16px;
    color: #94A3B8;
    line-height: 1.4;
    margin-bottom: 22px;
}}

.gp-tags {{
    display: flex;
    gap: 10px;
}}

.gp-tag {{
    background: rgba(8, 47, 73, 0.7);
    border: 1px solid rgba(56, 189, 248, 0.3);
    border-radius: 10px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 600;
    color: #E2E8F0;
}}

.gp-right {{
    position: relative;
    width: 380px;
    height: 360px;
    display: flex;
    align-items: center;
    justify-content: center;
}}

.gp-mockup {{
    width: 370px;
    height: 250px;
    background: #0B1118;
    border-radius: 16px;
    padding: 8px;
    border: 2px solid rgba(255, 255, 255, 0.15);
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7), 0 0 30px rgba(45, 212, 191, 0.2);
    transform: perspective(1000px) rotateY(-8deg) rotateX(4deg);
    overflow: hidden;
}}

.gp-screen {{
    width: 100%;
    height: 100%;
    border-radius: 10px;
    overflow: hidden;
}}

.gp-screen img {{
    width: 100%;
    height: 100%;
    object-fit: cover;
}}
</style>
</head>
<body>
<div class="gp-left">
    <div class="gp-badge">ZERO-KNOWLEDGE E2EE • 100 % OFFLINE</div>
    <h1 class="gp-title">Gradus<span>21</span> Notenverwaltung</h1>
    <p class="gp-sub">Formelfrei, sicher und sekundenschnell. Entwickelt für moderne Lehrkräfte im 21. Jahrhundert.</p>
    <div class="gp-tags">
        <div class="gp-tag">✓ Speed-Grading</div>
        <div class="gp-tag">✓ Attest-Automatik</div>
        <div class="gp-tag">✓ Beamer-Schutz</div>
    </div>
</div>
<div class="gp-right">
    <div class="gp-mockup">
        <div class="gp-screen">
            <img src="{IPAD_MATRIX}" alt="Gradus21 Matrix">
        </div>
    </div>
</div>
</body>
</html>"""

def main():
    print("=== Generating Apple App Store & Google Play Creative Assets ===")

    # 1. Header Variant 1: Standard & Category Leader
    h1_title = 'Formelfreie Notenverwaltung im <span class="highlight">21. Jahrhundert.</span>'
    h1_sub = "100 % Offline-fähig. Automatische Attest-Skalierung ohne #DIV/0!-Fehler. Höchste deutsche Datenschutzstandards."
    h1_tags = ["⚡ Speed-Grading per Tastatur", "📊 Attest-Automatik & Streichnoten", "🛡️ Zero-Knowledge E2EE", "🖥️ Beamer-Schutz"]
    h1_html = get_header_html(
        badge_text="✦ DER NEUE STANDARD FÜR LEHRKRÄFTE ✦",
        title_html=h1_title,
        subhead=h1_sub,
        tags=h1_tags,
        device_css=DEVICE_HEADER_CONCEPT1_CSS,
        device_inner=DEVICE_HEADER_CONCEPT1_INNER,
        accent_glow="#2DD4BF"
    )
    render_html_to_png(h1_html, 3840, 1646, OUTPUT_DIR / "header_concept1_standard_21x9.png")

    # 2. Header Variant 2: Privacy & Zero-Knowledge
    h2_device_inner = f"""
    <div class="ipad-mockup" style="transform: perspective(1600px) rotateY(-6deg) rotateX(2deg);">
        <div class="ipad-screen">
            <img src="{MAC_MATRIX}" alt="Gradus21 Beamer-Schutz">
        </div>
    </div>
    <div class="floating-glass-card" style="border-color: rgba(94, 234, 212, 0.7); background: rgba(3, 23, 38, 0.95);">
        <div class="card-icon-box" style="border-color: #5EEAD4; background: linear-gradient(135deg, #0F766E, #02101B);">🔐</div>
        <div>
            <div class="card-text-title">Zero-Knowledge E2EE</div>
            <div class="card-text-sub">AES-256-GCM • Keine Klartext-Cloud</div>
        </div>
    </div>
    <div class="floating-glass-card-2" style="background: rgba(3, 23, 38, 0.95);">
        <div class="card-icon-box" style="border-color: #38BDF8;">🇩🇪</div>
        <div>
            <div class="card-text-title">100 % DSGVO-Rechtssicherheit</div>
            <div class="card-text-sub">Inklusive Art. 28 AVV-Muster</div>
        </div>
    </div>
    """
    h2_title = 'Schülerdaten schützen. Mit <span class="highlight">Zero-Knowledge E2EE.</span>'
    h2_sub = "Ende-zu-Ende verschlüsselt auf deinem Endgerät. Der Server sieht niemals Namen oder Noten – 100 % DSGVO-konform."
    h2_tags = ["🔒 AES-256-GCM Envelope", "💻 Lokale Speicherung (Offline-First)", "📄 Inklusive DSGVO Art. 28 AVV", "🇩🇪 ISO 27001 Standort"]
    h2_html = get_header_html(
        badge_text="🛡️ 100 % DSGVO-KONFORM & VERSCHLÜSSELT 🛡️",
        title_html=h2_title,
        subhead=h2_sub,
        tags=h2_tags,
        device_css=DEVICE_HEADER_CONCEPT1_CSS,
        device_inner=h2_device_inner,
        accent_glow="#0F766E"
    )
    render_html_to_png(h2_html, 3840, 1646, OUTPUT_DIR / "header_concept2_privacy_21x9.png")

    # 3. Header Variant 3: Speed & Zeugniskonferenz
    h3_device_inner = f"""
    <div class="ipad-mockup" style="width: 1280px; height: 950px; transform: perspective(1600px) rotateY(-8deg) rotateX(3deg);">
        <div class="ipad-screen">
            <img src="{IPAD_360}" alt="Gradus21 Schüler 360">
        </div>
    </div>
    <div class="floating-glass-card">
        <div class="card-icon-box">⚡</div>
        <div>
            <div class="card-text-title">Speed-Grading Tastatur</div>
            <div class="card-text-sub">30 Arbeiten in 4 Minuten erfasst</div>
        </div>
    </div>
    <div class="floating-glass-card-2">
        <div class="card-icon-box">🎯</div>
        <div>
            <div class="card-text-title">Elternsprechtags-Simulator</div>
            <div class="card-text-sub">Live Was-wäre-wenn Prognose</div>
        </div>
    </div>
    """
    h3_title = 'Vom ersten Test bis zum Zeugnis – in <span class="highlight">Rekordzeit.</span>'
    h3_sub = "Blitzschnelles Speed-Grading per Tastatur, Live-Notenspiegel und 360°-Schülerakten für souveräne Elterngespräche."
    h3_tags = ["⌨️ Reine Tastatureingabe", "📈 Live-Notenspiegel (1-6 & MSS 0-15)", "🎯 Was-wäre-wenn Simulator", "📑 PDF-Konferenzbögen"]
    h3_html = get_header_html(
        badge_text="⚡ MAXIMALE ZEITERSPARNIS VOR DER KONFERENZ ⚡",
        title_html=h3_title,
        subhead=h3_sub,
        tags=h3_tags,
        device_css=DEVICE_HEADER_CONCEPT1_CSS,
        device_inner=h3_device_inner,
        accent_glow="#38BDF8"
    )
    render_html_to_png(h3_html, 3840, 1646, OUTPUT_DIR / "header_concept3_speed_21x9.png")

    # 4. Search Results Variant 1: Standard
    s1_cards = [
        {"icon": "⚡", "title": "Speed-Grading", "desc": "Reine Tastatureingabe für Tests & Klausuren."},
        {"icon": "📊", "title": "Formelfrei", "desc": "Automatische Attest-Behandlung ohne #DIV/0!."},
        {"icon": "🛡️", "title": "Zero-Knowledge", "desc": "100 % DSGVO-konform & lokal verschlüsselt."}
    ]
    s1_html = get_search_html(
        badge_text="✦ APP STORE HIGHLIGHT ✦",
        headline='Notenverwaltung <span class="hl-teal">ohne Formelchaos.</span>',
        subhead="Automatische Durchschnitte, Attest-Skalierung und Notenspiegel. Funktioniert 100 % offline direkt auf deinem Endgerät.",
        screen_img=IPAD_MATRIX,
        feature_cards=s1_cards
    )
    render_html_to_png(s1_html, 3840, 2560, OUTPUT_DIR / "search_concept1_standard_3x2.png")

    # 5. Search Results Variant 2: Privacy Focus
    s2_cards = [
        {"icon": "🔐", "title": "Zero-Knowledge E2EE", "desc": "AES-256-GCM Verschlüsselung direkt im Browser."},
        {"icon": "🇩🇪", "title": "Serverstandort Leipzig", "desc": "ISO 27001 zertifiziert. 100 % DSGVO-konform."},
        {"icon": "🖥️", "title": "1-Klick Beamer-Schutz", "desc": "Anonymisierte Namen für Notenbesprechungen."}
    ]
    s2_html = get_search_html(
        badge_text="🛡️ DATENSCHUTZ FIRST 🛡️",
        headline='Schülerdaten <span class="hl-teal">zu 100 % schützen.</span>',
        subhead="Keine unverschlüsselten Noten in US-Clouds. Zero-Knowledge Verschlüsselung garantiert absolute Datensicherheit.",
        screen_img=IPAD_MATRIX,
        feature_cards=s2_cards
    )
    render_html_to_png(s2_html, 3840, 2560, OUTPUT_DIR / "search_concept2_privacy_3x2.png")

    # 6. Search Results Variant 3: Speed & Zeugniskonferenz Focus
    s3_cards = [
        {"icon": "⌨️", "title": "Sekundenschnelle Eingabe", "desc": "Noten eintragen ohne Mauswechsel per Ziffernblock."},
        {"icon": "🎯", "title": "Elterngesprächs-Simulator", "desc": "Was-wäre-wenn Prognosen mit einem Klick."},
        {"icon": "📑", "title": "Konferenzfertige PDFs", "desc": "Druckfertige Zeugnisnotenbögen in Sekunden."}
    ]
    s3_html = get_search_html(
        badge_text="⚡ EFFIZIENZ & ENTLASTUNG ⚡",
        headline='Stressfrei in die <span class="hl-teal">Zeugniskonferenz.</span>',
        subhead="Vom ersten Test bis zum Elterngespräch: Blitzschnelle Notenerfassung, Live-Notenspiegel und 360°-Schülerakten.",
        screen_img=IPAD_360,
        feature_cards=s3_cards
    )
    render_html_to_png(s3_html, 3840, 2560, OUTPUT_DIR / "search_concept3_speed_3x2.png")

    # 7. Google Play Feature Graphic (1024x500)
    gp_html = get_google_play_html()
    render_html_to_png(gp_html, 1024, 500, OUTPUT_DIR / "google_play_feature_graphic_1024x500.png")

    print("\n✓ All assets rendered successfully into:", OUTPUT_DIR)

if __name__ == "__main__":
    main()

import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const TOOLS_DIR = process.env.TOOLS_DIR || path.join(os.homedir(), '.cache', 'gradus21-video-tools');
const TOOLS_NODE_MODULES = path.join(TOOLS_DIR, 'node', 'node_modules');
const require = createRequire(path.join(TOOLS_NODE_MODULES, '_resolver.cjs'));

const { chromium } = require('playwright');
const ffmpegPath = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const ffprobePath = ffprobeStatic.path || ffprobeStatic;

const EDGE_TTS_PYTHON = process.env.EDGE_TTS_PYTHON || 'python3';

const CHAPTER_SPECS = [
  {
    id: 'overview_all',
    chapterIndex: 0,
    shortTitle: 'Schnellstart & Überblick',
    fileName: '01_Schnellstart_und_Ueberblick.mp4',
    steps: [
      {
        id: 'ov_welcome',
        targetId: null,
        text: 'Willkommen bei Gradus21! Alle Noten, Schnitte und Zeugnisnoten an einem Ort – lokal verschlüsselt auf deinem Gerät. Starte direkt mit deiner eigenen Klasse oder lade eine Beispielklasse.',
        action: { type: 'click_guide_button', labelRegex: 'Beispielklasse laden \\(mit Noten\\)' },
      },
      {
        id: 'ov_class_start',
        targetId: 'header-class-wizard-btn',
        text: 'Über das Ordner-Symbol mit dem Plus oben links importierst du jederzeit bestehende Excel-Listen per Drag und Drop oder legst neue Klassen an.',
      },
      {
        id: 'ov_matrix',
        targetId: 'matrix-table',
        text: 'Erstens: Die Klassen-Matrix. Deine Gesamtübersicht, in der alle Schnitte und Zeugnisnoten sofort berechnet werden. Klicke auf einen Namen für die Einzelakte oder auf eine Prüfung zum Eintragen.',
      },
      {
        id: 'ov_speed',
        targetId: 'speed-grading-table',
        text: 'Zweitens: Speed-Grading. Arbeit korrigiert? Tippe Ergebnisse im Sekundentakt per Tastatur ein – mit Enter in die nächste Zeile und mit K für krank oder entschuldigt – inklusive Live-Notenspiegel.',
      },
      {
        id: 'ov_student_360',
        targetId: 'student360-container',
        text: 'Drittens: Die Schüler-360-Grad-Akte. Ideal fürs Elterngespräch: Mit Stärkenprofil im Klassenvergleich, druckfertigem Elternsprechtagsbogen und Wunschnoten-Rechner.',
      },
      {
        id: 'ov_configurator',
        targetId: 'configurator-container',
        text: 'Viertens: Der Gewichtungs-Baukasten. Stelle Kategorien wie 50 Prozent Arbeiten, 30 Prozent Mündlich und 20 Prozent Tests, Notenschlüssel und Streichnoten einfach per Schieberegler ein – ganz ohne Formeln.',
      },
      {
        id: 'ov_privacy',
        targetId: 'header-privacy-blur',
        text: 'Und der Beamer-Schutz: Ein Klick auf das Augen-Symbol oder Alt plus P blendet alle Schülernamen und Noten für den Klassenzimmer-Beamer sofort unscharf.',
        action: { type: 'toggle_twice', labelRegex: 'Beamer-Schutz testen', holdMs: 1400 },
      },
    ],
  },
  {
    id: 'class_setup_excel',
    chapterIndex: 1,
    shortTitle: 'Erste Klasse & Excel-Import',
    fileName: '02_Erste_Klasse_und_Excel_Import.mp4',
    steps: [
      {
        id: 'setup_intro',
        targetId: 'header-class-wizard-btn',
        text: 'Kapitel 2: Erste Klasse und Excel-Import. Übernehme deine bisherige Excel-Tabelle per Drag und Drop oder erstelle eine neue Klasse aus fertigen Vorlagen.',
      },
      {
        id: 'setup_wizard_modal',
        targetId: 'wizard-dialog-card',
        text: 'Beim Excel-Import erkennt Gradus21 Schülernamen und Prüfungen automatisch. Alternativ fügst du deine Namensliste einfach per Kopieren und Einfügen ein.',
        action: { type: 'click_selector', selector: '[data-tour="wizard-manual-tab"]' },
      },
      {
        id: 'setup_manage_class',
        targetId: 'header-class-manager-btn',
        text: 'Neuzugang im Halbjahr oder eine neue Klassenarbeit? Über das Stift-Symbol oben links fügst du jederzeit Schülerinnen, Schüler oder Prüfungen hinzu.',
      },
    ],
  },
  {
    id: 'custom_grading_model',
    chapterIndex: 2,
    shortTitle: 'Eigenes Bewertungsmodell',
    fileName: '03_Eigenes_Bewertungsmodell.mp4',
    steps: [
      {
        id: 'cgm_welcome',
        targetId: 'configurator-container',
        text: 'Kapitel 3: Der Gewichtungs-Baukasten. Lege fest, wie deine Fachnoten berechnet werden – komplett ohne fehleranfällige Tabellenformeln.',
        choreography: async (page, { moveAndHoverLocator }) => {
          await page.waitForTimeout(800);
          await moveAndHoverLocator(page, page.locator('[data-tour="configurator-tab-curve"]'), { holdMs: 650 });
          await moveAndHoverLocator(page, page.locator('[data-tour="configurator-tab-differentiation"]'), { holdMs: 650 });
          await moveAndHoverLocator(page, page.locator('[data-tour="configurator-tab-base-setup"]'), { holdMs: 650 });
          await moveAndHoverLocator(page, page.locator('[data-tour="configurator-tab-categories"]'), { holdMs: 700 });
        },
      },
      {
        id: 'cgm_categories',
        targetId: 'configurator-categories',
        text: 'Verteile die Gewichtung per Schieberegler, zum Beispiel 50 Prozent Arbeiten, 30 Prozent Mündlich und 20 Prozent Tests. Fixiere Töpfe per Schloss-Symbol oder aktiviere Streichnoten.',
        choreography: async (page, { moveAndHoverLocator, slideRangeInput }) => {
          await page.waitForTimeout(700);
          // 1. Hover preset button
          const presetBtn = page.locator('[data-tour="configurator-categories"]').getByText('50/50').first();
          await moveAndHoverLocator(page, presetBtn, { holdMs: 550 });
          // 2. Drag first category slider smoothly along track
          const firstSlider = page.locator('[data-tour="configurator-categories"] input[type="range"]').first();
          await slideRangeInput(page, firstSlider, { deltaPercent: 0.14, durationMs: 900, returnBack: true });
          // 3. Highlight lock button on category card
          const lockBtn = page.locator('[data-tour="configurator-categories"] button').filter({ hasText: /Fixiert|Frei/i }).first();
          await moveAndHoverLocator(page, lockBtn, { holdMs: 800 });
          // 4. Hover second category slider
          const secondSlider = page.locator('[data-tour="configurator-categories"] input[type="range"]').nth(1);
          await moveAndHoverLocator(page, secondSlider, { holdMs: 600 });
        },
      },
      {
        id: 'cgm_curve_editor',
        targetId: 'configurator-curve-editor',
        text: 'Passe die Prozentgrenzen für die Noten 1 bis 6 sowie die Bestehensgrenze flexibel an deine Fachschaft an.',
        choreography: async (page, { moveAndHoverLocator, slideRangeInput }) => {
          await page.waitForTimeout(650);
          // Slide curve threshold slider to show live curve reaction
          const curveSlider = page.locator('[data-tour="configurator-curve-editor"] input[type="range"]').nth(2);
          await slideRangeInput(page, curveSlider, { deltaPercent: 0.09, durationMs: 800, returnBack: true });
          // Highlight pass hurdle badge
          const passBadge = page.locator('[data-tour="configurator-curve-editor"]').getByText(/Mindesthürde|Bestehensgrenze/i).first();
          await moveAndHoverLocator(page, passBadge, { holdMs: 650 });
        },
      },
      {
        id: 'cgm_differentiation',
        targetId: 'configurator-differentiation',
        text: 'Hast du heterogene Gruppen? Aktiviere eigene Maßstäbe für G-, M- und E-Niveau.',
        choreography: async (page, { moveAndHoverLocator, slideRangeInput }) => {
          await page.waitForTimeout(650);
          const diffBadge = page.locator('[data-tour="configurator-differentiation"]').getByText(/G-Niveau|M-Niveau|E-Niveau/i).first();
          await moveAndHoverLocator(page, diffBadge, { holdMs: 600 });
          const diffSlider = page.locator('[data-tour="configurator-differentiation"] input[type="range"]').first();
          await slideRangeInput(page, diffSlider, { deltaPercent: 0.12, durationMs: 800, returnBack: true });
        },
      },
      {
        id: 'cgm_scale_mode',
        targetId: 'configurator-scale-mode',
        text: 'Wähle im Basis-Setup zwischen Noten von 1 bis 6 und Oberstufen-Punkten von 0 bis 15 sowie zwischen Kategorien-Töpfen oder freien Faktoren.',
        choreography: async (page, { moveAndHoverLocator }) => {
          await page.waitForTimeout(650);
          const btn1to6 = page.locator('[data-tour="configurator-scale-mode"]').getByText(/Schulnoten 1–6/i).first();
          await moveAndHoverLocator(page, btn1to6, { holdMs: 800 });
          const btn0to15 = page.locator('[data-tour="configurator-scale-mode"]').getByText(/Oberstufe 0–15/i).first();
          await moveAndHoverLocator(page, btn0to15, { holdMs: 800 });
          const btnBuckets = page.locator('[data-tour="configurator-scale-mode"]').getByText(/Kategorien-Töpfe|Freie Faktoren/i).first();
          await moveAndHoverLocator(page, btnBuckets, { holdMs: 750 });
        },
      },
      {
        id: 'cgm_live_simulator',
        targetId: 'configurator-live-check',
        text: 'Rechts im Live-Check prüfst du dein Modell sofort an echten Schülerdaten oder spielst in der Sandbox eigene Testnoten durch.',
        choreography: async (page, { moveAndHoverLocator, slideRangeInput }) => {
          await page.waitForTimeout(650);
          const simSlider = page.locator('[data-tour="configurator-live-check"] input[type="range"]').first();
          await slideRangeInput(page, simSlider, { deltaPercent: 0.20, durationMs: 900, returnBack: true });
          const gradeBadge = page.locator('[data-tour="configurator-live-check"]').getByText(/Gesamtnote|Simulierte Note|Punkte/i).first();
          await moveAndHoverLocator(page, gradeBadge, { holdMs: 700 });
        },
      },
      {
        id: 'cgm_templates',
        targetId: 'configurator-templates',
        text: 'Speichere dein Notenmodell oben als Vorlage, um es mit einem Klick für weitere Klassen wiederzuverwenden.',
        choreography: async (page, { moveAndHoverLocator }) => {
          await page.waitForTimeout(650);
          const saveTplBtn = page.locator('[data-tour="configurator-templates"]').getByRole('button', { name: /Als Vorlage speichern/i });
          await moveAndHoverLocator(page, saveTplBtn, { holdMs: 1300 });
        },
      },
    ],
  },
  {
    id: 'speed_grading',
    chapterIndex: 3,
    shortTitle: 'Speed-Grading im Unterricht',
    fileName: '04_Speed_Grading_und_Notenspiegel.mp4',
    steps: [
      {
        id: 'sg_entry',
        targetId: 'header-mode-speed',
        text: 'Kapitel 4: Speed-Grading und Notenspiegel. Hier hast du vollen Fokus auf eine einzelne Prüfung – ideal zum schnellen Eintragen direkt nach der Korrektur.',
        choreography: async (page, { moveAndHoverLocator }) => {
          await page.waitForTimeout(650);
          const speedBtn = page.locator('[data-tour="header-mode-speed"]');
          await moveAndHoverLocator(page, speedBtn, { holdMs: 1200 });
        },
      },
      {
        id: 'sg_inputs',
        targetId: 'speed-grading-table',
        text: 'Tippe Prozent, Rohpunkte oder Direktnoten ein. Mit Enter springst du in die nächste Zeile, mit K vermerkst du Atteste neutral.',
        choreography: async (page, { moveAndHoverLocator, moveAndClickLocator }) => {
          await page.waitForTimeout(650);
          const firstInput = page.locator('[data-tour="speed-grading-table"] input').first();
          await moveAndHoverLocator(page, firstInput, { holdMs: 600 });
          await moveAndClickLocator(page, firstInput, { moveDelayMs: 200, postClickWaitMs: 300 });
          const secondInput = page.locator('[data-tour="speed-grading-table"] input').nth(1);
          await moveAndHoverLocator(page, secondInput, { holdMs: 700 });
        },
      },
      {
        id: 'sg_curve_box',
        targetId: 'speed-grading-curve-box',
        text: 'Der Notenspiegel rechts zählt live mit. Fällt eine Arbeit unerwartet streng aus, passt du den Maßstab hier direkt an.',
        choreography: async (page, { moveAndHoverLocator }) => {
          await page.waitForTimeout(650);
          const curveBars = page.locator('[data-tour="speed-grading-curve-box"] .flex.items-end, [data-tour="speed-grading-curve-box"] svg');
          await moveAndHoverLocator(page, curveBars.first(), { holdMs: 800 });
        },
      },
    ],
  },
  {
    id: 'student_360_simulator',
    chapterIndex: 4,
    shortTitle: 'Schüler-Akte & Simulator',
    fileName: '05_Schueler_360_Akte_und_Simulator.mp4',
    steps: [
      {
        id: 's360_overview',
        targetId: 'student360-container',
        text: 'Kapitel 5: Die Schüler-360-Grad-Akte. Hier siehst du alle Einzelnoten, Schnitte und die Entwicklung eines Kindes auf einen Blick – optimal fürs Elterngespräch.',
        choreography: async (page, { moveAndHoverLocator }) => {
          await page.waitForTimeout(700);
          const badge = page.locator('[data-tour="student360-container"]').getByText(/Schnitt|Entwicklung|Noten/i).first();
          await moveAndHoverLocator(page, badge, { holdMs: 1100 });
        },
      },
      {
        id: 's360_radar',
        targetId: 'student360-analysis-card',
        text: 'Erkenne sofort, ob die Stärken eher im Schriftlichen oder Mündlichen liegen und wie der Vergleich zur Klasse ausfällt.',
        choreography: async (page, { moveAndHoverLocator }) => {
          await page.waitForTimeout(650);
          const radar = page.locator('[data-tour="student360-analysis-card"] canvas, [data-tour="student360-analysis-card"] svg, [data-tour="student360-analysis-card"]').first();
          await moveAndHoverLocator(page, radar, { holdMs: 1200 });
        },
      },
      {
        id: 's360_simulator',
        targetId: 'student360-simulator-card',
        text: 'Mit dem Wunschnoten-Rechner beantwortest du sofort die Frage: Was brauche ich in der nächsten Arbeit für eine Zwei? Wähle die Wunschnote und Gradus21 zeigt das nötige Ergebnis.',
        choreography: async (page, { moveAndHoverLocator, slideRangeInput }) => {
          await page.waitForTimeout(650);
          const simSlider = page.locator('[data-tour="student360-simulator-card"] input[type="range"]').first();
          await slideRangeInput(page, simSlider, { deltaPercent: 0.18, durationMs: 900, returnBack: true });
          const targetBadge = page.locator('[data-tour="student360-simulator-card"]').getByText(/Wunschnote|Ergebnis|Punkte/i).first();
          await moveAndHoverLocator(page, targetBadge, { holdMs: 700 });
        },
      },
      {
        id: 's360_print',
        targetId: 'student360-print-btn',
        text: 'Und mit einem Klick auf Drucken erzeugst du einen übersichtlichen DIN-A4-Bogen mit allen Noten für den Elternsprechtag.',
        choreography: async (page, { moveAndHoverLocator }) => {
          await page.waitForTimeout(650);
          const printBtn = page.locator('[data-tour="student360-print-btn"]');
          await moveAndHoverLocator(page, printBtn, { holdMs: 1200 });
        },
      },
    ],
  },
  {
    id: 'privacy_security',
    chapterIndex: 5,
    shortTitle: 'Datenschutz & Sicherheit',
    fileName: '06_Datenschutz_und_Beamer_Schutz.mp4',
    steps: [
      {
        id: 'ps_blur',
        targetId: 'header-privacy-blur',
        text: 'Kapitel 6: Datenschutz und Sicherheit. Am Klassenzimmer-Beamer blendest du alle Schülernamen und Noten per Klick auf das Augen-Symbol oder mit Alt plus P sofort unscharf.',
        action: { type: 'toggle_twice', labelRegex: 'Beamer-Schutz jetzt ausprobieren', holdMs: 1400 },
      },
      {
        id: 'ps_e2ee',
        targetId: 'header-settings-btn',
        text: 'Alle Noten und Namen werden direkt auf deinem Gerät verschlüsselt. Niemand außer dir kann Klardaten einsehen.',
      },
      {
        id: 'ps_offline',
        targetId: 'header-sync-status',
        text: 'Gradus21 funktioniert auch komplett ohne WLAN und kann Backups automatisch in einem lokalen Ordner oder auf dem Schullaufwerk sichern.',
      },
      {
        id: 'ps_optin',
        targetId: 'header-settings-btn',
        text: 'Standardmäßig bleibt alles zu 100 Prozent lokal auf diesem Gerät. Den verschlüsselten Cloud-Sync für mehrere Geräte aktivierst du nur bei Bedarf.',
      },
    ],
  },
];

function parseArgs(argv) {
  const opts = {
    chapters: [],
    voice: process.env.VOICE || 'fr-FR-VivienneMultilingualNeural',
    rate: process.env.VOICE_RATE || '+0%',
    baseUrl: process.env.GUIDE_BASE_URL || 'http://127.0.0.1:4185',
    outDir: path.join(REPO_ROOT, 'dist-videos', 'guide'),
    copyDir: path.join(os.homedir(), 'Downloads', 'Gradus21-Guide-Videos'),
    fileSuffix: '',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--chapter' && argv[i + 1]) {
      opts.chapters.push(...argv[++i].split(',').map((s) => s.trim()).filter(Boolean));
    } else if (arg === '--voice' && argv[i + 1]) {
      opts.voice = argv[++i];
    } else if (arg === '--rate' && argv[i + 1]) {
      opts.rate = argv[++i];
    } else if (arg === '--file-suffix' && argv[i + 1]) {
      opts.fileSuffix = argv[++i];
    } else if (arg === '--base-url' && argv[i + 1]) {
      opts.baseUrl = argv[++i];
    } else if (arg === '--out-dir' && argv[i + 1]) {
      opts.outDir = path.resolve(argv[++i]);
    } else if (arg === '--copy-dir' && argv[i + 1]) {
      opts.copyDir = path.resolve(argv[++i]);
    }
  }
  return opts;
}

function getAudioDurationMs(filePath) {
  const res = spawnSync(
    ffprobePath,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
    { encoding: 'utf-8' }
  );
  if (res.status !== 0) {
    throw new Error(`ffprobe failed for ${filePath}: ${res.stderr}`);
  }
  const sec = Number.parseFloat((res.stdout || '').trim());
  if (!Number.isFinite(sec) || sec <= 0) {
    throw new Error(`Invalid duration from ffprobe for ${filePath}: ${res.stdout}`);
  }
  return Math.round(sec * 1000);
}

function findFirstCleanFrame(rawWebmPath) {
  const res = spawnSync(
    ffmpegPath,
    ['-t', '15', '-i', rawWebmPath, '-vf', 'fps=30,crop=8:8:4:4', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: 10 * 1024 * 1024 }
  );
  if (res.status !== 0 || !res.stdout) {
    return 0;
  }
  const buf = res.stdout;
  const frameBytes = 8 * 8 * 3;
  const totalFrames = Math.floor(buf.length / frameBytes);
  let lastMagentaFrame = -1;

  for (let f = 0; f < totalFrames; f++) {
    const base = f * frameBytes;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    const pixels = 64;
    for (let p = 0; p < pixels; p++) {
      sumR += buf[base + p * 3];
      sumG += buf[base + p * 3 + 1];
      sumB += buf[base + p * 3 + 2];
    }
    const avgR = sumR / pixels;
    const avgG = sumG / pixels;
    const avgB = sumB / pixels;
    const isMagenta = avgR > 170 && avgG < 90 && avgB > 170;

    if (isMagenta) {
      lastMagentaFrame = f;
    }
  }
  return lastMagentaFrame >= 0 ? lastMagentaFrame + 1 : 0;
}

function getVideoDurationMs(filePath) {
  const res = spawnSync(
    ffprobePath,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
    { encoding: 'utf-8' }
  );
  if (res.status !== 0) {
    throw new Error(`ffprobe failed for ${filePath}: ${res.stderr}`);
  }
  const sec = Number.parseFloat((res.stdout || '').trim());
  return Number.isFinite(sec) ? Math.round(sec * 1000) : 0;
}

function formatTtsPronunciation(text) {
  return text
    .replace(/\bBewertungsmodell\b/g, 'Notenmodell')
    .replace(/\bUnterrichtest du\b/g, 'Hast du')
    .replace(/\bBeamer-Schutz\b/g, 'Biemer-Schutz')
    .replace(/\bKlassenzimmer-Beamer\b/g, 'Klassenzimmer-Biemer')
    .replace(/\bBeamer\b/g, 'Biemer')
    .replace(/\s–\s/g, ', ');
}

async function synthesizeSpeech(step, voice, rate, cacheDir) {
  const spokenText = formatTtsPronunciation(step.text);
  const hash = crypto
    .createHash('sha256')
    .update(`${voice}|${rate}|${step.id}|${spokenText}`)
    .digest('hex')
    .slice(0, 12);
  const mp3Path = path.join(cacheDir, `${step.id}_${hash}.mp3`);

  if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size === 0) {
    const args = ['-m', 'edge_tts', '--voice', voice, '--text', spokenText, '--write-media', mp3Path];
    if (rate && rate !== '+0%' && rate !== '0%') {
      args.push(`--rate=${rate}`);
    }
    const maxAttempts = 4;
    let lastError = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = spawnSync(EDGE_TTS_PYTHON, args, { encoding: 'utf-8' });
      if (res.status === 0 && fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 0) {
        lastError = '';
        break;
      }
      if (fs.existsSync(mp3Path)) {
        fs.rmSync(mp3Path, { force: true });
      }
      lastError = res.stderr || res.stdout || `exit code ${res.status}`;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 700 * attempt));
      }
    }
    if (lastError) {
      throw new Error(`edge-tts failed for step "${step.id}" after ${maxAttempts} attempts: ${lastError}`);
    }
  }

  const durationMs = getAudioDurationMs(mp3Path);
  return { mp3Path, durationMs };
}

const CURSOR_INIT_SCRIPT = () => {
  const ensureCursor = () => {
    if (!document.body) return null;
    let layer = document.getElementById('gradus21-demo-cursor-layer');
    if (!layer) {
      const style = document.createElement('style');
      style.id = 'gradus21-demo-cursor-style';
      style.textContent = `
        #gradus21-demo-cursor-layer {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          max-width: none;
          max-height: none;
          margin: 0;
          padding: 0;
          border: none;
          background: transparent;
          overflow: visible;
          pointer-events: none;
        }
        #gradus21-demo-cursor-layer::backdrop {
          display: none;
          background: transparent;
          pointer-events: none;
        }
        #gradus21-demo-cursor {
          position: fixed;
          top: 0;
          left: 0;
          width: 30px;
          height: 30px;
          transform: translate3d(-120px, -120px, 0);
          transition: transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
          pointer-events: none;
          filter: drop-shadow(0 3px 6px rgba(15, 23, 42, 0.38));
          z-index: 2147483647;
        }
        #gradus21-demo-cursor.clicking svg {
          transform: scale(0.86);
        }
        #gradus21-demo-cursor svg {
          transition: transform 110ms ease-out;
          transform-origin: 4px 3px;
        }
        .gradus21-click-ripple {
          position: fixed;
          width: 38px;
          height: 38px;
          margin-left: -19px;
          margin-top: -19px;
          border-radius: 9999px;
          border: 3px solid rgba(20, 184, 166, 0.9);
          background: rgba(20, 184, 166, 0.18);
          pointer-events: none;
          transform: scale(0.25);
          opacity: 0.95;
          transition: transform 420ms cubic-bezier(0.16, 1, 0.3, 1), opacity 420ms ease-out;
        }
        .gradus21-click-ripple.active {
          transform: scale(1.45);
          opacity: 0;
        }
        #gradus21-demo-tick {
          position: fixed;
          top: 0;
          left: 0;
          width: 2px;
          height: 2px;
          opacity: 0.01;
          pointer-events: none;
        }
      `;
      document.head.appendChild(style);

      layer = document.createElement('div');
      layer.id = 'gradus21-demo-cursor-layer';
      layer.setAttribute('popover', 'manual');

      const cursor = document.createElement('div');
      cursor.id = 'gradus21-demo-cursor';
      cursor.innerHTML = `
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4.5 2.5L22.5 14.2L14.2 16.3L10.3 24.5L4.5 2.5Z" fill="#0F172A" stroke="#FFFFFF" stroke-width="2.2" stroke-linejoin="round"/>
        </svg>
      `;

      const tick = document.createElement('div');
      tick.id = 'gradus21-demo-tick';

      layer.appendChild(cursor);
      layer.appendChild(tick);
      document.body.appendChild(layer);
    }

    if (typeof layer.showPopover === 'function') {
      try {
        if (layer.matches(':popover-open')) {
          layer.hidePopover();
        }
        layer.showPopover();
      } catch {
        // Fallback if popover API unavailable
      }
    }
    return layer;
  };

  window.__gradus21DemoCursor = {
    promoteTopLayer() {
      ensureCursor();
    },
    showSyncMarker() {
      const layer = ensureCursor();
      if (!layer) return;
      let syncMarker = document.getElementById('gradus21-demo-sync-marker');
      if (!syncMarker) {
        syncMarker = document.createElement('div');
        syncMarker.id = 'gradus21-demo-sync-marker';
        syncMarker.style.cssText =
          'position:fixed;top:0;left:0;width:16px;height:16px;background:#ff00ff;pointer-events:none;z-index:2147483647;';
        layer.appendChild(syncMarker);
      }
    },
    hideSyncMarker() {
      const syncMarker = document.getElementById('gradus21-demo-sync-marker');
      if (syncMarker) syncMarker.remove();
    },
    moveTo(x, y, instant = false) {
      ensureCursor();
      const cursor = document.getElementById('gradus21-demo-cursor');
      if (!cursor) return;
      cursor.style.transition = instant
        ? 'none'
        : 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)';
      cursor.style.transform = `translate3d(${Math.round(x - 4)}px, ${Math.round(y - 3)}px, 0)`;
    },
    clickEffect(x, y) {
      const layer = ensureCursor();
      const cursor = document.getElementById('gradus21-demo-cursor');
      if (!layer || !cursor) return;
      cursor.classList.add('clicking');
      setTimeout(() => cursor.classList.remove('clicking'), 140);

      const ripple = document.createElement('div');
      ripple.className = 'gradus21-click-ripple';
      ripple.style.left = `${Math.round(x)}px`;
      ripple.style.top = `${Math.round(y)}px`;
      layer.appendChild(ripple);
      requestAnimationFrame(() => ripple.classList.add('active'));
      setTimeout(() => ripple.remove(), 460);
    },
    pulseFrame() {
      const tick = document.getElementById('gradus21-demo-tick');
      if (tick) {
        tick.style.opacity = tick.style.opacity === '0.02' ? '0.01' : '0.02';
      }
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ensureCursor());
  } else {
    ensureCursor();
  }
};

async function moveAndClickLocator(page, locator, { moveDelayMs = 450, postClickWaitMs = 150 } = {}) {
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Target element has no bounding box');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.evaluate(
    ({ x, y }) => {
      window.__gradus21DemoCursor?.promoteTopLayer();
      window.__gradus21DemoCursor?.moveTo(x, y, false);
    },
    { x, y }
  );
  await page.waitForTimeout(moveDelayMs);

  await page.evaluate(
    ({ x, y }) => {
      window.__gradus21DemoCursor?.clickEffect(x, y);
    },
    { x, y }
  );
  await page.mouse.click(x, y);
  if (postClickWaitMs > 0) {
    await page.waitForTimeout(postClickWaitMs);
  }
}

async function moveAndHoverLocator(page, locator, { moveDelayMs = 400, holdMs = 500 } = {}) {
  try {
    const loc = locator.first();
    await loc.waitFor({ state: 'visible', timeout: 3500 });
    const box = await loc.boundingBox();
    if (!box) return;
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    await page.evaluate(
      ({ x, y }) => {
        window.__gradus21DemoCursor?.promoteTopLayer();
        window.__gradus21DemoCursor?.moveTo(x, y, false);
      },
      { x, y }
    );
    await page.mouse.move(x, y);
    await page.waitForTimeout(moveDelayMs + holdMs);
  } catch (err) {
    // Graceful fallback if element not ready
  }
}

async function slideRangeInput(page, locator, { deltaPercent = 0.15, durationMs = 800, returnBack = true } = {}) {
  try {
    const input = locator.first();
    await input.waitFor({ state: 'visible', timeout: 3500 });
    const box = await input.boundingBox();
    if (!box) return;

    const min = Number((await input.getAttribute('min')) || 0);
    const max = Number((await input.getAttribute('max')) || 100);
    const curVal = Number(await input.inputValue());
    const curFrac = (curVal - min) / (max - min || 1);

    const startX = Math.round(box.x + box.width * Math.max(0.12, Math.min(0.88, curFrac)));
    const y = Math.round(box.y + box.height / 2);
    const targetX = Math.round(Math.max(box.x + 12, Math.min(box.x + box.width - 12, startX + box.width * deltaPercent)));

    // Move smoothly to slider thumb
    await page.evaluate(
      ({ x, y }) => {
        window.__gradus21DemoCursor?.promoteTopLayer();
        window.__gradus21DemoCursor?.moveTo(x, y, false);
      },
      { x: startX, y }
    );
    await page.mouse.move(startX, y);
    await page.waitForTimeout(380);

    // Mouse down with visual click ripple
    await page.evaluate(({ x, y }) => window.__gradus21DemoCursor?.clickEffect(x, y), { x: startX, y });
    await page.mouse.down();

    const steps = 14;
    const stepTime = Math.max(25, Math.floor((durationMs / 2) / steps));

    // Slide forward along track
    for (let s = 1; s <= steps; s++) {
      const frac = s / steps;
      const curX = Math.round(startX + (targetX - startX) * frac);
      await page.evaluate(({ x, y }) => window.__gradus21DemoCursor?.moveTo(x, y, true), { x: curX, y });
      await page.mouse.move(curX, y);

      const stepVal = min + ((curX - box.x) / box.width) * (max - min);
      await input.evaluate((el, val) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) {
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, stepVal);

      await page.waitForTimeout(stepTime);
    }

    await page.waitForTimeout(250);

    // Slide back towards initial position
    if (returnBack) {
      for (let s = 1; s <= steps; s++) {
        const frac = s / steps;
        const curX = Math.round(targetX + (startX - targetX) * frac);
        await page.evaluate(({ x, y }) => window.__gradus21DemoCursor?.moveTo(x, y, true), { x: curX, y });
        await page.mouse.move(curX, y);

        const stepVal = min + ((curX - box.x) / box.width) * (max - min);
        await input.evaluate((el, val) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) {
            setter.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, stepVal);

        await page.waitForTimeout(stepTime);
      }
    }

    await page.mouse.up();
    await page.waitForTimeout(200);
  } catch (err) {
    // Graceful fallback if slider is not present
  }
}

async function moveCursorToTargetArea(page, targetId) {
  const coords = await page.evaluate((tId) => {
    const card = document.querySelector('[data-guide-card="true"]');
    const cardRect = card ? card.getBoundingClientRect() : null;

    const isClearOfCard = (px, py) => {
      if (!cardRect) return true;
      const pad = 20;
      return (
        px < cardRect.left - pad ||
        px > cardRect.right + pad ||
        py < cardRect.top - pad ||
        py > cardRect.bottom + pad
      );
    };

    if (!tId) {
      return {
        x: Math.round(window.innerWidth * 0.22),
        y: Math.round(window.innerHeight * 0.45),
      };
    }

    let el = document.querySelector(`[data-tour="${tId}"]`);
    if (!el || el.getBoundingClientRect().width === 0) {
      const fallbacks = {
        'header-sync-status': '[data-tour="header-storage-indicator"]',
        'configurator-scale-mode': '[data-tour="configurator-tab-base-setup"]',
        'configurator-curve-editor': '[data-tour="configurator-tab-curve"]',
        'configurator-differentiation': '[data-tour="configurator-tab-differentiation"]',
        'configurator-categories': '[data-tour="configurator-tab-categories"]',
      };
      if (fallbacks[tId]) {
        el = document.querySelector(fallbacks[tId]);
      }
    }

    if (!el) {
      return {
        x: Math.round(window.innerWidth * 0.25),
        y: Math.round(window.innerHeight * 0.45),
      };
    }

    const r = el.getBoundingClientRect();
    const candidates = [
      [r.left + r.width * 0.25, r.top + Math.min(r.height * 0.3, 120)],
      [r.left + r.width * 0.5, r.top + Math.min(r.height * 0.25, 100)],
      [r.left + r.width * 0.75, r.top + Math.min(r.height * 0.3, 120)],
      [r.left + r.width * 0.5, r.top + r.height * 0.5],
      [r.left + 24, r.top + 24],
    ];

    for (const [cx, cy] of candidates) {
      const px = Math.max(24, Math.min(window.innerWidth - 24, cx));
      const py = Math.max(24, Math.min(window.innerHeight - 24, cy));
      if (isClearOfCard(px, py)) {
        return { x: Math.round(px), y: Math.round(py) };
      }
    }

    return {
      x: Math.round(Math.max(24, Math.min(window.innerWidth - 24, r.left + r.width / 2))),
      y: Math.round(Math.max(24, Math.min(window.innerHeight - 24, r.top + Math.min(r.height / 2, 80)))),
    };
  }, targetId);

  await page.evaluate(({ x, y }) => {
    window.__gradus21DemoCursor?.promoteTopLayer();
    window.__gradus21DemoCursor?.moveTo(x, y, false);
  }, coords);
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (err) {
    if (fs.existsSync('/snap/bin/chromium')) {
      console.warn(`Standard Playwright Chromium failed (${err.message}); fallback to /snap/bin/chromium`);
      return await chromium.launch({
        headless: true,
        executablePath: '/snap/bin/chromium',
      });
    }
    throw err;
  }
}

async function recordChapter(browser, chapter, stepAudioMap, opts, tempRoot) {
  const tempVideoDir = path.join(tempRoot, chapter.id);
  fs.mkdirSync(tempVideoDir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 810 },
    recordVideo: {
      dir: tempVideoDir,
      size: { width: 1440, height: 810 },
    },
    locale: 'de-DE',
    colorScheme: 'light',
  });

  const page = await context.newPage();
  await page.addInitScript(CURSOR_INIT_SCRIPT);

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(`${opts.baseUrl}/?demo=1`, { waitUntil: 'networkidle' });
  await page.locator('[data-tour="matrix-table"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(300);

  // Place initial cursor cleanly near center-top and ensure sync marker paints
  await page.evaluate(() => {
    window.__gradus21DemoCursor?.promoteTopLayer();
    window.__gradus21DemoCursor?.moveTo(720, 320, true);
  });
  await page.waitForTimeout(150);

  let trimStartWallMs;

  if (chapter.id === 'overview_all') {
    await page.evaluate(() => window.__gradus21DemoCursor?.showSyncMarker());
    await page.waitForTimeout(220);
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          window.__gradus21DemoCursor?.hideSyncMarker();
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        })
    );
    trimStartWallMs = Date.now();
    const startTourBtn = page.getByRole('button', { name: /Kurztour starten/i });
    await moveAndClickLocator(page, startTourBtn, { moveDelayMs: 500, postClickWaitMs: 120 });
  } else {
    // Open chapter select modal BEFORE trimStartWallMs so the video begins cleanly on the chapter hub
    const openChaptersBtn = page.getByRole('button', { name: /Themen wählen/i });
    await openChaptersBtn.click();
    const dialog = page.locator('dialog[open]');
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(350);

    const chapterCard = dialog
      .locator('div.rounded-2xl')
      .filter({ hasText: chapter.shortTitle })
      .first();
    const startChapterBtn = chapterCard.getByRole('button', { name: /Kapitel starten|Erneut abspielen/i });
    await startChapterBtn.scrollIntoViewIfNeeded();

    await page.evaluate(() => {
      window.__gradus21DemoCursor?.promoteTopLayer();
      window.__gradus21DemoCursor?.moveTo(720, 260, true);
      window.__gradus21DemoCursor?.showSyncMarker();
    });
    await page.waitForTimeout(220);

    await page.evaluate(
      () =>
        new Promise((resolve) => {
          window.__gradus21DemoCursor?.hideSyncMarker();
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        })
    );
    trimStartWallMs = Date.now();
    await page.waitForTimeout(200);

    await moveAndClickLocator(page, startChapterBtn, { moveDelayMs: 500, postClickWaitMs: 150 });
  }

  const timelineClips = [];

  for (let i = 0; i < chapter.steps.length; i++) {
    const step = chapter.steps[i];
    const audio = stepAudioMap.get(step.id);
    const isLast = i === chapter.steps.length - 1;

    await page.locator('[data-guide-card="true"]').waitFor({ state: 'visible', timeout: 10000 });
    // Let spotlight, smooth scrolling & modal/mode/tab transition finish
    await page.waitForTimeout(480);

    const stepOffsetMs = Date.now() - trimStartWallMs;
    timelineClips.push({
      id: step.id,
      mp3Path: audio.mp3Path,
      durationMs: audio.durationMs,
      offsetMs: stepOffsetMs,
    });

    // Move cursor to highlighted UI area (without covering guide card)
    await moveCursorToTargetArea(page, step.targetId);

    // Execute optional step choreography or action while narration runs
    if (step.choreography) {
      try {
        await step.choreography(page, {
          moveAndHoverLocator,
          slideRangeInput,
          moveAndClickLocator,
          moveCursorToTargetArea,
          audioDurationMs: audio.durationMs,
        });
      } catch (err) {
        console.warn(`[Choreography warning for ${step.id}]:`, err.message);
      }
    } else if (step.action) {
      const actionStartDelay = Math.min(2200, Math.max(700, Math.floor(audio.durationMs * 0.35)));
      const elapsedInStep = Date.now() - trimStartWallMs - stepOffsetMs;
      if (actionStartDelay > elapsedInStep) {
        await page.waitForTimeout(actionStartDelay - elapsedInStep);
      }

      if (step.action.type === 'click_guide_button') {
        const card = page.locator('[data-guide-card="true"]');
        const actionBtn = card.getByRole('button', { name: new RegExp(step.action.labelRegex, 'i') });
        await moveAndClickLocator(page, actionBtn, { moveDelayMs: 420, postClickWaitMs: 250 });
      } else if (step.action.type === 'toggle_twice') {
        const card = page.locator('[data-guide-card="true"]');
        const actionBtn = card.getByRole('button', { name: new RegExp(step.action.labelRegex, 'i') });
        await moveAndClickLocator(page, actionBtn, { moveDelayMs: 420, postClickWaitMs: step.action.holdMs || 1400 });
        await moveAndClickLocator(page, actionBtn, { moveDelayMs: 250, postClickWaitMs: 200 });
      } else if (step.action.type === 'click_selector') {
        const targetLoc = page.locator(step.action.selector).first();
        await moveAndClickLocator(page, targetLoc, { moveDelayMs: 420, postClickWaitMs: 250 });
      }
    }

    // Wait until audio narration + 450ms pause has elapsed
    const targetStepEndMs = stepOffsetMs + audio.durationMs + 450;
    const nowOffsetMs = Date.now() - trimStartWallMs;
    if (targetStepEndMs > nowOffsetMs) {
      await page.waitForTimeout(targetStepEndMs - nowOffsetMs);
    }

    const card = page.locator('[data-guide-card="true"]');
    const navBtn = card.getByRole('button', { name: isLast ? /^Fertig$/i : /^Weiter$/i });
    await moveAndClickLocator(page, navBtn, { moveDelayMs: 360, postClickWaitMs: 120 });
  }

  // Trailing pause and frame pulse to ensure Playwright flushes frames up to pageCloseWallMs
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__gradus21DemoCursor?.pulseFrame());
  await page.waitForTimeout(50);

  const pageCloseWallMs = Date.now();
  const video = page.video();
  await page.close();
  await context.close();

  if (pageErrors.length > 0) {
    throw new Error(`Page errors during chapter ${chapter.id}: ${pageErrors.join(' | ')}`);
  }

  const rawWebmPath = await video.path();
  const rawWebmDurationMs = getVideoDurationMs(rawWebmPath);
  const recordedSpanMs = pageCloseWallMs - trimStartWallMs;
  const firstCleanFrame = findFirstCleanFrame(rawWebmPath);
  const trimStartSec =
    firstCleanFrame > 0
      ? firstCleanFrame / 30
      : Math.max(0, (rawWebmDurationMs - recordedSpanMs) / 1000);

  // Prevent any accidental audio overlap
  let prevAudioEndMs = 0;
  for (const clip of timelineClips) {
    if (clip.offsetMs < prevAudioEndMs + 120) {
      clip.offsetMs = prevAudioEndMs + 120;
    }
    prevAudioEndMs = clip.offsetMs + clip.durationMs;
  }

  fs.mkdirSync(opts.outDir, { recursive: true });
  const outputFileName = opts.fileSuffix
    ? chapter.fileName.replace(/\.mp4$/, `${opts.fileSuffix}.mp4`)
    : chapter.fileName;
  const outMp4Path = path.join(opts.outDir, outputFileName);

  const ffmpegArgs = ['-y', '-i', rawWebmPath];
  for (const clip of timelineClips) {
    ffmpegArgs.push('-i', clip.mp3Path);
  }

  const videoFilter =
    firstCleanFrame > 0
      ? `[0:v]fps=30,trim=start_frame=${firstCleanFrame},setpts=PTS-STARTPTS,scale=1920:1080:flags=lanczos,format=yuv420p[vout]`
      : `[0:v]trim=start=${trimStartSec.toFixed(3)},setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos,format=yuv420p[vout]`;

  const filterParts = [videoFilter];
  const audioLabels = [];
  timelineClips.forEach((clip, idx) => {
    const inputIndex = idx + 1;
    const label = `a${idx}`;
    const delayMs = Math.max(0, Math.round(clip.offsetMs));
    filterParts.push(`[${inputIndex}:a]adelay=${delayMs}|${delayMs}[${label}]`);
    audioLabels.push(`[${label}]`);
  });
  filterParts.push(
    `${audioLabels.join('')}amix=inputs=${timelineClips.length}:duration=longest:dropout_transition=0:normalize=0[aout]`
  );

  ffmpegArgs.push(
    '-filter_complex',
    filterParts.join(';'),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '18',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '44100',
    '-movflags',
    '+faststart',
    outMp4Path
  );

  const muxRes = spawnSync(ffmpegPath, ffmpegArgs, { encoding: 'utf-8' });
  if (muxRes.status !== 0) {
    throw new Error(`ffmpeg failed for ${chapter.fileName}:\n${muxRes.stderr}`);
  }

  if (opts.copyDir) {
    fs.mkdirSync(opts.copyDir, { recursive: true });
    fs.copyFileSync(outMp4Path, path.join(opts.copyDir, outputFileName));
  }

  const finalDurationMs = getVideoDurationMs(outMp4Path);
  console.log(
    `✔ ${outputFileName} | Dauer: ${(finalDurationMs / 1000).toFixed(1)}s | Raw: ${(rawWebmDurationMs / 1000).toFixed(1)}s | Frame0: ${firstCleanFrame} | Trim: ${trimStartSec.toFixed(2)}s`
  );
  return { outMp4Path, finalDurationMs };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const selectedChapters =
    opts.chapters.length > 0
      ? CHAPTER_SPECS.filter((c) => opts.chapters.includes(c.id))
      : CHAPTER_SPECS;

  if (selectedChapters.length === 0) {
    throw new Error(`Keine passenden Kapitel gefunden für: ${opts.chapters.join(', ')}`);
  }

  const ttsCacheDir = path.join(TOOLS_DIR, 'tts-cache');
  fs.mkdirSync(ttsCacheDir, { recursive: true });

  console.log(`==> Generiere deutsche Sprachclips (${opts.voice}) für ${selectedChapters.length} Kapitel...`);
  const stepAudioMap = new Map();
  for (const chapter of selectedChapters) {
    for (const step of chapter.steps) {
      const audio = await synthesizeSpeech(step, opts.voice, opts.rate, ttsCacheDir);
      stepAudioMap.set(step.id, audio);
      console.log(`   - ${chapter.id}/${step.id}: ${(audio.durationMs / 1000).toFixed(2)}s`);
    }
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gradus21-guide-rec-'));
  const browser = await launchBrowser();

  try {
    console.log(`==> Starte Playwright-Aufnahmen (${opts.baseUrl}/?demo=1)...`);
    for (const chapter of selectedChapters) {
      await recordChapter(browser, chapter, stepAudioMap, opts, tempRoot);
    }
  } finally {
    await browser.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log(`\nFertig! Videos gespeichert unter:\n  - ${opts.outDir}\n  - ${opts.copyDir}`);
}

main().catch((err) => {
  console.error('\nFehler bei der Video-Produktion:', err);
  process.exit(1);
});

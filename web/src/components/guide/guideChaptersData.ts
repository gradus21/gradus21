import { GuideChapter } from '../../types/guide';

export const GUIDE_CHAPTERS: GuideChapter[] = [
  {
    id: 'overview_all',
    title: 'Kapitel 1: Schnellstart & Überblick',
    shortTitle: 'Schnellstart & Überblick',
    subtitle: 'In 60 Sekunden alle vier Arbeitsmodi kennenlernen',
    description:
      'Lerne Matrix, Speed-Grading, 360°-Akte, Gewichtungs-Baukasten und Beamer-Schutz in 60 Sekunden kennen.',
    iconName: 'Compass',
    estimatedMinutes: 1,
    tags: ['Einführung', 'Klassen-Start', 'Alle Modi', 'Überblick'],
    steps: [
      {
        id: 'ov_welcome',
        title: 'Willkommen bei Gradus21',
        content:
          'Alle Noten, Schnitte und Zeugnisnoten an einem Ort – lokal verschlüsselt auf deinem Gerät. Starte direkt mit deiner eigenen Klasse oder lade eine Beispielklasse:',
        placement: 'center',
        actions: [
          {
            label: 'Eigene Klasse importieren / anlegen',
            actionType: 'open_class_wizard',
            variant: 'primary',
          },
          {
            label: 'Beispielklasse laden (mit Noten)',
            actionType: 'load_demo_dataset',
            variant: 'secondary',
          },
        ],
        tip: 'Tipp: Mit den Pfeiltasten (← / →) blättern oder mit Esc beenden.',
      },
      {
        id: 'ov_class_start',
        title: 'Klasse anlegen oder Excel importieren',
        content:
          'Über das **Ordner-Symbol (+)** oben links importierst du jederzeit bestehende Excel-Listen (.xlsx) per Drag & Drop oder legst neue Klassen an.',
        targetId: 'header-class-wizard-btn',
        placement: 'bottom',
        targetMode: 'matrix',
        actions: [
          {
            label: 'Eigene Klasse importieren / anlegen',
            actionType: 'open_class_wizard',
            variant: 'primary',
          },
          {
            label: 'Beispielklasse laden (mit Noten)',
            actionType: 'load_demo_dataset',
            variant: 'secondary',
          },
        ],
      },
      {
        id: 'ov_matrix',
        title: '1. Klassen-Matrix',
        content:
          'Deine Gesamtübersicht: Alle Schnitte und Zeugnisnoten werden sofort berechnet. Klicke auf einen Namen für die Einzelakte oder auf eine Prüfung zum Eintragen.',
        targetId: 'matrix-table',
        placement: 'bottom',
        targetMode: 'matrix',
      },
      {
        id: 'ov_speed',
        title: '2. Speed-Grading',
        content:
          'Arbeit korrigiert? Tippe Ergebnisse im Sekundentakt per Tastatur ein (`Enter` = nächste Zeile, `K` = krank/entschuldigt) – inklusive Live-Notenspiegel.',
        targetId: 'speed-grading-table',
        placement: 'bottom',
        targetMode: 'speed_grading',
      },
      {
        id: 'ov_student_360',
        title: '3. Schüler-360°-Akte',
        content:
          'Ideal fürs Elterngespräch: Stärkenprofil im Klassenvergleich, druckfertiger Elternsprechtagsbogen und Wunschnoten-Rechner.',
        targetId: 'student360-container',
        placement: 'bottom',
        targetMode: 'student_360',
      },
      {
        id: 'ov_configurator',
        title: '4. Gewichtungs-Baukasten',
        content:
          'Stelle Kategorien (z. B. 50 % Arbeiten, 30 % Mündlich, 20 % Tests), Notenschlüssel und Streichnoten einfach per Schieberegler ein – ganz ohne Formeln.',
        targetId: 'configurator-container',
        placement: 'bottom',
        targetMode: 'configurator',
      },
      {
        id: 'ov_privacy',
        title: 'Beamer-Schutz (Alt+P)',
        content:
          'Ein Klick auf das **Augen-Symbol** (oder `Alt+P`) blendet alle Schülernamen und Noten für den Klassenzimmer-Beamer sofort unscharf.',
        targetId: 'header-privacy-blur',
        placement: 'bottom',
        targetMode: 'matrix',
        action: {
          label: 'Beamer-Schutz testen',
          actionType: 'toggle_privacy_blur',
        },
      },
    ],
  },
  {
    id: 'class_setup_excel',
    title: 'Kapitel 2: Erste Klasse & Excel-Import',
    shortTitle: 'Erste Klasse & Excel-Import',
    subtitle: 'Excel-Listen übernehmen, Vorlagen nutzen oder Schüler verwalten',
    description:
      'Übernehme Excel-Listen per Drag & Drop, nutze Vorlagen oder verwalte Schüler:innen und Prüfungen.',
    iconName: 'FolderPlus',
    estimatedMinutes: 1,
    tags: ['Klassen', 'Excel-Import', 'Start', 'Demoklasse'],
    steps: [
      {
        id: 'setup_intro',
        title: 'Neue Klasse starten',
        content:
          'Übernehme deine bisherige Excel-Tabelle (.xlsx) per Drag & Drop oder erstelle eine neue Klasse aus fertigen Vorlagen.',
        targetId: 'header-class-wizard-btn',
        placement: 'bottom',
        targetMode: 'matrix',
        actions: [
          {
            label: 'Eigene Klasse importieren / anlegen',
            actionType: 'open_class_wizard',
            variant: 'primary',
          },
          {
            label: 'Beispielklasse laden (mit Noten)',
            actionType: 'load_demo_dataset',
            variant: 'secondary',
          },
        ],
      },
      {
        id: 'setup_wizard_modal',
        title: 'Automatische Spaltenerkennung',
        content:
          'Beim Excel-Import erkennt Gradus21 Schülernamen und Prüfungen automatisch. Alternativ fügst du deine Namensliste einfach per Copy & Paste ein.',
        targetId: 'wizard-dialog-card',
        placement: 'top',
        action: {
          label: 'Beispielklasse mit Noten laden',
          actionType: 'load_demo_dataset',
        },
      },
      {
        id: 'setup_manage_class',
        title: 'Schüler & Prüfungen bearbeiten',
        content:
          'Neuzugang im Halbjahr oder neue Klassenarbeit? Über das **Stift-Symbol** fügst du jederzeit Schüler:innen oder Prüfungen hinzu.',
        targetId: 'header-class-manager-btn',
        placement: 'bottom',
        targetMode: 'matrix',
      },
    ],
  },
  {
    id: 'custom_grading_model',
    title: 'Kapitel 3: Eigenes Bewertungsmodell & Notenschlüssel',
    shortTitle: 'Eigenes Bewertungsmodell',
    subtitle: 'Kategorien, Notenschlüssel, Niveaustufen & Vorlagen anpassen',
    description:
      'Passe Kategorien, Notenschlüssel, Binnendifferenzierung und Skalen ohne Formeln an dein Fach an.',
    iconName: 'Sliders',
    estimatedMinutes: 1.5,
    tags: ['Gewichtung', 'Notenschlüssel', 'Didaktik', 'Binnendifferenzierung'],
    steps: [
      {
        id: 'cgm_welcome',
        title: 'Der Gewichtungs-Baukasten',
        content:
          'Lege fest, wie deine Fachnoten berechnet werden – komplett ohne fehleranfällige Tabellenformeln.',
        targetId: 'configurator-container',
        placement: 'bottom',
        targetMode: 'configurator',
      },
      {
        id: 'cgm_categories',
        title: '1. Kategorien & Streichnoten',
        content:
          'Verteile die Gewichtung per Schieberegler (z. B. 50 % Arbeiten, 30 % Mündlich, 20 % Tests), fixiere Töpfe per Schloss-Symbol oder aktiviere Streichnoten.',
        targetId: 'configurator-categories',
        placement: 'top',
        targetMode: 'configurator',
      },
      {
        id: 'cgm_curve_editor',
        title: '2. Notenschlüssel & Bestehensgrenze',
        content:
          'Passe die Prozentgrenzen für die Noten 1 bis 6 sowie die Bestehensgrenze (Note 4) flexibel an deine Fachschaft an.',
        targetId: 'configurator-curve-editor',
        placement: 'top',
        targetMode: 'configurator',
      },
      {
        id: 'cgm_differentiation',
        title: '3. Binnendifferenzierung (G / M / E)',
        content:
          'Unterrichtest du heterogene Gruppen? Aktiviere eigene Maßstäbe für **G-**, **M-** und **E-Niveau**.',
        targetId: 'configurator-differentiation',
        placement: 'top',
        targetMode: 'configurator',
      },
      {
        id: 'cgm_scale_mode',
        title: '4. Basis-Setup & Skala',
        content:
          'Wähle zwischen **Noten (1–6)** und **Oberstufen-Punkten (0–15)** sowie zwischen Kategorien-Töpfen oder freien Faktoren.',
        targetId: 'configurator-scale-mode',
        placement: 'top',
        targetMode: 'configurator',
      },
      {
        id: 'cgm_live_simulator',
        title: '5. Live-Check & Sandbox',
        content:
          'Rechts prüfst du dein Modell sofort an echten Schülerdaten oder spielst in der **Sandbox** eigene Testnoten durch.',
        targetId: 'configurator-live-check',
        placement: 'left',
        targetMode: 'configurator',
      },
      {
        id: 'cgm_templates',
        title: '6. Vorlagen speichern & teilen',
        content:
          'Speichere dein Bewertungsmodell als Vorlage, um es mit einem Klick für weitere Klassen wiederzuverwenden.',
        targetId: 'configurator-templates',
        placement: 'bottom',
        targetMode: 'configurator',
      },
    ],
  },
  {
    id: 'speed_grading',
    title: 'Kapitel 4: Speed-Grading & Notenspiegel',
    shortTitle: 'Speed-Grading im Unterricht',
    subtitle: 'Noteneingabe per Tastatur, Krankmeldungen & Notenspiegel',
    description:
      'Trage Arbeiten per Tastatur ein, vermerke Atteste mit K und passe den Notenschlüssel direkt an.',
    iconName: 'Zap',
    estimatedMinutes: 1,
    tags: ['Noteneingabe', 'Korrektur', 'Notenspiegel', 'Tastatur'],
    steps: [
      {
        id: 'sg_entry',
        title: 'Fokus auf eine Prüfung',
        content:
          'Voller Fokus auf eine einzelne Prüfung – ideal zum schnellen Eintragen direkt nach der Korrektur.',
        targetId: 'header-mode-speed',
        placement: 'bottom',
        targetMode: 'speed_grading',
      },
      {
        id: 'sg_inputs',
        title: 'Tastatur-Navigation & Formate',
        content:
          'Tippe Prozent, Rohpunkte oder Direktnoten ein. Mit `Enter` springst du in die nächste Zeile, mit `K` vermerkst du Atteste neutral.',
        targetId: 'speed-grading-table',
        placement: 'bottom',
        targetMode: 'speed_grading',
      },
      {
        id: 'sg_curve_box',
        title: 'Live-Notenspiegel & Tuning',
        content:
          'Der Notenspiegel zählt live mit. Fällt eine Arbeit unerwartet streng aus, passt du den Maßstab hier direkt an.',
        targetId: 'speed-grading-curve-box',
        placement: 'top',
        targetMode: 'speed_grading',
      },
    ],
  },
  {
    id: 'student_360_simulator',
    title: 'Kapitel 5: Schüler-360°-Akte & Simulator',
    shortTitle: 'Schüler-Akte & Simulator',
    subtitle: 'Stärkenprofil, Elterngespräche & Wunschnoten-Rechner',
    description:
      'Nutze das Stärkenprofil, den Wunschnoten-Rechner und den A4-Druckbogen fürs Elterngespräch.',
    iconName: 'UserCheck',
    estimatedMinutes: 1,
    tags: ['Beratung', 'Elterngespräch', 'Simulator', 'Was-wäre-wenn'],
    steps: [
      {
        id: 's360_overview',
        title: 'Die 360°-Akte im Überblick',
        content:
          'Alle Einzelnoten, Schnitte und die Entwicklung eines Kindes auf einen Blick – optimal fürs Elterngespräch.',
        targetId: 'student360-container',
        placement: 'bottom',
        targetMode: 'student_360',
      },
      {
        id: 's360_radar',
        title: 'Stärken & Schwächen auf einen Blick',
        content:
          'Sieh sofort, ob die Stärken eher im Schriftlichen oder Mündlichen liegen und wie der Vergleich zur Klasse ausfällt.',
        targetId: 'student360-analysis-card',
        placement: 'top',
        targetMode: 'student_360',
      },
      {
        id: 's360_simulator',
        title: 'Wunschnoten-Rechner',
        content:
          '„Was brauche ich in der nächsten Arbeit für eine 2?“ Wähle die Wunschnote und Gradus21 zeigt das nötige Ergebnis.',
        targetId: 'student360-simulator-card',
        placement: 'top',
        targetMode: 'student_360',
      },
      {
        id: 's360_print',
        title: 'Elternsprechtagsbogen drucken',
        content:
          'Mit einem Klick erzeugst du einen übersichtlichen DIN-A4-Bogen mit allen Noten für den Elternsprechtag.',
        targetId: 'student360-print-btn',
        placement: 'bottom',
        targetMode: 'student_360',
      },
    ],
  },
  {
    id: 'privacy_security',
    title: 'Kapitel 6: Datenschutz & Beamer-Schutz',
    shortTitle: 'Datenschutz & Sicherheit',
    subtitle: 'Beamer-Schutz, lokale Verschlüsselung & Backups',
    description:
      'Schütze Namen am Beamer, arbeite offline und sichere Backups lokal oder per Cloud-Sync.',
    iconName: 'ShieldCheck',
    estimatedMinutes: 1,
    tags: ['Sicherheit', 'E2EE', 'Beamer-Schutz', 'Datenschutz'],
    steps: [
      {
        id: 'ps_blur',
        title: 'Beamer-Modus (Alt+P)',
        content:
          'Am Klassenzimmer-Beamer blendest du alle Schülernamen und Noten per Klick oder `Alt+P` sofort unscharf.',
        targetId: 'header-privacy-blur',
        placement: 'bottom',
        targetMode: 'matrix',
        action: {
          label: 'Beamer-Schutz jetzt ausprobieren',
          actionType: 'toggle_privacy_blur',
        },
      },
      {
        id: 'ps_e2ee',
        title: 'Lokale Verschlüsselung & Tresor',
        content:
          'Alle Noten und Namen werden direkt auf deinem Gerät verschlüsselt. Niemand außer dir kann Klardaten einsehen.',
        targetId: 'header-settings-btn',
        placement: 'bottom',
        targetMode: 'matrix',
        action: {
          label: 'Konto & Schutz öffnen',
          actionType: 'open_vault_inspector',
        },
      },
      {
        id: 'ps_offline',
        title: 'Offline-fähig & Ordner-Backup',
        content:
          'Gradus21 funktioniert auch ohne WLAN und kann Backups automatisch in einem lokalen Ordner (z. B. Schullaufwerk) sichern.',
        targetId: 'header-sync-status',
        placement: 'bottom',
        targetMode: 'matrix',
      },
      {
        id: 'ps_optin',
        title: 'Cloud-Sync nur nach Wunsch',
        content:
          'Standardmäßig bleibt alles zu 100 % lokal auf diesem Gerät. Den verschlüsselten Cloud-Sync für mehrere Geräte aktivierst du nur bei Bedarf.',
        targetId: 'header-settings-btn',
        placement: 'bottom',
        targetMode: 'matrix',
        action: {
          label: 'Speicher- & Cloud-Einstellungen öffnen',
          actionType: 'open_settings',
        },
      },
    ],
  },
];

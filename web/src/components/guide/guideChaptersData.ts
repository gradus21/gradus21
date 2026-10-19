import { GuideChapter } from '../../types/guide';

export const GUIDE_CHAPTERS: GuideChapter[] = [
  {
    id: 'overview_all',
    title: 'Kapitel 1: Der große Überblick (Alle Kernfunktionen)',
    shortTitle: 'Großer App-Rundgang',
    subtitle: 'Lerne alle 4 Arbeitsmodi und Kernkonzepte von Gradus21 kennen',
    description:
      'Eine umfassende Tour durch die Matrix, Speed-Grading, 360°-Akte, den Gewichtungs-Baukasten und den Beamer-Schutz.',
    iconName: 'Compass',
    estimatedMinutes: 3,
    tags: ['Einführung', 'Alle Modi', 'Überblick'],
    steps: [
      {
        id: 'ov_welcome',
        title: 'Willkommen bei Gradus21! 🎓',
        content:
          'Gradus21 revolutioniert die Notenverwaltung für Lehrkräfte: **100 % Client-Side Rust/WASM-Berechnung**, **Zero-Knowledge-Verschlüsselung** und Schluss mit kaputten Excel-Formeln bei Krankheitsfällen (`K`), Streichnoten oder leeren Kategorien.',
        placement: 'center',
        badge: 'Zero-Knowledge & Rust/WASM',
        tip: 'Tipp: Du kannst diese interaktive Demo jederzeit über die Pfeiltasten (← / →) steuern oder mit der Esc-Taste beenden.',
      },
      {
        id: 'ov_modes',
        title: 'Vier spezialisierte Arbeitsmodi 🎛️',
        content:
          'Statt einer unübersichtlichen Monstertabelle bietet dir Gradus21 vier spezialisierte Modi für jede Phase deines Schulalltags: **Klassen-Matrix**, **Speed-Grading**, **Schüler-360°-Akte** und den **Gewichtungs-Baukasten**.',
        targetId: 'header-mode-tabs',
        placement: 'bottom',
        targetMode: 'matrix',
        badge: 'Ergonomie',
      },
      {
        id: 'ov_matrix',
        title: '1. Klassen-Matrix (Übersicht & Zeugnis) 📊',
        content:
          'Hier hast du alle Schüler:innen im Blick. Noten werden live mit Rust berechnet. Du siehst sofort Kategorie-Schnittstellen (z. B. Ø LNW, Ø Mündlich, Ø Tests) und kannst Zeugnisnoten-Overrides direkt eintragen.',
        targetId: 'matrix-table',
        placement: 'top',
        targetMode: 'matrix',
        badge: 'Live-Schnitt',
        tip: 'Klicke auf den Namen eines Schülers für die 360°-Akte oder auf den Spaltenkopf einer Prüfung für Speed-Grading.',
      },
      {
        id: 'ov_speed',
        title: '2. Speed-Grading (Fokus-Erfassung) ⚡',
        content:
          'Klassenarbeit korrigiert? Im Speed-Grading trägst du Noten im Sekundentakt per Ziffernblock ein. Mit Pfeiltasten navigieren, mit `K` entschuldigen. Ein Live-Notenspiegel zeigt dir sofort den Klassenschnitt!',
        targetId: 'speed-grading-table',
        placement: 'top',
        targetMode: 'speed_grading',
        badge: 'Tastatur-optimiert',
        tip: 'Mit der K-Taste werden kranke Schüler neutral ausgeklammert – ohne Null-Punkte-Fehler!',
      },
      {
        id: 'ov_student_360',
        title: '3. Schüler:innen-360°-Akte & Ziel-Simulator 🎓',
        content:
          'Perfekt vorbereitet für das Elterngespräch: Sieh Stärken und Schwächen im Vergleich zum Klassenschnitt. Der **Was-wäre-wenn-Simulator** berechnet exakt per WASM, welche Note in der nächsten Arbeit nötig ist, um das Ziel zu erreichen.',
        targetId: 'student360-container',
        placement: 'top',
        targetMode: 'student_360',
        badge: 'Elterngespräch & Was-wäre-wenn',
      },
      {
        id: 'ov_configurator',
        title: '4. Gewichtungs-Baukasten (Ohne Formeln) ⚖️',
        content:
          'Definiere Notenschlüssel, Kategorien (z. B. 50 % LNW, 30 % Mündlich, 20 % Tests), Streichnoten und Binnendifferenzierung (`G` / `M` / `E`) ganz intuitiv mit Schiebereglern – mathematisch fehlerfrei.',
        targetId: 'configurator-container',
        placement: 'top',
        targetMode: 'configurator',
        badge: 'Individuelle Didaktik',
      },
      {
        id: 'ov_privacy',
        title: 'Beamer-Schutz & Privatsphäre (Alt+P) 🛡️',
        content:
          'Möchtest du Noten oder Aufgaben im Klassenzimmer an die Wand werfen? Ein Klick auf **Namen ausblenden** (oder Shortcut `Alt+P`) macht alle sensiblen Klarnamen sofort unscharf!',
        targetId: 'header-privacy-blur',
        placement: 'bottom',
        targetMode: 'matrix',
        badge: 'Klassenzimmer-Schutz',
        action: {
          label: 'Beamer-Schutz testen',
          actionType: 'toggle_privacy_blur',
        },
      },
      {
        id: 'ov_done',
        title: 'Bereit für deinen Unterricht! 🚀',
        content:
          'Du hast den Überblick über Gradus21 erhalten. Du kannst nun einzelne Kapitel (z. B. Einrichten der ersten Klasse oder dein Bewertungsmodell) vertiefen oder direkt loslegen.',
        placement: 'center',
        badge: 'Rundgang abgeschlossen',
      },
    ],
  },
  {
    id: 'class_setup_excel',
    title: 'Kapitel 2: Erste Klasse einrichten & Excel-Import',
    shortTitle: 'Erste Klasse einrichten',
    subtitle: 'Neue Klassen erstellen, Vorlagen wählen oder bestehende Excel-Listen importieren',
    description:
      'Lerne Schritt für Schritt, wie du eine neue Klasse erstellst, Schüler hinzufügst oder deine bestehende .xlsx-Tabelle per Drag & Drop migrierst.',
    iconName: 'FolderPlus',
    estimatedMinutes: 2,
    tags: ['Klassen', 'Excel-Import', 'Start'],
    steps: [
      {
        id: 'setup_intro',
        title: 'Klassenverwaltung in Gradus21 🏫',
        content:
          'In Gradus21 kannst du beliebig viele Klassen und Kurse parallel verwalten. Jede Klasse hat ihr eigenes Fach, ihr eigenes Schuljahr und ihr individuelles Notenmodell.',
        targetId: 'header-class-switcher',
        placement: 'bottom',
        targetMode: 'matrix',
        badge: 'Klassen-Manager',
      },
      {
        id: 'setup_new_button',
        title: 'Der Klassen-Assistent (+ Neue Klasse) ✨',
        content:
          'Über die Schaltfläche **+ Neue Klasse** öffnest du den Einrichtungs-Assistenten. Hier stehen dir zwei Wege offen: Der native **.xlsx Excel-Import** oder der **Manuelle Assistent** mit Vorlagen.',
        targetId: 'header-class-wizard-btn',
        placement: 'bottom',
        targetMode: 'matrix',
        badge: 'Wizard',
        action: {
          label: 'Assistenten jetzt öffnen',
          actionType: 'open_class_wizard',
        },
      },
      {
        id: 'setup_wizard_modal',
        title: 'Excel-Import (.xlsx) oder Manueller Start 📂',
        content:
          '**Weg 1: Excel-Import**: Ziehe deine bisherige Excel-Notenliste einfach per Drag & Drop hinein. Gradus21 erkennt automatisch Schülernamen, Niveaustufen und vorhandene Tests.\n\n**Weg 2: Manueller Assistent**: Wähle eine fertige Vorlage (z. B. 3-Säulen, 50/50, Oberstufe MSS) und füge deine Schülerliste zeilenweise ein.',
        targetId: 'wizard-dialog-card',
        placement: 'top',
        badge: 'Flexibler Import',
        action: {
          label: 'Klassen-Assistent öffnen',
          actionType: 'open_class_wizard',
        },
      },
      {
        id: 'setup_manage_class',
        title: 'Bestehende Klassen anpassen ✏️',
        content:
          'Schüler unterjährig hinzugekommen oder gewechselt? Über **Klasse bearbeiten** kannst du Schüler hinzufügen, archivieren (ohne Datenverlust bei Schulwechsel!) oder die Anzahl der Arbeiten je Kategorie anpassen.',
        targetId: 'header-class-manager-btn',
        placement: 'bottom',
        targetMode: 'matrix',
        badge: 'Schüler & Tests editieren',
      },
    ],
  },
  {
    id: 'custom_grading_model',
    title: 'Kapitel 3: Eigenes Bewertungsmodell & Notenschlüssel konfigurieren',
    shortTitle: 'Eigenes Bewertungsmodell',
    subtitle: 'Kategorien-Töpfe, Gewichtung, Notenschlüssel-Kurven & Binnendifferenzierung',
    description:
      'Passe dein Benotungsmodell individuell an: Notenskalen, Gewichtungs-Töpfe (50/30/20), Schwellenwerte für Note 1–6 und Niveaustufen G/M/E.',
    iconName: 'Sliders',
    estimatedMinutes: 2,
    tags: ['Gewichtung', 'Notenschlüssel', 'Didaktik', 'Binnendifferenzierung'],
    steps: [
      {
        id: 'cgm_welcome',
        title: 'Der Gewichtungs-Baukasten ⚖️',
        content:
          'Willkommen im didaktischen Herzstück! Hier bestimmst du, wie Noten für dieses Fach berechnet werden. Das Beste: Du musst keine Formeln schreiben – Gradus21 kümmert sich um die mathematisch korrekte Verrechnung.',
        targetId: 'configurator-container',
        placement: 'top',
        targetMode: 'configurator',
        badge: 'Konfigurator',
      },
      {
        id: 'cgm_scale_mode',
        title: '1. Notenskala & Berechnungsmodell 🎯',
        content:
          'Wähle zunächst deine Notenskala:\n- **Klassische Noten 1–6** (mit Tendenz `+` und `-`)\n- **Oberstufe 0–15 MSS-Punkte**\n- **US Letter Grades (A+ bis F)**\n\nDarunter wählst du dein Modell: **Kategorien-Töpfe (Standard)**, **Freie Faktoren (1x, 2x)** oder **Punktesammler (Total Points)**.',
        targetId: 'configurator-scale-mode',
        placement: 'top',
        targetMode: 'configurator',
        badge: 'Skala & Modell',
      },
      {
        id: 'cgm_categories',
        title: '2. Kategorien anlegen, gewichten & Streichnoten 📊',
        content:
          'Hier stellst du deine Säulen ein – z. B. **50 % LNW**, **30 % Mündlich**, **20 % Tests**. Du kannst neue Kategorien anlegen, Namen ändern und sogar **Streichnoten** festlegen (z. B. "Schlechtester Vokabeltest wird gestrichen").',
        targetId: 'configurator-categories',
        placement: 'top',
        targetMode: 'configurator',
        badge: 'Kategorien & Töpfe',
        tip: 'Die Schieberegler normalisieren sich automatisch auf 100 %, sodass keine Rundungsverluste entstehen.',
      },
      {
        id: 'cgm_templates',
        title: '3. Als eigene Vorlage sichern oder globale Vorlagen nutzen 💾',
        content:
          'Hast du dein ideales Modell gebaut? Mit einem Klick auf **Als eigene Vorlage speichern** sicherst du es in deinem Profil. So kannst du es für jede weitere Klasse mit einem Klick wiederverwenden.',
        targetId: 'configurator-templates',
        placement: 'top',
        targetMode: 'configurator',
        badge: 'Wiederverwendbarkeit',
      },
      {
        id: 'cgm_curve_editor',
        title: '4. Notenschlüssel & Schwellenwerte einstellen 📐',
        content:
          'Ab wie viel Prozent gibt es eine 1, ab wann eine 4? Wähle bewährte Vorlagen wie **Sek-I Standard**, **IHK 50%-Hürde**, **Pädagogisch Mild** oder **Streng**. Über die Regler kannst du jeden Prozentwert stufenlos feintunen.',
        targetId: 'configurator-curve-editor',
        placement: 'top',
        targetMode: 'configurator',
        badge: 'Notenschlüssel',
        tip: 'Unten siehst du live die 16er-Feinstufen-Tabelle von 1+ bis 6 mit den genauen Prozentgrenzen.',
      },
      {
        id: 'cgm_differentiation',
        title: '5. Binnendifferenzierung (G / M / E Niveaustufen) 🌈',
        content:
          'Unterrichtest du heterogene Lerngruppen? Aktiviere die Binnendifferenzierung für **G** (Grundlegend), **M** (Mittleres) und **E** (Erweitertes Niveau). Du kannst für jede Stufe prozentuale Verschiebungen definieren und die Vergleichstabelle live prüfen.',
        targetId: 'configurator-differentiation',
        placement: 'top',
        targetMode: 'configurator',
        badge: 'G / M / E Niveau',
      },
    ],
  },
  {
    id: 'speed_grading',
    title: 'Kapitel 4: Speed-Grading & Live-Notenspiegel im Unterricht',
    shortTitle: 'Speed-Grading im Unterricht',
    subtitle: 'Schnelle Noteneingabe per Tastatur, Krankmeldungen & Notenspiegel-Tuning',
    description:
      'Erfahre, wie du Klassenarbeiten und Tests in Rekordzeit einträgst, mit der K-Taste Krankmeldungen vermerkst und den Notenschlüssel direkt nachjustierst.',
    iconName: 'Zap',
    estimatedMinutes: 2,
    tags: ['Noteneingabe', 'Korrektur', 'Notenspiegel', 'Tastatur'],
    steps: [
      {
        id: 'sg_entry',
        title: 'Fokus-Erfassung für Klassenarbeiten ⚡',
        content:
          'Im Speed-Grading-Modus gehört der Bildschirm ganz der Korrektur einer einzelnen Prüfung. Keine Ablenkung, maximale Geschwindigkeit!',
        targetId: 'header-mode-speed',
        placement: 'bottom',
        targetMode: 'speed_grading',
        badge: 'Fokus-Modus',
      },
      {
        id: 'sg_inputs',
        title: 'Tastatur-Navigation & Eingabe-Formate ⌨️',
        content:
          'Gib Noten wahlweise in **Prozent (%)**, **Rohpunkten (Pkt.)** oder **Direktnote (1-6)** ein. Drücke einfach `Enter` oder die Pfeiltasten, um zur nächsten Schülerin zu springen. Mit der Taste `K` setzt du den Status "Krank / Attest".',
        targetId: 'speed-grading-table',
        placement: 'top',
        targetMode: 'speed_grading',
        badge: 'Schnelltasten',
        tip: 'Ein "K" verfälscht weder die Summe noch den Klassenschnitt, sondern wird neutral ausgeklammert.',
      },
      {
        id: 'sg_curve_box',
        title: 'Live-Notenspiegel & Direkt-Tuner 📈',
        content:
          'Parallel zur Eingabe visualisiert dir Gradus21 sofort den Notenspiegel von Note 1 bis 6. Fällt eine Arbeit unerwartet streng aus? Über den Notenschlüssel-Tuner kannst du die Schwellenwerte sofort anpassen.',
        targetId: 'speed-grading-curve-box',
        placement: 'top',
        targetMode: 'speed_grading',
        badge: 'Echtzeit-Feedback',
      },
    ],
  },
  {
    id: 'student_360_simulator',
    title: 'Kapitel 5: Schüler:innen-360°-Akte & Was-wäre-wenn Simulator',
    shortTitle: 'Schüler-Akte & Simulator',
    subtitle: 'Stärken-/Schwächen-Profil, Elterngespräche & interaktive Ziel-Prognose',
    description:
      'Nutze die 360°-Akte für Elterngespräche und berechne per Rust-WASM exakt, welche Note für die Wunschnote noch erreicht werden muss.',
    iconName: 'UserCheck',
    estimatedMinutes: 2,
    tags: ['Beratung', 'Elterngespräch', 'Simulator', 'Was-wäre-wenn'],
    steps: [
      {
        id: 's360_overview',
        title: 'Die 360°-Akte im Überblick 🎓',
        content:
          'Hier steht die einzelne Schülerin bzw. der einzelne Schüler im Mittelpunkt. Du siehst alle Teilleistungen, den Gesamtverlauf und den Vergleich zum Klassenschnitt.',
        targetId: 'student360-container',
        placement: 'top',
        targetMode: 'student_360',
        badge: 'Schüler-Diagnostik',
      },
      {
        id: 's360_radar',
        title: 'Stärken & Schwächen visualisiert 📊',
        content:
          'Das Kategorie-Diagramm zeigt auf einen Blick: Liegen die Stärken eher in mündlicher Mitarbeit oder in schriftlichen Arbeiten? Ideal zur individuellen Förderung.',
        targetId: 'student360-analysis-card',
        placement: 'top',
        targetMode: 'student_360',
        badge: 'Förderdiagnostik',
      },
      {
        id: 's360_simulator',
        title: 'Interaktiver Was-wäre-wenn Ziel-Simulator 🔮',
        content:
          'Schüler:innen fragen oft: *"Frau Müller, was muss ich in der nächsten Arbeit schreiben, um noch eine 2 im Zeugnis zu bekommen?"*\n\nStelle einfach die Wunschnote ein – der Rust-Kern berechnet exakt die benötigte Prozent- oder Punktzahl!',
        targetId: 'student360-simulator-card',
        placement: 'top',
        targetMode: 'student_360',
        badge: 'WASM-Simulator v2',
        tip: 'Berücksichtigt automatisch dein gewähltes Berechnungsmodell (Töpfe, Faktoren oder Rohpunkte).',
      },
      {
        id: 's360_print',
        title: 'Druckfertiger Elternsprechtagsbogen 🖨️',
        content:
          'Mit einem Klick auf **Elternsprechtagsbogen drucken** erzeugst du ein ansprechend formatiertes, DIN-A4-optimiertes Dokument mit allen Noten, Tendenzen und didaktischen Notizen.',
        targetId: 'student360-print-btn',
        placement: 'bottom',
        targetMode: 'student_360',
        badge: 'A4-Export',
      },
    ],
  },
  {
    id: 'privacy_security',
    title: 'Kapitel 6: Datenschutz, Beamer-Modus & Zero-Knowledge',
    shortTitle: 'Datenschutz & E2EE',
    subtitle: 'Klassenzimmer-Beamer-Schutz, Argon2id-Master-Key und Zero-Knowledge-Sicherheit',
    description:
      'Erfahre, wie Gradus21 Schülerdaten schützt: Vollständige Verschlüsselung im Browser, Beamer-Schutz und Offline-Fähigkeit.',
    iconName: 'ShieldCheck',
    estimatedMinutes: 1.5,
    tags: ['Sicherheit', 'E2EE', 'Beamer-Schutz', 'Datenschutz'],
    steps: [
      {
        id: 'ps_blur',
        title: 'Beamer-Modus: Namen & Noten ausblenden 👁️‍🗨️',
        content:
          'Wenn dein Laptop mit dem Klassenzimmer-Beamer verbunden ist, drücke einfach `Alt+P` oder klicke auf **Namen ausblenden**. Alle sensiblen Schülernamen und Noten werden mit einem sanften Weichzeichner unleserlich gemacht.',
        targetId: 'header-privacy-blur',
        placement: 'bottom',
        targetMode: 'matrix',
        badge: 'Klassenzimmer-Privatsphäre',
        action: {
          label: 'Beamer-Schutz jetzt ausprobieren',
          actionType: 'toggle_privacy_blur',
        },
      },
      {
        id: 'ps_e2ee',
        title: 'Zero-Knowledge E2EE & Tresor 🔐',
        content:
          'Deine Daten gehören dir und deiner Schule. Alle Noten und Namen werden mit **Argon2id** und **AES-256-GCM** direkt im Browser verschlüsselt, bevor sie jemals synchronisiert werden. Kein Serverbetreiber kann Klartext-Namen einsehen.',
        targetId: 'header-vault-btn',
        placement: 'bottom',
        targetMode: 'matrix',
        badge: 'E2EE Envelope Encryption',
      },
      {
        id: 'ps_offline',
        title: '100 % Offline-Fähig & Ausfallsicher 📶',
        content:
          'Schlechtes Schul-WLAN? Kein Problem! Gradus21 speichert und berechnet alles lokal im Browser. Sobald wieder eine Verbindung besteht, synchronisiert der verschlüsselte Tresor geräuschlos im Hintergrund.',
        targetId: 'header-sync-status',
        placement: 'bottom',
        targetMode: 'matrix',
        badge: 'Offline-First',
      },
    ],
  },
];

import { GuideChapter } from '../../types/guide';

export const GUIDE_CHAPTERS: GuideChapter[] = [
  {
    id: 'overview_all',
    title: 'Kapitel 1: Der große Überblick (Start & Kernfunktionen)',
    shortTitle: 'Großer App-Rundgang',
    subtitle: 'Starte mit eigener Klasse oder Beispieldaten und lerne alle 4 Arbeitsmodi kennen',
    description:
      'Starte mit dem Import deiner eigenen Klasse oder lade eine Beispielklasse, um danach Matrix, Speed-Grading, 360°-Akte, Gewichtungs-Baukasten und Beamer-Schutz live zu erleben.',
    iconName: 'Compass',
    estimatedMinutes: 3,
    tags: ['Einführung', 'Klassen-Start', 'Alle Modi', 'Überblick'],
    steps: [
      {
        id: 'ov_welcome',
        title: 'Willkommen bei Gradus21! 🎓',
        content:
          'Gradus21 revolutioniert die Notenverwaltung für Lehrkräfte:\n\n' +
          '- **100 % Client-Side Rust/WASM**: Deterministische Berechnungen direkt im Browser\n' +
          '- **Zero-Knowledge-Verschlüsselung**: Schülerdaten bleiben auf deinem Gerät geschützt (AES-256-GCM)\n' +
          '- **Didaktik ohne Formel-Chaos**: Keine Formelabbrüche bei Attest (`K`), Streichnoten oder leeren Fächern\n\n' +
          '👉 **Direkter Einstieg:** Du kannst sofort deine eigene Klasse importieren (.xlsx / Assistent) oder eine fertige Beispielklasse mit Noten laden, um alle Funktionen live auszuprobieren.',
        placement: 'center',
        badge: 'Zero-Knowledge & Rust/WASM',
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
        tip: 'Tipp: Du kannst diesen interaktiven Guide jederzeit über die Pfeiltasten (← / →) steuern oder mit der Esc-Taste beenden.',
      },
      {
        id: 'ov_class_start',
        title: 'Schritt 1: Eigene Klasse importieren oder Beispielklasse laden 📂',
        content:
          'Um Noten zu erfassen und zu berechnen, benötigt Gradus21 eine Klasse als Arbeitsgrundlage. Du hast zwei Möglichkeiten:\n\n' +
          '- **Weg 1: Eigene Klasse importieren**: Klicke auf **Eigene Klasse importieren**, um deine bestehende Excel-Tabelle (.xlsx) per Drag & Drop einzulesen oder eine neue Klasse aus Vorlagen zu erstellen.\n' +
          '- **Weg 2: Beispielklasse laden**: Klicke auf **Beispielklasse laden**, um sofort eine Musterklasse (Englisch 6a mit 12 Schüler:innen, Arbeiten & Noten) einzusetzen.\n\n' +
          'Wähle eine Option oder klicke auf Weiter (→), falls du dich erst umsehen möchtest.',
        targetId: 'header-class-wizard-btn',
        placement: 'bottom',
        targetMode: 'matrix',
        badge: 'Start & Datenbasis',
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
        tip: 'Tipp: Nach dem Laden der Beispielklasse siehst du sofort alle Schnittstellen und Notenberechnungen live.',
      },
      {
        id: 'ov_modes',
        title: 'Vier spezialisierte Arbeitsmodi 🎛️',
        content:
          'Statt einer unübersichtlichen Monstertabelle bietet dir Gradus21 vier spezialisierte Modi für jede Phase deines Schulalltags:\n\n' +
          '- **Klassen-Matrix**: Live-Schnittstellen und Notenübersicht der gesamten Klasse\n' +
          '- **Speed-Grading**: Fokus-Erfassung von Klassenarbeiten im Sekundentakt per Tastatur\n' +
          '- **Schüler-360°-Akte**: Stärkenprofil & interaktiver Was-wäre-wenn Simulator fürs Elterngespräch\n' +
          '- **Gewichtungs-Baukasten**: Notenschlüssel, Kategorien und Streichnoten ohne Formeln',
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
        placement: 'bottom',
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
        placement: 'bottom',
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
        placement: 'bottom',
        targetMode: 'student_360',
        badge: 'Elterngespräch & Was-wäre-wenn',
      },
      {
        id: 'ov_configurator',
        title: '4. Gewichtungs-Baukasten (Ohne Formeln) ⚖️',
        content:
          'Definiere Notenschlüssel, Kategorien (z. B. 50 % LNW, 30 % Mündlich, 20 % Tests), Streichnoten und Binnendifferenzierung (`G` / `M` / `E`) ganz intuitiv mit Schiebereglern – mathematisch fehlerfrei.',
        targetId: 'configurator-container',
        placement: 'bottom',
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
    subtitle: 'Neue Klassen erstellen, Vorlagen wählen, Excel-Listen importieren oder Demoklasse laden',
    description:
      'Lerne Schritt für Schritt, wie du eine neue Klasse erstellst, Schüler hinzufügst, deine bestehende .xlsx-Tabelle per Drag & Drop migrierst oder eine Demoklasse lädst.',
    iconName: 'FolderPlus',
    estimatedMinutes: 2,
    tags: ['Klassen', 'Excel-Import', 'Start', 'Demoklasse'],
    steps: [
      {
        id: 'setup_intro',
        title: 'Start: Eigene Klasse importieren oder Beispielklasse laden 🏫',
        content:
          'In Gradus21 verwaltest du deine Klassen und Kurse vollkommen flexibel. Für den Einstieg stehen dir zwei komfortable Wege offen:\n\n' +
          '- **Eigene Klasse importieren**: Bestehende Excel-Tabelle (.xlsx) per Drag & Drop hineinziehen oder Vorlage wählen.\n' +
          '- **Beispielklasse laden**: Sofort eine vollständige Klasse (Englisch 6a mit 12 Schüler:innen & Noten) zum Ausprobieren laden.\n\n' +
          'Starte jetzt direkt mit einem Klick:',
        targetId: 'header-class-wizard-btn',
        placement: 'bottom',
        targetMode: 'matrix',
        badge: 'Klassen-Start',
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
        id: 'setup_new_button',
        title: 'Der Klassen-Assistent (+ Neue Klasse) ✨',
        content:
          'Über die Schaltfläche **+ Neue Klasse** öffnest du den Einrichtungs-Assistenten. Hier stehen dir zwei Wege offen: Der native **.xlsx Excel-Import** oder der **Manuelle Assistent** mit Vorlagen.\n\n' +
          'Auch im Assistenten kannst du jederzeit mit einem Klick die fertige Demoklasse laden.',
        targetId: 'header-class-wizard-btn',
        placement: 'bottom',
        targetMode: 'matrix',
        badge: 'Wizard',
        actions: [
          {
            label: 'Assistenten jetzt öffnen',
            actionType: 'open_class_wizard',
            variant: 'primary',
          },
          {
            label: 'Beispielklasse laden',
            actionType: 'load_demo_dataset',
            variant: 'secondary',
          },
        ],
      },
      {
        id: 'setup_wizard_modal',
        title: 'Excel-Import (.xlsx) oder Manueller Start 📂',
        content:
          'Wähle den passenden Weg für deinen Klassenstart:\n\n' +
          '- **Weg 1: Excel-Import**: Ziehe deine bisherige .xlsx-Tabelle per Drag & Drop hinein. Namen, Niveaustufen und Tests werden automatisch erkannt.\n' +
          '- **Weg 2: Manueller Assistent**: Wähle eine fertige Vorlage (z. B. 3-Säulen, 50/50, Oberstufe MSS) und füge deine Schülerliste zeilenweise ein.\n\n' +
          '💡 *Interaktiver Guide:* Du kannst den Assistenten jetzt direkt bedienen oder mit einem Klick die Demoklasse laden, um den weiteren Rundgang mit echten Schülerdaten zu erleben.',
        targetId: 'wizard-dialog-card',
        placement: 'top',
        badge: 'Flexibler Import',
        action: {
          label: 'Beispielklasse mit Noten laden',
          actionType: 'load_demo_dataset',
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
        placement: 'bottom',
        targetMode: 'configurator',
        badge: 'Konfigurator',
      },
      {
        id: 'cgm_categories',
        title: '1. Kategorien, Prozent-Waage & Streichnoten 📊',
        content:
          'Hier stellst du deine Säulen ein – z. B. **50 % Klassenarbeiten**, **30 % Mündlich**, **20 % Tests**:\n\n' +
          '- **Prozent-Waage & Auto-Balancing**: Schieberegler gleichen sich automatisch auf 100 % aus.\n' +
          '- **Schloss-Funktion 🔒**: Fixiere einzelne Kategorien (z. B. Klassenarbeiten auf 50 %), während du andere Regler anpasst.\n' +
          '- **Verhältnis-Modus (2 : 1 : 1)**: Wenn du lieber in Faktoren denkst („Klausuren zählen doppelt, mündlich einfach“).\n' +
          '- **Streichnoten**: Definiere z. B. "1x Streichen" für den schwächsten Kurztest mit einem Klick.',
        targetId: 'configurator-categories',
        placement: 'top',
        targetMode: 'configurator',
        badge: 'Kategorien & Töpfe',
        tip: 'Über die [–] und [+] Tasten kannst du Werte in 5 %-Schritten anpassen oder jede beliebige Zahl (auch krumme Werte wie 33,3 %) direkt eintippen.',
      },
      {
        id: 'cgm_curve_editor',
        title: '2. Notenschlüssel-Spektrum & Bestehensgrenze 🎯',
        content:
          'Passe den Notenschlüssel für dein Fach und Bundesland an:\n\n' +
          '- **Kontinuierliches Farbspektrum**: Visualisiert alle Notenstufen von 1 bis 6 in einem Band.\n' +
          '- **⚡ Bestehensgrenze (Note 4)**: Prominent hervorgehoben (z. B. ab 45 % oder 50 %).\n' +
          '- **16 Feinstufen**: Alle Tendenzen (1+, 1, 1- ... 6) passen sich automatisch proportional an.',
        targetId: 'configurator-curve-editor',
        placement: 'top',
        targetMode: 'configurator',
        badge: 'Notenschlüssel',
        tip: 'Unten siehst du live die 16er-Feinstufen-Tabelle von 1+ bis 6 mit den genauen Prozentgrenzen.',
      },
      {
        id: 'cgm_differentiation',
        title: '3. Binnendifferenzierung (G / M / E Niveaustufen) 🌈',
        content:
          'Unterrichtest du heterogene Lerngruppen? Aktiviere die Binnendifferenzierung:\n\n' +
          '- **G (Grundlegend)**: Prozent-Hürde senken (z. B. -5 %)\n' +
          '- **M (Mittel)**: Regulärer Standard-Maßstab (0 %)\n' +
          '- **E (Erweitert)**: Anspruch erhöhen (z. B. +3 %)\n\n' +
          'Die Live-Tabelle zeigt dir für jede Note sofort den exakten Schnitt je Niveau.',
        targetId: 'configurator-differentiation',
        placement: 'top',
        targetMode: 'configurator',
        badge: 'G / M / E Niveau',
      },
      {
        id: 'cgm_scale_mode',
        title: '4. Basis-Setup (Skala & Berechnungsmodell) ⚙️',
        content:
          'Im Tab **Basis-Setup** wählst du das fundamentale Bewertungssystem:\n\n' +
          '- **Klassische Noten 1–6**, **Oberstufe 0–15 Punkte (MSS)** oder **US Letter Grades**\n' +
          '- **Kategorien-Töpfe (Standard)**, **Freie Faktoren (1x, 2x)** oder **Total Points**\n' +
          '- **Leere Kategorien**: Automatische proportionale Skalierung, wenn im Halbjahr z.B. noch keine Klassenarbeit geschrieben wurde.',
        targetId: 'configurator-scale-mode',
        placement: 'top',
        targetMode: 'configurator',
        badge: 'Skala & Modell',
      },
      {
        id: 'cgm_live_simulator',
        title: '5. Live-Vertrauens-Check & 🧪 Sandbox 🔬',
        content:
          'In der rechten Spalte siehst du sofort die Auswirkung auf deine Noten:\n\n' +
          '- **Klassen-Check**: Wähle ein Kind aus deiner Klasse und schalte zwischen Niveaustufen um.\n' +
          '- **🧪 Sandbox**: Schiebe Testnoten frei hin und her oder wähle Schnell-Szenarien (*„Klassenbester“*, *„Bestehen“*, *„Kritisch“*), um deine Fachlogik vorab auf Herz und Nieren zu testen.',
        targetId: 'configurator-live-check',
        placement: 'left',
        targetMode: 'configurator',
        badge: 'Live-Simulator',
      },
      {
        id: 'cgm_templates',
        title: '6. Vorlagen speichern & schulweit teilen 💾',
        content:
          'Hast du dein ideales Modell konfiguriert? Klicke auf **Als Vorlage speichern**, um es für all deine weiteren Klassen und Schuljahre mit einem Klick wiederzuverwenden.\n\nGlobale Schulvorlagen stehen zudem automatisch oben zur 1-Klick-Übernahme bereit.',
        targetId: 'configurator-templates',
        placement: 'bottom',
        targetMode: 'configurator',
        badge: 'Wiederverwendbarkeit',
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
          'Eingabe nach deinen Wünschen per Tastatur:\n\n' +
          '- **Flexible Formate**: Wahlweise in **Prozent (%)**, **Rohpunkten (Pkt.)** oder **Direktnote (1–6)**\n' +
          '- **Navigation**: Mit `Enter` oder Pfeiltasten sofort zur nächsten Zeile springen\n' +
          '- **Attest/Krank**: Taste `K` klammert kranke Schüler neutral aus – ohne Null-Punkte-Fehler!',
        targetId: 'speed-grading-table',
        placement: 'bottom',
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
        placement: 'bottom',
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
          'Schütze die Privatsphäre deiner Schüler:innen am Klassenzimmer-Beamer:\n\n' +
          '- **Shortcut `Alt+P`**: Schaltet den Beamer-Schutz blitzschnell an oder aus\n' +
          '- **Weichzeichner**: Alle Schülernamen und Noten werden unleserlich geblurrt\n' +
          '- **Unterrichtstauglich**: Zeige Aufgaben oder den Notenspiegel an der Wand, ohne Noten preiszugeben',
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
        targetId: 'header-settings-btn',
        placement: 'bottom',
        targetMode: 'matrix',
        badge: 'E2EE Envelope Encryption',
        action: {
          label: 'Konto & Schutz öffnen',
          actionType: 'open_vault_inspector',
        },
      },
      {
        id: 'ps_offline',
        title: '100 % Offline-Fähig, PWA & Schullaufwerk-Spiegelung 📶',
        content:
          'Schlechtes oder fehlendes Schul-WLAN? Kein Problem!\n\n' +
          '- **PWA & Offline-First:** Gradus21 ist eine vollwertige Progressive Web App (PWA) und speichert und berechnet alles lokal via WebAssembly in deiner Browser-IndexedDB.\n' +
          '- **Automatisches Schullaufwerk-Backup:** Du kannst in den Einstellungen einen lokalen Ordner (z. B. auf dem Windows-/SMB-Dienstlaufwerk der Schule oder einem USB-Stick) verknüpfen. Gradus21 spiegelt jede Notenänderung automatisch dorthin.\n' +
          '- **Persistenter Speicher:** Browser-Updates oder Bereinigungen löschen deine Daten nicht – der Speicher ist durch die StorageManager API als persistent geschützt.',
        targetId: 'header-sync-status',
        placement: 'bottom',
        targetMode: 'matrix',
        badge: 'Offline-First & Local Backup',
      },
      {
        id: 'ps_optin',
        title: 'Striktes Cloud-Sync Opt-In & Schul-Datenschutz 🛡️',
        content:
          'Datenschutz nach dem Grundsatz der Datensparsamkeit (Privacy by Default):\n\n' +
          '- **Standardmäßig 100 % lokal:** Ohne deine ausdrückliche Zustimmung verlässt kein einziges Datenpaket dein Gerät. Für den rein lokalen Einsatz ist kein AVV mit Gradus21 erforderlich.\n' +
          '- **Optionaler Cloud-Sync (Opt-In):** Möchtest du zwischen Dienstlaptop und Heimarbeitsplatz synchronisieren, aktivierst du Cloud-Sync in den Einstellungen.\n' +
          '- **Schul-Datenschutz Leitfaden & AVV:** Beim Einschalten öffnet sich der Leitfaden für Schulleitung und Datenschutzbeauftragte mit einem rechtssicheren, vorausgefüllten AVV-Mustervertrag gem. Art. 28 DSGVO (Hosting im deutschen ISO-27001-Rechenzentrum Leipzig).',
        targetId: 'header-settings-btn',
        placement: 'bottom',
        targetMode: 'matrix',
        badge: 'Privacy by Default',
        action: {
          label: 'Speicher- & Cloud-Einstellungen öffnen',
          actionType: 'open_settings',
        },
      },
    ],
  },
];

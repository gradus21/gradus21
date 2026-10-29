import React from 'react';
import {
  FileText,
  CheckCircle2,
  X,
  ExternalLink,
  ShieldAlert,
  HardDrive,
  Download,
  Key,
  Cloud,
  GraduationCap,
  Scale,
  RefreshCw,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { useLegalConfig, getDisplayDomain } from '../utils/legalConfig';

export interface TermsOfServiceModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onClose: () => void;
}

export const TermsOfServiceModal: React.FC<TermsOfServiceModalProps> = ({
  isOpen,
  onAccept,
  onDecline,
  onClose,
}) => {
  const legalConfig = useLegalConfig();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="max-w-3xl w-full max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden relative"
        style={{
          backgroundColor: 'var(--bg-surface, #ffffff)',
          borderColor: 'var(--border-subtle, #e2e8f0)',
          color: 'var(--text-primary, #0f172a)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between gap-4 shrink-0"
          style={{ borderColor: 'var(--border-subtle, #e2e8f0)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  Nutzungsbedingungen
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300 uppercase tracking-wider">
                  Gradus21
                </span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary, #64748b)' }}>
                Hinweise zur Datenspeicherung & rechtliche Vereinbarung · Stand: Oktober 2026
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={legalConfig.terms_url || 'https://gradus21.de/nutzungsbedingungen.html'}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:opacity-80 py-1.5 px-2.5 rounded-lg border border-teal-500/20 bg-teal-500/10 transition"
              title={`Auf ${getDisplayDomain(legalConfig.terms_url)} im neuen Tab öffnen`}
            >
              <span>Online-Version ({getDisplayDomain(legalConfig.terms_url)})</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Schließen"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL CONTENT BODY (SCROLLABLE) */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6 text-xs sm:text-sm leading-relaxed">
          {/* Wichtige Kurzübersicht / Die 3 goldenen Sicherheitsregeln */}
          <div className="p-4 sm:p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100 space-y-2.5">
            <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Auf einen Blick: Die 3 goldenen Sicherheitsregeln für Lehrkräfte</span>
            </div>
            <ul className="text-xs space-y-2 leading-relaxed opacity-95">
              <li className="flex items-start gap-2">
                <span className="font-bold text-amber-600 dark:text-amber-400 mt-0.5">•</span>
                <span>
                  <strong>Keine automatischen Cloud-Backups im Standardbetrieb:</strong> Gradus21 speichert deine Noten standardmäßig rein lokal in der Datenbank deines Webbrowsers (IndexedDB). Ist die Cloud-Synchronisation nicht aktiv, erfolgen <strong>keine</strong> Server-Backups. Du bist für regelmäßige manuelle Sicherungen (Datei-Export) selbst verantwortlich.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-amber-600 dark:text-amber-400 mt-0.5">•</span>
                <span>
                  <strong>Vorsicht auf Schul-Rechnern mit Rücksetz-Software (HDGuard, Deep Freeze etc.):</strong> Rechner mit Kiosk- oder Rollback-Software löschen beim Herunterfahren das lokale Profil. Noten müssen am Ende jeder Arbeitsphase zwingend über den Button <em>„Tresor-Backup exportieren“</em> auf einem Netzlaufwerk oder USB-Stick gesichert werden!
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-amber-600 dark:text-amber-400 mt-0.5">•</span>
                <span>
                  <strong>Zero-Knowledge – Kein Passwort-Reset durch den Anbieter möglich:</strong> Dein Master-Passwort verlässt dein Gerät niemals im Klartext. Wenn du dein Master-Passwort vergisst und deinen 24-stelligen Notfall-Schlüssel nicht aufbewahrt hast, kann auch Gradus21 deine Daten nicht wiederherstellen.
                </span>
              </li>
            </ul>
          </div>

          {/* § 1 Geltungsbereich und Vertragsgegenstand */}
          <section className="space-y-2">
            <h4 className="font-bold text-sm border-b pb-1.5 flex items-center gap-2" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
              <Scale className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>§ 1 Geltungsbereich &amp; Vertragsgegenstand</span>
            </h4>
            <div className="space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
              <p>
                (1) Diese Nutzungsbedingungen regeln die Rechte und Pflichten zwischen <strong>{legalConfig.name || 'Julian Kallidat'}</strong> (nachfolgend <em>„Anbieter“</em>) und den Nutzerinnen und Nutzern (nachfolgend <em>„Nutzer“</em> oder <em>„Lehrkraft“</em>) bei der Nutzung der didaktischen Notenverwaltungs-Software <strong>Gradus21</strong>.
              </p>
              <p>
                (2) Gradus21 richtet sich ausschließlich an volljährige Personen (mindestens 18 Jahre alt), die als Lehrkräfte, Referendarinnen und Referendare, Schulleitungen oder pädagogisches Fachpersonal tätig sind, zur formelfreien Berechnung von Leistungsständen, Notenspiegeln und pädagogischen Dokumentationen im Schulalltag. Minderjährigen ist die Registrierung eines Benutzerkontos und die Nutzung der Software untersagt.
              </p>
              <p>
                (3) Mit dem Anlegen eines Benutzerkontos, dem Entsperren eines Tresors oder der Nutzung der lokalen Offline-Funktionen erkennt der Nutzer diese Nutzungsbedingungen verbindlich an.
              </p>
            </div>
          </section>

          {/* § 2 Betriebsarten und Lokale Speicherarchitektur (IndexedDB) */}
          <section className="space-y-2">
            <h4 className="font-bold text-sm border-b pb-1.5 flex items-center gap-2" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
              <HardDrive className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>§ 2 Betriebsarten &amp; Lokale Speicherarchitektur (IndexedDB)</span>
            </h4>
            <div className="space-y-2" style={{ color: 'var(--text-secondary)' }}>
              <p>
                (1) <strong>Offline-First-Grundprinzip:</strong> Gradus21 ist primär als dezentrale, offline-fähige Progressive Web App (PWA) konzipiert. In der Grundeinstellung werden alle Noten, Schülernamen und didaktischen Daten ausschließlich lokal in der internen Datenbank des jeweiligen Webbrowsers (IndexedDB / Cache Storage) des Nutzergeräts gespeichert.
              </p>
              <p>
                (2) <strong>Keine automatische Server-Ablage:</strong> Solange der Nutzer nicht aktiv und freiwillig die optionale Ende-zu-Ende-verschlüsselte Cloud-Synchronisation einschaltet, verbleiben sämtliche Daten zu 100 % auf dem jeweiligen Endgerät. Es findet keine serverseitige Speicherung, Übertragung oder serverseitige Datensicherung statt.
              </p>
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs space-y-1.5">
                <span className="font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                  <Info className="w-3.5 h-3.5 text-teal-600" />
                  <span>Besondere Hinweise zu Schul-IT-Infrastrukturen und Browserdaten:</span>
                </span>
                <p>
                  Obwohl Gradus21 persistenten Browserspeicher anfordert, weist der Anbieter ausdrücklich darauf hin, dass der lokale Browserspeicher in folgenden typischen Schulszenarien gelöscht werden kann:
                </p>
                <ul className="list-disc pl-5 space-y-1 opacity-90">
                  <li><strong>Schulrechner mit Rollback-Software (HDGuard, Deep Freeze):</strong> Kiosk- und Rollback-Systeme setzen beim Neustart oder Benutzerwechsel alle Browserdaten zurück.</li>
                  <li><strong>Browserbereinigung:</strong> Das Löschen von Verlauf, Cookies und Website-Daten löscht auch die lokale IndexedDB-Datenbank.</li>
                  <li><strong>Privater / Inkognito-Modus:</strong> Daten im privaten Fenster werden beim Schließen sofort und unwiderruflich gelöscht.</li>
                  <li><strong>Gerätewechsel:</strong> Ohne Export oder aktivierten Cloud-Sync sind Daten eines Geräts nicht automatisch auf anderen Geräten verfügbar.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* § 3 Pflicht zur eigenverantwortlichen Datensicherung */}
          <section className="space-y-2">
            <h4 className="font-bold text-sm border-b pb-1.5 flex items-center gap-2" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
              <Download className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>§ 3 Pflicht der Lehrkraft zur eigenverantwortlichen Datensicherung</span>
            </h4>
            <div className="space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
              <p>
                (1) Als rechtlich verantwortliche Stelle für die dienstliche Notenführung obliegt es der Lehrkraft, ihre Notendaten vor Datenverlust durch Hardwaredefekte, Betriebssystem-Updates oder lokale Browserbereinigungen zu schützen.
              </p>
              <p>
                (2) Gradus21 stellt hierfür intuitive Sicherungswerkzeuge bereit (verschlüsselte <code>.gradus21</code> Datei-Sicherung sowie automatisierte Dateisystem-Ordnerverknüpfung).
              </p>
              <p>
                (3) <strong>Sicherungsempfehlung:</strong> Der Nutzer verpflichtet sich, insbesondere nach Notenkonferenzen, Zeugniserfassungen oder größeren Prüfungskorrekturen eine externe Sicherungskopie zu exportieren.
              </p>
            </div>
          </section>

          {/* § 4 Zero-Knowledge & Ausschluss der Passwortwiederherstellung */}
          <section className="space-y-2">
            <h4 className="font-bold text-sm border-b pb-1.5 flex items-center gap-2" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
              <Key className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>§ 4 Zero-Knowledge-Architektur &amp; Master-Passwort / Notfall-Code</span>
            </h4>
            <div className="space-y-2" style={{ color: 'var(--text-secondary)' }}>
              <p>
                (1) <strong>Echte Ende-zu-Ende-Verschlüsselung:</strong> Alle Noten- und Schülerdaten werden mit modernen kryptografischen Standards (AES-256-GCM) direkt im Webbrowser verschlüsselt. Die Schlüsselableitung erfolgt clientseitig (PBKDF2 mit Argon2id-Parametern).
              </p>
              <p>
                (2) <strong>Kein Master-Key &amp; kein Passwort-Reset:</strong> Der Anbieter besitzt zu keinem Zeitpunkt Kenntnis über das Master-Passwort des Nutzers und verfügt über keinen administrativen Hauptschlüssel („Backdoor“).
              </p>
              <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-950 dark:text-rose-200 text-xs space-y-1">
                <span className="font-bold flex items-center gap-1.5 text-rose-800 dark:text-rose-300">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  Wichtiger Hinweis zum Ausschluss der Wiederherstellung:
                </span>
                <p className="leading-relaxed">
                  Vergisst der Nutzer sein Master-Passwort und liegt auch der 24-stellige Notfall-Code (Recovery Key) nicht vor, sind die verschlüsselten Daten <strong>mathematisch unwiederbringlich verloren</strong>. Der Anbieter kann das Passwort nicht zurücksetzen und keine Daten entschlüsseln.
                </p>
              </div>
              <p>
                (3) Der Nutzer ist verpflichtet, den beim Einrichten angezeigten 24-stelligen Notfall-Schlüssel auszudrucken oder an einem sicheren Ort (z. B. Passwort-Manager oder Dienstschrank) aufzubewahren.
              </p>
            </div>
          </section>

          {/* § 5 Optionale E2EE Cloud-Synchronisation und AVV */}
          <section className="space-y-2">
            <h4 className="font-bold text-sm border-b pb-1.5 flex items-center gap-2" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
              <Cloud className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>§ 5 Optionale E2EE Cloud-Synchronisation &amp; AVV (Art. 28 DSGVO)</span>
            </h4>
            <div className="space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
              <p>
                (1) Möchte der Nutzer Gradus21 auf mehreren Geräten (z. B. Dienst-Laptop und Heim-PC) nutzen, kann er die Ende-zu-Ende-verschlüsselte Cloud-Synchronisation optional aktivieren (Opt-In).
              </p>
              <p>
                (2) <strong>Hosting in Deutschland:</strong> Die verschlüsselten Chiffre-Daten werden ausschließlich auf ISO 27001 zertifizierten Servern in {legalConfig.hosting_location || 'Deutschland'} verarbeitet.
              </p>
              <p>
                (3) <strong>Auftragsverarbeitungsvertrag (AVV):</strong> Soweit im Rahmen der Cloud-Synchronisation personenbezogene Schülerdaten der Schule auf dem Server abgelegt werden, ist gemäß Art. 28 DSGVO ein Auftragsverarbeitungsvertrag erforderlich. Der Anbieter stellt hierfür einen vorausgefüllten Muster-AVV zur Verfügung.
              </p>
            </div>
          </section>

          {/* § 6 Schulrechtliche Bestimmungen und Dienstliche Pflichten */}
          <section className="space-y-2">
            <h4 className="font-bold text-sm border-b pb-1.5 flex items-center gap-2" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
              <GraduationCap className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>§ 6 Schulrechtliche Bestimmungen &amp; Genehmigungen</span>
            </h4>
            <div className="space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
              <p>
                (1) Die Erfassung und Verarbeitung von Schüler- und Notendaten unterliegt den Schuldatenschutzgesetzen und Dienstordnungen des jeweiligen Bundeslandes.
              </p>
              <p>
                (2) Die Lehrkraft stellt eigenverantwortlich sicher, dass die Nutzung privater oder dienstlicher Endgeräte für Notenberechnungen im Einklang mit den schulinternen Regelungen und etwaigen Genehmigungsvorbehalten der Schulleitung steht.
              </p>
            </div>
          </section>

          {/* § 7 Gewährleistung und Haftungsbeschränkung */}
          <section className="space-y-2">
            <h4 className="font-bold text-sm border-b pb-1.5 flex items-center gap-2" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
              <Scale className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>§ 7 Verfügbarkeit, Gewährleistung &amp; Haftungsbeschränkung</span>
            </h4>
            <div className="space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
              <p>
                (1) Gradus21 wird nach dem Stand der Technik und unter Einhaltung strenger Sicherheitskriterien bereitgestellt.
              </p>
              <p>
                (2) <strong>Gesetzliche Haftung:</strong> Der Anbieter haftet unbeschränkt für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie für Schäden, die auf Vorsatz oder grober Fahrlässigkeit beruhen.
              </p>
              <p>
                (3) <strong>Haftungsausschluss bei unterlassener Sicherung:</strong> Der Anbieter haftet ausdrücklich <strong>nicht</strong> für den Verlust von Daten, wenn der Schaden darauf beruht, dass entgegen den Vorgaben keine regelmäßigen Sicherungskopien angefertigt wurden, Kiosk-/Rollback-Software Daten gelöscht hat oder das Master-Passwort nebst Notfall-Schlüssel verloren wurde.
              </p>
            </div>
          </section>

          {/* § 8 Änderungen & § 9 Schlussbestimmungen */}
          <section className="space-y-2">
            <h4 className="font-bold text-sm border-b pb-1.5 flex items-center gap-2" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
              <RefreshCw className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>§ 8 &amp; § 9 Änderungen &amp; Schlussbestimmungen</span>
            </h4>
            <div className="space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
              <p>
                (1) Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts (CISG).
              </p>
              <p>
                (2) Anbieterkontakt: {legalConfig.name || 'Julian Kallidat'}, {legalConfig.address || 'Hardtstr. 6, 76467 Bietigheim'} · E-Mail: <a href={`mailto:${legalConfig.email || 'kontakt@gradus21.de'}`} className="text-teal-600 font-semibold underline">{legalConfig.email || 'kontakt@gradus21.de'}</a>
              </p>
            </div>
          </section>
        </div>

        {/* MODAL FOOTER WITH ANNEHMEN / ABLEHNEN BUTTONS */}
        <div
          className="px-6 py-4 border-t bg-slate-50/70 dark:bg-slate-900/70 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle, #e2e8f0)' }}
        >
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Durch Klicken auf „Annehmen“ erklärst du dich mit den Bedingungen einverstanden.
          </div>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onDecline}
              className="px-4 py-2.5 rounded-xl border text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center gap-1.5"
              style={{
                borderColor: 'var(--border-subtle, #e2e8f0)',
                color: 'var(--text-secondary, #64748b)',
              }}
            >
              <X className="w-4 h-4" />
              <span>Ablehnen</span>
            </button>

            <button
              type="button"
              onClick={onAccept}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm hover:opacity-95 transition flex items-center justify-center gap-1.5"
              style={{ backgroundColor: 'var(--primary-500, #0d9488)' }}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Nutzungsbedingungen annehmen</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

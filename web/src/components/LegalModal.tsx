import React, { useEffect, useState } from 'react';
import {
  Building2,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  GraduationCap,
  Info,
  Lock,
  Printer,
  Scale,
  Server,
  Shield,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useLegalConfig, getDisplayDomain, LegalConfigData } from '../utils/legalConfig';

export type LegalTab = 'impressum' | 'privacy' | 'school_guide' | 'avv';

interface LegalModalProps {
  isOpen: boolean;
  initialTab?: LegalTab;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({
  isOpen,
  initialTab = 'impressum',
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);
  const config = useLegalConfig();
  const [copiedAvv, setCopiedAvv] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [schoolStreet, setSchoolStreet] = useState('');
  const [schoolCity, setSchoolCity] = useState('');
  const [schoolSigDate, setSchoolSigDate] = useState('');
  const [schoolSigPerson, setSchoolSigPerson] = useState('');

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyAvv = () => {
    const el = document.getElementById('gradus21-avv-document');
    if (el) {
      navigator.clipboard.writeText(el.innerText);
      setCopiedAvv(true);
      setTimeout(() => setCopiedAvv(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)' }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                Rechtliches & Datenschutz
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gradus21 · Compliance nach deutschem & EU-Recht
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition inline-flex items-center justify-center shrink-0"
            aria-label="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 bg-slate-50/50 dark:bg-slate-900/40 gap-1 overflow-x-auto text-xs font-semibold shrink-0">
          <button
            onClick={() => setActiveTab('impressum')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
              activeTab === 'impressum'
                ? 'border-teal-600 text-teal-700 dark:text-teal-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Impressum (§ 5 DDG)</span>
          </button>

          <button
            onClick={() => setActiveTab('privacy')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
              activeTab === 'privacy'
                ? 'border-teal-600 text-teal-700 dark:text-teal-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Datenschutz (Art. 13 DSGVO)</span>
          </button>

          <button
            onClick={() => setActiveTab('school_guide')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
              activeTab === 'school_guide'
                ? 'border-teal-600 text-teal-700 dark:text-teal-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Schul-Datenschutz & Leitfaden</span>
          </button>

          <button
            onClick={() => setActiveTab('avv')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
              activeTab === 'avv'
                ? 'border-teal-600 text-teal-700 dark:text-teal-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>AVV-Mustervertrag (Art. 28)</span>
          </button>

          <div className="ml-auto hidden sm:flex items-center gap-2 shrink-0">
            <a
              href={config.terms_url || 'https://gradus21.de/nutzungsbedingungen.html'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400 py-1.5 px-2.5 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950/30 transition"
              title="Nutzungsbedingungen auf Website öffnen (neues Fenster)"
            >
              <span>Nutzungsbedingungen</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href={config.avv_url || 'https://gradus21.de/avv.html'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400 py-1.5 px-2.5 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950/30 transition"
              title="AVV-Mustervertrag auf Website öffnen (neues Fenster)"
            >
              <span>{getDisplayDomain(config.avv_url)}/avv</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 text-sm text-slate-700 dark:text-slate-300 space-y-6 leading-relaxed">
          {/* TAB 1: IMPRESSUM */}
          {activeTab === 'impressum' && (
            <div className="space-y-6 animate-in fade-in duration-100">
              <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-900 dark:text-teal-200">
                <p className="font-semibold mb-1">Anbieterkennzeichnung gem. § 5 Digitale-Dienste-Gesetz (DDG)</p>
                <p>
                  Diese Angaben sind über Docker-Umgebungsvariablen (<code>LEGAL_IMPRESSUM_*</code>) auf dem Host
                  vollständig konfigurierbar.
                </p>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Dienstanbieter</h3>
                {config.company && (
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{config.company}</p>
                )}
                <p className="font-medium text-slate-900 dark:text-slate-100">{config.name}</p>
                <p className="whitespace-pre-line text-slate-600 dark:text-slate-400">{config.address}</p>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Kontakt</h3>
                <p>
                  Website:{' '}
                  <a
                    href="https://gradus21.de"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-600 dark:text-teal-400 underline font-medium"
                  >
                    https://gradus21.de
                  </a>
                </p>
                <p>
                  E-Mail:{' '}
                  <a
                    href={`mailto:${config.email}`}
                    className="text-teal-600 dark:text-teal-400 underline font-medium"
                  >
                    {config.email}
                  </a>
                </p>
                {config.phone && <p>Telefon: {config.phone}</p>}
              </div>

              {config.representative && (
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Vertreten durch</h3>
                  <p>{config.representative}</p>
                </div>
              )}

              {config.register && (
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Registereintrag</h3>
                  <p>{config.register}</p>
                </div>
              )}

              {config.vat_id && (
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                    Umsatzsteuer-Identifikationsnummer
                  </h3>
                  <p>USt-IdNr. gem. § 27a UStG: {config.vat_id}</p>
                </div>
              )}

              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                  Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
                </h3>
                <p>{config.name}</p>
                <p className="text-slate-500 dark:text-slate-400">{config.address}</p>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Hosting & Rechenzentrum</h3>
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs">
                  <Server className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {config.hosting_provider}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400">
                      Standort: {config.hosting_location}
                    </p>
                    <p className="mt-1 text-slate-600 dark:text-slate-400">
                      Der Server und die Datenbank werden ausschließlich in der Bundesrepublik Deutschland (EU)
                      betrieben. Es findet kein Transfer in unsichere Drittstaaten statt.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DATENSCHUTZERKLÄRUNG */}
          {activeTab === 'privacy' && (
            <div className="space-y-6 animate-in fade-in duration-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                  Datenschutzerklärung gem. Art. 13 DSGVO
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Stand: Oktober 2026 · Gültig für gradus21.app
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-900 dark:text-teal-200 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-teal-600" />
                  Zero-Knowledge-Garantie & E2EE Envelope-Architektur
                </p>
                <p>
                  Gradus21 wurde nach dem Prinzip „Privacy by Design“ entwickelt. Alle sensiblen Schülerdaten (Namen,
                  Einzelnoten, Gewichtungen, Krankheits- und Attestvermerke) werden <strong>ausschließlich im Browser der
                  Lehrkraft mit AES-256-GCM verschlüsselt</strong>. Der Serverbetreiber besitzt zu keinem Zeitpunkt
                  Kenntnis über Ihren Schlüssel oder die Klartextdaten.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white">1. Verantwortliche Stelle</h4>
                <p>
                  Verantwortlich für die Datenverarbeitung auf dieser Website ist der im Impressum genannte
                  Dienstanbieter:
                </p>
                <div className="text-xs bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <p className="font-semibold">{config.name}</p>
                  <p>{config.address}</p>
                  <p>E-Mail: {config.email}</p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white">
                  2. Verzicht auf Tracking, Analysetools & externe CDNs
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  <li>
                    <strong>Keine Werbe- oder Marketing-Cookies:</strong> Es werden keine Tracking-Cookies (wie Google
                    Analytics, Meta Pixel o. Ä.) gesetzt.
                  </li>
                  <li>
                    <strong>Lokal gehostete Schriftarten:</strong> Alle Schriftarten (JetBrains Mono, Plus Jakarta Sans)
                    werden direkt vom eigenen Server ausgeliefert. Es erfolgt keine Verbindung zu Google-Servern in den USA.
                  </li>
                  <li>
                    <strong>Keine Drittanbieter-CDNs:</strong> Sämtliche Skripte, Styles und WebAssembly-Binaries stammen
                    ausschließlich von dieser Domäne.
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white">
                  3. Bereitstellung der Website & Server-Logfiles
                </h4>
                <p className="text-xs">
                  Beim Aufruf von gradus21.app erfasst der Webserver temporär Verbindungsdaten (IP-Adresse, Datum/Uhrzeit,
                  abgerufene Ressource, HTTP-Statuscode, User-Agent). Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO
                  (berechtigtes Interesse an der technischen Stabilität, IT-Sicherheit und Abwehr böswilliger
                  DDoS-Angriffe). Server-Logs werden nach maximal 7 Tagen automatisch rotiert und gelöscht.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white">
                  4. Benutzerkonto, Authentifizierung & Synchronisation
                </h4>
                <p className="text-xs">
                  Bei der Registrierung einer Lehrkraft verarbeitet der Server:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  <li>E-Mail-Adresse (zur Identifikation und für optionale System-Benachrichtigungen)</li>
                  <li>KDF-Salt und kryptografische Parameter (Argon2id, OWASP-konform)</li>
                  <li>Verschlüsselter Datenschlüssel (<code>encrypted_dek</code>) – nur mit dem Master-Passwort der Lehrkraft entschlüsselbar</li>
                  <li>Passkey-IDs (WebAuthn / FIDO2) und verschlüsselte TOTP-2FA-Secrets</li>
                  <li>Chiffrierte Datenpakete (Envelopes mit <code>AES-256-GCM</code>)</li>
                </ul>
                <p className="text-xs">
                  Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Erfüllung des Nutzungsvertrags zur Bereitstellung der
                  Notensynchronisation).
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white">
                  5. Lokale Datenspeicherung (LocalStorage gem. § 25 TDDDG)
                </h4>
                <p className="text-xs">
                  Die App verwendet die lokale Speicherfunktion Ihres Browsers (<code>localStorage</code>), um Ihre
                  aktive Session, Farbschema-Präferenzen und hardware-gebundene Passkey-Metadaten zu sichern. Gemäß § 25
                  Abs. 2 Nr. 2 TDDDG ist hierfür kein Cookie-Banner erforderlich, da die Speicherung technisch zwingend
                  notwendig ist, um den vom Nutzer ausdrücklich gewünschten Dienst bereitzustellen.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white">6. Betroffenenrechte</h4>
                <p className="text-xs">
                  Sie haben nach der DSGVO jederzeit das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung
                  (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) sowie Widerspruch
                  (Art. 21). Zur Ausübung wenden Sie sich an die oben genannte E-Mail-Adresse.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: SCHUL-DATENSCHUTZ & LEITFADEN */}
          {activeTab === 'school_guide' && (
            <div className="space-y-6 animate-in fade-in duration-100">
              <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-900 dark:text-teal-200">
                <p className="font-bold flex items-center gap-1.5 mb-1 text-sm">
                  <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  Neu: Standardmäßig 100 % lokaler Betrieb &amp; Schullaufwerk-Backup
                </p>
                <p>
                  Gradus21 setzt das Prinzip <strong>„Privacy by Default“</strong> konsequent um:
                  Die Cloud-Synchronisation ist <strong>standardmäßig deaktiviert (Opt-In)</strong>.
                  Alle Noten- und Schülerdaten verbleiben ausschließlich im lokalen Speicher Ihres Browsers.
                  Es fließen keinerlei schülerbezogene Daten an Server von Gradus21, solange Sie Cloud-Sync nicht aktiv einschalten.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200">
                <p className="font-bold flex items-center gap-1.5 mb-1">
                  <GraduationCap className="w-4 h-4 text-amber-600" />
                  Rechtlicher Rahmen für Lehrkräfte in Deutschland
                </p>
                <p>
                  Schüler- und Notendaten unterliegen den <strong>Schulgesetzen und Schuldatenschutzverordnungen der
                  16 Bundesländer</strong> (z. B. VO-DV I/II in NRW, BaySchO/BayEUG in Bayern). Beamte und Angestellte im
                  Schuldienst dürfen dienstliche Daten nicht eigenmächtig auf privaten Cloud-Plattformen verarbeiten.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    Modus 1 (Standard)
                  </span>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    100 % Lokaler Betrieb (Kein AVV nötig)
                  </h4>
                  <p className="text-slate-600 dark:text-slate-300">
                    Wenn Sie Gradus21 auf Ihrem Dienstgerät lokal nutzen, werden Noten ausschließlich in der Browser-IndexedDB
                    gespeichert.
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400">
                    <li>Vollständig offline nutzbar als Progressive Web App (PWA).</li>
                    <li>
                      <strong>Schullaufwerk-Spiegelung:</strong> Wählen Sie in den Einstellungen einen lokalen Schulordner
                      (z. B. auf einem gemounteten SMB/Windows-Dienstlaufwerk). Gradus21 sichert bei jeder Notenänderung
                      automatisch verschlüsselte Sicherungsdateien.
                    </li>
                    <li>
                      <strong>Rechtsfolge:</strong> Da keine Daten extern verarbeitet werden, ist <em>kein AVV mit Gradus21
                      erforderlich</em>.
                    </li>
                  </ul>
                </div>

                <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900/40 space-y-2">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-teal-200 text-teal-800 dark:bg-teal-900 dark:text-teal-200">
                    Modus 2 (Optional)
                  </span>
                  <h4 className="font-bold text-teal-950 dark:text-teal-200 text-sm">
                    Cloud-Synchronisation (Opt-In &amp; AVV)
                  </h4>
                  <p className="text-slate-600 dark:text-slate-300">
                    Möchten Sie Noten Ende-zu-Ende verschlüsselt zwischen Dienstlaptop und Heimarbeitsplatz synchronisieren?
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400">
                    <li>
                      <strong>Zero-Knowledge E2EE:</strong> Daten verlassen Ihr Gerät nur als mit AES-256-GCM verschlüsselte
                      Pakete.
                    </li>
                    <li>
                      <strong>Schul-AVV:</strong> Schließen Sie vor Aktivierung den vorbereiteten AVV gem. Art. 28 DSGVO
                      (nächster Reiter) mit Ihrer Schulleitung / dem bDSB ab.
                    </li>
                    <li>
                      <strong>1-Klick-Löschung:</strong> Sie können jederzeit alle verschlüsselten Server-Daten mit einem Klick
                      wieder rückstandslos vom Server löschen.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Drei Schritte für die Schulleitung &amp; den Datenschutzbeauftragten (bDSB)
                </h3>
                <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                  <li>
                    <strong>1. Information der Schulleitung:</strong> Informieren Sie Ihre Schulleitung über den geplanten
                    Einsatz und wählen Sie, ob Sie Gradus21 rein lokal oder mit synchronisiertem Cloud-Sync betreiben möchten.
                  </li>
                  <li>
                    <strong>2. AVV-Mustervertrag aufrufen (bei Cloud-Sync):</strong> Öffnen Sie den vorbereiteten{' '}
                    <a
                      href={config.avv_url || 'https://gradus21.de/avv.html'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-600 dark:text-teal-400 underline font-semibold inline-flex items-center gap-1"
                    >
                      <span>AVV-Mustervertrag auf {getDisplayDomain(config.avv_url)}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    {' '}oder nutzen Sie den Reiter <em>„AVV-Mustervertrag (Art. 28)“</em>, tragen Sie die Daten Ihrer Schule ein und drucken Sie das Dokument aus oder speichern Sie es als PDF. Der Vertrag ist durch den Betreiber bereits vorab elektronisch nach Art. 28 Abs. 9 DSGVO signiert.
                  </li>
                  <li>
                    <strong>3. Opt-In in den Einstellungen aktivieren:</strong> Nach Genehmigung aktivieren Sie in Gradus21
                    unter Einstellungen die Option <em>„Cloud-Synchronisation aktivieren (Opt-In)“</em>.
                  </li>
                </ol>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Warum Zero-Knowledge E2EE das ideale Argument für Ihren DSB ist
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                    <p className="font-bold text-teal-600 mb-1">100 % Rust/WASM im Browser</p>
                    <p className="text-slate-500 dark:text-slate-400">
                      Durchschnitte, Niveaustufen (G/M/E) und Rundungen werden lokal in WebAssembly berechnet. Keine Noten
                      gehen an Server-APIs zur Berechnung.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                    <p className="font-bold text-teal-600 mb-1">AES-256-GCM Envelope Encryption</p>
                    <p className="text-slate-500 dark:text-slate-400">
                      Der Betreiber des Servers kann selbst bei physischem Zugriff auf die Festplatte keine Schülernamen
                      oder Noten lesen.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                    <p className="font-bold text-teal-600 mb-1">Deutscher Serverstandort Leipzig</p>
                    <p className="text-slate-500 dark:text-slate-400">
                      Hosting ausschließlich im ISO-27001 zertifizierten Rechenzentrum Leipzig (Alfahosting GmbH). Keine
                      US-Hyperscaler, kein CLOUD-Act-Risiko.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AVV-MUSTERVERTRAG */}
          {activeTab === 'avv' && (
            <div className="space-y-6 animate-in fade-in duration-100">
              {/* Highlight Card: Link to official AVV page (gradus21.de or Docker self-host) */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-teal-500/15 via-teal-500/10 to-transparent border border-teal-500/30 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-800 dark:text-teal-200">
                        Offizielle Vorlage
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Art. 28 DSGVO &amp; TOMs
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Auftragsverarbeitungsvertrag auf {getDisplayDomain(config.avv_url)}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
                      Für die verschlüsselte Cloud-Synchronisation von Noten- und Schülerdaten steht der rechtssichere AVV-Mustervertrag online zur Verfügung – mit interaktivem Formular, Dokumentation der technischen &amp; organisatorischen Maßnahmen (TOMs) und 1-Klick-PDF-Export.
                    </p>
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
                    <a
                      href={config.avv_url || 'https://gradus21.de/avv.html'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-2 transition shadow-sm"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>AVV auf {getDisplayDomain(config.avv_url)} öffnen</span>
                    </a>

                    {config.avv_download_url && (
                      <a
                        href={config.avv_download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-sm"
                        title="Vollständigen AVV direkt als PDF herunterladen"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>PDF herunterladen</span>
                      </a>
                    )}
                  </div>
                </div>

                {config.avv_custom_text && (
                  <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-900 dark:text-teal-200">
                    <p className="font-semibold mb-0.5">Spezifischer Hinweis für diese Instanz:</p>
                    <p>{config.avv_custom_text}</p>
                  </div>
                )}

                <div className="pt-2 border-t border-teal-500/20 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                    100 % Zero-Knowledge E2EE (AES-256-GCM) · ISO-27001 Server {config.hosting_location}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    Self-Hosting Docker-Env: <code>LEGAL_AVV_URL</code> / <code>LEGAL_AVV_CUSTOM_TEXT</code>
                  </span>
                </div>
              </div>

              {/* Local interactive editor & print preview */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-xs">
                <div>
                  <p className="font-bold text-teal-900 dark:text-teal-200">
                    Integrierter AVV-Vertragsentwurf (Lokale Voransicht &amp; Direktdruck)
                  </p>
                  <p className="text-teal-800/80 dark:text-teal-300/80">
                    Alternativ können Sie die Schuldaten auch direkt hier im Browser eintragen und das Dokument ausdrucken.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleCopyAvv}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1.5 hover:bg-slate-50 transition shadow-sm"
                  >
                    {copiedAvv ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedAvv ? 'Kopiert!' : 'Vertrag kopieren'}</span>
                  </button>
                  <button
                    onClick={handlePrint}
                    className="px-3 py-1.5 rounded-xl bg-teal-600 text-white font-semibold flex items-center gap-1.5 hover:bg-teal-700 transition shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Drucken / Als PDF speichern</span>
                  </button>
                </div>
              </div>

              {/* Printable Document Box */}
              <div
                id="gradus21-avv-document"
                className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 space-y-5 font-mono leading-relaxed"
              >
                <div className="text-center font-bold text-sm border-b border-slate-200 dark:border-slate-800 pb-3">
                  VEREINBARUNG ZUR AUFTRAGSVERARBEITUNG (AVV)<br />
                  <span className="text-xs font-normal text-slate-500">gemäß Art. 28 der Datenschutz-Grundverordnung (DSGVO)</span>
                </div>

                <div className="space-y-3">
                  <p>
                    <strong>Zwischen:</strong>
                  </p>
                  <div className="pl-4 border-l-2 border-teal-500 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-r-xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <span className="text-[11px] text-slate-500 w-28 shrink-0">Schule / Träger:</span>
                      <input
                        type="text"
                        value={schoolName}
                        onChange={(e) => setSchoolName(e.target.value)}
                        placeholder="Name der Schule / des Schulträgers eintragen..."
                        className="w-full px-2.5 py-1 text-xs border border-teal-300 dark:border-teal-700 rounded-lg bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <span className="text-[11px] text-slate-500 w-28 shrink-0">Straße &amp; Nr.:</span>
                      <input
                        type="text"
                        value={schoolStreet}
                        onChange={(e) => setSchoolStreet(e.target.value)}
                        placeholder="Straße und Hausnummer..."
                        className="w-full px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <span className="text-[11px] text-slate-500 w-28 shrink-0">PLZ &amp; Ort:</span>
                      <input
                        type="text"
                        value={schoolCity}
                        onChange={(e) => {
                          setSchoolCity(e.target.value);
                          if (!schoolSigDate || schoolSigDate.startsWith(e.target.value)) {
                            setSchoolSigDate(`${e.target.value}, den ${new Date().toLocaleDateString('de-DE')}`);
                          }
                        }}
                        placeholder="Postleitzahl und Ort..."
                        className="w-full px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="text-[10px] text-slate-500 pt-1">
                      – nachfolgend <strong>„Auftraggeber“</strong> oder <strong>„Schule“</strong> genannt –
                    </div>
                  </div>

                  <p>
                    <strong>und:</strong>
                  </p>
                  <div className="pl-4 border-l-2 border-slate-400 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-r-xl border border-slate-200 dark:border-slate-700 text-xs">
                    <p className="font-bold text-slate-900 dark:text-white">
                      {config.company ? `${config.company}, ` : ''}{config.name} (Gradus21)
                    </p>
                    <p>{config.address}</p>
                    <p>E-Mail: {config.email}</p>
                    <div className="text-[10px] text-slate-500 pt-1">
                      – nachfolgend <strong>„Auftragnehmer“</strong> genannt –
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">– gemeinsam nachfolgend „die Parteien“ genannt –</p>
                </div>

                <div className="space-y-1.5 pt-2">
                  <h4 className="font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-1">
                    § 1 Gegenstand und Dauer der Vereinbarung
                  </h4>
                  <p>
                    (1) <strong>Gegenstand des Auftrags:</strong> Der Auftragnehmer stellt dem Auftraggeber die Web-Applikation
                    und den Synchronisationsserver „Gradus21“ zur pädagogischen Notenberechnung, Leistungsdokumentation
                    und Datensicherung zur Verfügung.
                  </p>
                  <p>
                    (2) <strong>Dauer:</strong> Die Vereinbarung tritt mit Unterzeichnung bzw. elektronischer Bereitstellung in
                    Kraft und wird auf unbestimmte Zeit geschlossen. Sie kann von jeder Partei mit einer Frist von einem
                    Monat zum Monatsende gekündigt werden.
                  </p>
                </div>

                <div className="space-y-1.5 pt-2">
                  <h4 className="font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-1">
                    § 2 Konkretisierung des Auftragsinhalts
                  </h4>
                  <p>
                    (1) <strong>Art und Zweck der Verarbeitung:</strong> Automatisierte Zwischenspeicherung, Synchronisation
                    und Bereitstellung von Ende-zu-Ende-verschlüsselten Datensätzen zur Notenverwaltung, Binnendifferenzierung
                    und Vorbereitung von Klassenkonferenzen und Elterngesprächen.
                  </p>
                  <p>(2) <strong>Arten der verarbeiteten Daten:</strong></p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Benutzerkontodaten der Lehrkraft (E-Mail-Adresse, Passkey-Credentials, Argon2id KDF-Salts, verschlüsselter DEK).</li>
                    <li>Schülerbezogene Daten: Namen von Schülerinnen und Schülern, Niveaustufenzuordnungen (G/M/E), Prüfungsergebnisse, Zeugnisnoten und Fehlzeiten-/Krankheitsvermerke.</li>
                  </ul>
                  <div className="text-[11px] p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <strong>Klarstellung zur Zero-Knowledge-Architektur:</strong> Sämtliche schülerbezogene Daten verlassen das Endgerät
                    der Lehrkraft ausschließlich als mit <code>AES-256-GCM</code> chiffrierte Datenpakete (Envelopes). Der Auftragnehmer
                    besitzt zu keinem Zeitpunkt Zugriff auf den Entschlüsselungsschlüssel (DEK) oder Klartextdaten.
                  </div>
                  <p>
                    (3) <strong>Kategorien betroffener Personen:</strong> Lehrkräfte sowie Schülerinnen und Schüler des Auftraggebers.
                  </p>
                </div>

                <div className="space-y-1.5 pt-2">
                  <h4 className="font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-1">
                    § 3 Technische und organisatorische Maßnahmen (TOM gem. Art. 32 DSGVO)
                  </h4>
                  <p>
                    (1) Der Auftragnehmer gewährleistet die Einhaltung modernster Sicherheitsstandards (State of the Art) gem. Art. 32 DSGVO:
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      <strong>Vertraulichkeit &amp; Client-Side E2EE:</strong> Alle Berechnungen laufen lokal in WebAssembly im Browser.
                      Verschlüsselung der Nutzdaten via AES-256-GCM mit Argon2id Master-Key-Ableitung (19 MiB RAM, OWASP-Standard).
                    </li>
                    <li>
                      <strong>Integrität &amp; Authentizität:</strong> Authenticated Encryption (AEAD) schützt jeden Datensatz kryptografisch
                      gegen unbemerkte Manipulation.
                    </li>
                    <li>
                      <strong>Server-Standort &amp; Rechenzentrum:</strong> Das Hosting erfolgt ausschließlich in Deutschland im
                      ISO-27001 zertifizierten Rechenzentrum Leipzig ({config.hosting_provider}) mit redundanter Notstromversorgung,
                      Brandschutz mit Sauerstoffreduktion und DE-CIX-Anbindung. Kein Einsatz von US-Hyperscalern (kein CLOUD-Act-Risiko).
                    </li>
                    <li>
                      <strong>Transportverschlüsselung:</strong> Durchgängiges TLS 1.3 / HTTPS mit Perfect Forward Secrecy und HSTS.
                    </li>
                    <li>
                      <strong>Verfügbarkeit &amp; Belastbarkeit:</strong> Automatisierte Snapshot-Backups auf getrennten Storage-Volumes mit
                      einstellbarer Aufbewahrungsfrist (Retention).
                    </li>
                  </ul>
                </div>

                <div className="space-y-1.5 pt-2">
                  <h4 className="font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-1">
                    § 4 Unterauftragsverhältnisse (Subunternehmer)
                  </h4>
                  <p>(1) Der Auftraggeber stimmt der Einbindung folgenden Unterauftragnehmers zu:</p>
                  <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <strong>{config.hosting_provider}</strong><br />
                    Ankerstraße 3b, 06108 Halle (Saale), Deutschland<br />
                    Rechenzentrumsstandort: <strong>{config.hosting_location}</strong><br />
                    Dienstleistung: Bereitstellung von Server-Infrastruktur, Colocation &amp; Netzwerkanbindung.
                  </div>
                  <p>
                    (2) Eine Übermittlung von Daten an Drittländer außerhalb der Europäischen Union (EU) bzw. des Europäischen
                    Wirtschaftsraums (EWR) findet nicht statt.
                  </p>
                </div>

                <div className="space-y-1.5 pt-2">
                  <h4 className="font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-1">
                    § 5 Rechte und Pflichten des Auftraggebers
                  </h4>
                  <p>
                    (1) Der Auftraggeber ist im Sinne der DSGVO alleiniger Verantwortlicher für die Rechtmäßigkeit der Verarbeitung
                    der Schülerdaten nach den geltenden Schulgesetzen.
                  </p>
                  <p>
                    (2) Der Auftraggeber hat das Recht, sich vor Beginn der Verarbeitung und sodann regelmäßig von der Einhaltung
                    der technischen und organisatorischen Maßnahmen zu überzeugen.
                  </p>
                </div>

                <div className="space-y-1.5 pt-2">
                  <h4 className="font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-1">
                    § 6 Löschung und Rückgabe von Daten
                  </h4>
                  <p>
                    (1) Nach Beendigung des Auftragsverhältnisses oder auf Aufforderung des Auftraggebers löscht der Auftragnehmer
                    sämtliche verschlüsselten Datensätze unwiderruflich, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
                  </p>
                  <p>
                    (2) Der Auftraggeber bzw. die autorisierte Lehrkraft kann die Löschung sämtlicher serverseitig gespeicherten
                    Chiffre-Pakete (Envelopes) zudem jederzeit selbstständig über die Applikation mittels 1-Klick-Löschfunktion
                    anstoßen. Die Datensätze werden dabei unmittelbar und unwiderruflich aus der Server-Datenbank entfernt.
                  </p>
                </div>

                {/* Signature Block */}
                <div className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-6 border-t border-slate-200 dark:border-slate-800 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                    <p className="font-bold text-slate-900 dark:text-white">Für den Auftraggeber (Schule / Schulträger):</p>
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={schoolSigDate}
                        onChange={(e) => setSchoolSigDate(e.target.value)}
                        placeholder="Ort, Datum..."
                        className="w-full px-2 py-0.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 font-mono"
                      />
                      <input
                        type="text"
                        value={schoolSigPerson}
                        onChange={(e) => setSchoolSigPerson(e.target.value)}
                        placeholder="Name &amp; Amtsbezeichnung (z. B. Schulleiter/in)..."
                        className="w-full px-2 py-0.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 font-mono"
                      />
                    </div>
                    <div className="border-b border-slate-400 pt-8"></div>
                    <p className="text-[10px] text-slate-500 text-center">Unterschrift &amp; Schulstempel</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-slate-900 dark:text-white">Für den Auftragnehmer (Gradus21):</p>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-200/60 text-teal-900 dark:bg-teal-900/60 dark:text-teal-200">
                        Vorausgefüllt
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-700 dark:text-slate-300 space-y-0.5">
                      <p>Ort, Datum: Bietigheim, den {new Date().toLocaleDateString('de-DE')}</p>
                      <p>Name: {config.name}</p>
                      <p>Funktion: Inhaber &amp; Dienstanbieter Gradus21</p>
                    </div>
                    <div className="pt-3 border-b border-teal-600/40 pb-1 flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 dark:text-white">gez. {config.name}</span>
                      <span className="text-[10px] text-teal-700 dark:text-teal-300 font-semibold">✓ Elektronisch gezeichnet</span>
                    </div>
                    <p className="text-[9px] text-slate-500 leading-tight">
                      Rechtsgültig in elektronischer Form gemäß Art. 28 Abs. 9 DSGVO ohne Erfordernis einer handschriftlichen Schriftform.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 leading-relaxed">
                  <strong>Hinweis für die Schulverwaltung:</strong> Falls Ihre Schulleitung oder Ihr Schulträger ein beidseitig
                  handschriftlich unterzeichnetes Exemplar mit Firmenstempel oder qualifizierter elektronischer Signatur (QES)
                  wünscht, senden Sie das ausgefüllte Formular bitte kurz an{' '}
                  <a href="mailto:kontakt@gradus21.de" className="text-teal-600 dark:text-teal-400 underline font-semibold">
                    kontakt@gradus21.de
                  </a>
                  . Sie erhalten die Gegenzeichnung umgehend zurück.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between shrink-0 text-xs text-slate-500">
          <span>Gradus21 · DSGVO- & DDG-konforme Bereitstellung</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold transition"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};

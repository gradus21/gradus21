import React, { useEffect, useState } from 'react';
import {
  Building2,
  Check,
  Copy,
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

export type LegalTab = 'impressum' | 'privacy' | 'school_guide' | 'avv';

interface LegalConfigData {
  name: string;
  company?: string | null;
  address: string;
  email: string;
  phone?: string | null;
  representative?: string | null;
  register?: string | null;
  vat_id?: string | null;
  hosting_provider: string;
  hosting_location: string;
  dpo_contact?: string | null;
}

interface LegalModalProps {
  isOpen: boolean;
  initialTab?: LegalTab;
  onClose: () => void;
}

const DEFAULT_LEGAL_CONFIG: LegalConfigData = {
  name: 'Julian Kallidat',
  company: null,
  address: 'Musterstraße 1, 10115 Berlin, Deutschland',
  email: 'kontakt@gradus21.app',
  phone: null,
  representative: null,
  register: null,
  vat_id: null,
  hosting_provider: 'Hetzner Online GmbH (Deutschland)',
  hosting_location: 'Falkenstein / Nürnberg, Deutschland (EU)',
  dpo_contact: null,
};

export const LegalModal: React.FC<LegalModalProps> = ({
  isOpen,
  initialTab = 'impressum',
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);
  const [config, setConfig] = useState<LegalConfigData>(DEFAULT_LEGAL_CONFIG);
  const [copiedAvv, setCopiedAvv] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/legal/info')
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Endpoint not available');
      })
      .then((data: LegalConfigData) => {
        if (data && data.name) {
          setConfig(data);
        }
      })
      .catch(() => {
        // Fallback to defaults
      });
  }, [isOpen]);

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
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
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
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200">
                <p className="font-bold flex items-center gap-1.5 mb-1">
                  <GraduationCap className="w-4 h-4 text-amber-600" />
                  Wichtiger rechtlicher Hinweis für Lehrkräfte in Deutschland
                </p>
                <p>
                  Schüler- und Notendaten unterliegen den <strong>Schulgesetzen und Schuldatenschutzverordnungen der
                  16 Bundesländer</strong> (z. B. VO-DV I/II in NRW, BaySchO/BayEUG in Bayern). Beamte und Angestellte im
                  Schuldienst dürfen dienstliche Daten nicht eigenmächtig auf privaten Cloud-Plattformen verarbeiten.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Drei Schritte für einen rechtssicheren Einsatz an Ihrer Schule
                </h3>
                <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                  <li>
                    <strong>1. Genehmigung der Schulleitung einholen:</strong> Vor der Eingabe von realen Schülerdaten
                    in die synchronisierte Version muss die Schulleitung unter Beteiligung des behördlichen
                    Datenschutzbeauftragten (bDSB) der Schule die Nutzung genehmigen.
                  </li>
                  <li>
                    <strong>2. Auftragsverarbeitungsvertrag (AVV) abschließen:</strong> Die Schule (als
                    „Verantwortlicher“ gem. Art. 4 Nr. 7 DSGVO) schließt mit dem Betreiber von Gradus21 den
                    vorgefertigten AVV gem. Art. 28 DSGVO (siehe Reiter „AVV-Mustervertrag“) ab.
                  </li>
                  <li>
                    <strong>3. Oder: Lokaler Offline-Modus nutzen:</strong> Wenn an Ihrer Schule noch kein AVV vorliegt,
                    können Sie Gradus21 rein lokal ohne Server-Synchronisation nutzen (Notenlisten per Excel importieren
                    und exportieren, ohne Speicherung auf dem Server).
                  </li>
                </ol>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Warum Zero-Knowledge E2EE das ideale Argument für Ihren DSB ist
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Herkömmliche Schulverwaltungssoftware speichert Noten oft in unverschlüsselten Datenbanken beim
                  Anbieter. Gradus21 geht den umgekehrten Weg:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
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
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AVV-MUSTERVERTRAG */}
          {activeTab === 'avv' && (
            <div className="space-y-6 animate-in fade-in duration-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-xs">
                <div>
                  <p className="font-bold text-teal-900 dark:text-teal-200">
                    Vertrag zur Auftragsverarbeitung gem. Art. 28 DSGVO (AVV)
                  </p>
                  <p className="text-teal-800/80 dark:text-teal-300/80">
                    Mustervertrag für Schulen, Schulträger und Lehrerkollegien zur Vorlage beim Datenschutzbeauftragten.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleCopyAvv}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1.5 hover:bg-slate-50 transition shadow-sm"
                  >
                    {copiedAvv ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedAvv ? 'Kopiert!' : 'Kopieren'}</span>
                  </button>
                  <button
                    onClick={handlePrint}
                    className="px-3 py-1.5 rounded-xl bg-teal-600 text-white font-semibold flex items-center gap-1.5 hover:bg-teal-700 transition shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Drucken / PDF</span>
                  </button>
                </div>
              </div>

              {/* Printable Document Box */}
              <div
                id="gradus21-avv-document"
                className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 space-y-4 font-mono leading-relaxed"
              >
                <div className="text-center font-bold text-sm border-b border-slate-200 dark:border-slate-800 pb-3">
                  VEREINBARUNG ZUR AUFTRAGSVERARBEITUNG (AVV)<br />
                  gemäß Art. 28 Datenschutz-Grundverordnung (DSGVO)
                </div>

                <p>
                  <strong>Zwischen:</strong><br />
                  [Name der Schule / Schulträger]<br />
                  [Straße, Hausnummer, PLZ Ort]<br />
                  – nachfolgend <em>„Auftraggeber“</em> oder <em>„Schule“</em> genannt –
                </p>

                <p>
                  <strong>und:</strong><br />
                  {config.company ? `${config.company}, ` : ''}{config.name}<br />
                  {config.address}<br />
                  E-Mail: {config.email}<br />
                  – nachfolgend <em>„Auftragnehmer“</em> oder <em>„Dienstanbieter“</em> genannt –
                </p>

                <p>
                  <strong>§ 1 Gegenstand und Dauer des Auftrags</strong><br />
                  (1) Gegenstand: Bereitstellung der Zero-Knowledge Ende-zu-Ende-verschlüsselten Notenverwaltungs- und
                  Didaktik-Plattform „Gradus21“ (Web-App und API-Synchronisationsserver).<br />
                  (2) Dauer: Der Vertrag wird auf unbestimmte Zeit geschlossen und kann von beiden Parteien jederzeit
                  gekündigt werden.
                </p>

                <p>
                  <strong>§ 2 Art und Zweck der Verarbeitung, Art der Daten</strong><br />
                  (1) Zweck: Sichere Zwischenspeicherung, Synchronisation und Backup von Noten- und Leistungsdaten für
                  den Unterrichtsbetrieb der beauftragenden Lehrkräfte.<br />
                  (2) Art der Daten: Chiffrierte Datensätze (AES-256-GCM Chiffretext) von Schüler:innennamen,
                  Einzelprüfungen, Leistungsnachweisen, Fehlzeiten/Krankheitsvermerken sowie Benutzerkontodaten der
                  Lehrkraft (E-Mail, Passkey-ID, KDF-Salts).<br />
                  (3) Kategorien betroffener Personen: Schülerinnen und Schüler sowie Lehrkräfte der Schule.
                </p>

                <p>
                  <strong>§ 3 Technische und organisatorische Maßnahmen (TOM gem. Art. 32 DSGVO)</strong><br />
                  Der Auftragnehmer sichert folgende Maßnahmen zu:<br />
                  1. <em>Vertraulichkeit / E2EE Envelope Encryption:</em> Alle Schüler- und Notendaten werden vor dem Verlassen
                  des Lehrkraft-Endgeräts clientseitig mit AES-256-GCM verschlüsselt. Der Auftragnehmer hat keinen Zugriff auf
                  den Klartext.<br />
                  2. <em>Server-Standort:</em> Ausschließlich in ISO-27001 zertifizierten Rechenzentren in der Bundesrepublik
                  Deutschland (EU). Kein Transfer an Drittländer.<br />
                  3. <em>Transportverschlüsselung:</em> Ausschließlich TLS 1.3 / HTTPS mit Perfect Forward Secrecy.<br />
                  4. <em>Trennungsgrundsatz:</em> Strikte Mandantentrennung auf Datenbankebene nach Benutzer-ID.
                </p>

                <p>
                  <strong>§ 4 Unterauftragsverhältnisse</strong><br />
                  Als Unterauftragnehmer für Server-Hosting ist die {config.hosting_provider} ({config.hosting_location})
                  eingebunden.
                </p>

                <p>
                  <strong>§ 5 Rechte und Pflichten des Auftraggebers</strong><br />
                  Der Auftraggeber bleibt im Sinne der DSGVO alleiniger Verantwortlicher für die Rechtmäßigkeit der
                  Verarbeitung der Schülerdaten.
                </p>

                <div className="pt-4 flex justify-between border-t border-slate-200 dark:border-slate-800 text-[10px]">
                  <div>
                    Ort, Datum: _______________________<br /><br />
                    Unterschrift Schule (Auftraggeber)
                  </div>
                  <div>
                    Ort, Datum: _______________________<br /><br />
                    Unterschrift {config.name} (Auftragnehmer)
                  </div>
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

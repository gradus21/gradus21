import React, { useEffect, useState } from 'react';
import { apiUrl } from '../../utils/apiConfig';
import {
  Check,
  Eye,
  EyeOff,
  Mail,
  RefreshCw,
  Save,
  Send,
  Server,
  ShieldCheck,
} from 'lucide-react';

interface SmtpConfig {
  host: string;
  port: number;
  security: string; // 'starttls' | 'tls' | 'none'
  username: string;
  password?: string;
  from_email: string;
  from_name: string;
}

interface SmtpConfigTabProps {
  token: string;
}

export const SmtpConfigTab: React.FC<SmtpConfigTabProps> = ({ token }) => {
  const [config, setConfig] = useState<SmtpConfig>({
    host: '',
    port: 587,
    security: 'starttls',
    username: '',
    password: '',
    from_email: 'noreply@schule.de',
    from_name: 'Gradus21 Notenverwaltung',
  });
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [testEmail, setTestEmail] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(apiUrl('/api/admin/smtp'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Status ${res.status} (${res.statusText || 'Fehler'})`);
      }
      const data = await res.json();
      setConfig(data);
    } catch (err: any) {
      setErrorMsg('Fehler beim Laden der SMTP-Konfiguration: ' + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(apiUrl('/api/admin/smtp'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...config,
          password: config.password || '',
        }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Status ${res.status} (${res.statusText || 'Fehler'})`);
      }
      const savedData = await res.json();
      if (savedData && typeof savedData === 'object') {
        setConfig((prev) => ({ ...prev, ...savedData }));
      }
      setSuccessMsg('SMTP-Server-Einstellungen wurden erfolgreich gespeichert.');
    } catch (err: any) {
      setErrorMsg('Speichern fehlgeschlagen: ' + (err.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail.trim()) return;
    setTesting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(apiUrl('/api/admin/smtp/test'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to_email: testEmail.trim() }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Status ${res.status} (${res.statusText || 'Fehler'})`);
      }
      const data = await res.json().catch(() => null);
      const sentTo = data?.sent_to || testEmail;
      setSuccessMsg(`Test-E-Mail wurde erfolgreich an ${sentTo} gesendet!`);
    } catch (err: any) {
      setErrorMsg('Test-E-Mail fehlgeschlagen: ' + (err.message || String(err)));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Server className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <span>E-Mail-Server (SMTP-Konfiguration)</span>
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Konfiguriere den Postausgangsserver für Lehrkräfte-Einladungen, Inaktivitäts-Warnungen und
          Sicherheitsbenachrichtigungen.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 text-xs bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-xl">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-3 text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
          {successMsg}
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-500" />
          <span>Server-Verbindung & Zugangsdaten</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              SMTP-Host:
            </label>
            <input
              type="text"
              required
              placeholder="smtp.schule.de oder mail.kallidat.com"
              value={config.host}
              onChange={(e) => setConfig({ ...config, host: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Port:
            </label>
            <input
              type="number"
              required
              value={config.port}
              onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value, 10) || 587 })}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Verschlüsselung:
            </label>
            <select
              value={config.security}
              onChange={(e) => setConfig({ ...config, security: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
            >
              <option value="starttls">STARTTLS (Port 587, empfohlen)</option>
              <option value="tls">Direct TLS / SSL (Port 465)</option>
              <option value="none">Keine Verschlüsselung (Unverschlüsselt)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Benutzername:
            </label>
            <input
              type="text"
              placeholder="postmaster@schule.de"
              value={config.username}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Passwort:
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••••"
                value={config.password || ''}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                className="w-full pl-3 pr-8 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Absender-E-Mail (From):
            </label>
            <input
              type="email"
              required
              placeholder="noreply@schule.de"
              value={config.from_email}
              onChange={(e) => setConfig({ ...config, from_email: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Absender-Name:
            </label>
            <input
              type="text"
              required
              placeholder="Gradus21 Notenverwaltung"
              value={config.from_name}
              onChange={(e) => setConfig({ ...config, from_name: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>SMTP-Einstellungen speichern</span>
          </button>
        </div>
      </form>

      {/* Test Mail Section */}
      <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
          <Mail className="w-4 h-4 text-emerald-500" />
          <span>Verbindung testen</span>
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Sende eine Test-E-Mail über den konfigurierten SMTP-Server, um Port, TLS-Zertifikat und Zugangsdaten sofort zu verifizieren.
        </p>

        <form onSubmit={handleSendTestMail} className="flex flex-col sm:flex-row gap-2 max-w-md">
          <input
            type="email"
            required
            placeholder="deine-email@schule.de"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl"
          />
          <button
            type="submit"
            disabled={testing || !config.host}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50 whitespace-nowrap shadow-sm"
          >
            {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>Testmail senden</span>
          </button>
        </form>
      </div>
    </div>
  );
};

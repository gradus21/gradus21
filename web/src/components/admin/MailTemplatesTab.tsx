import React, { useEffect, useState } from 'react';
import {
  Check,
  Eye,
  FileText,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
} from 'lucide-react';

interface MailTemplate {
  id: string;
  name: string;
  subject: string;
  body_text: string;
  variables: string[];
}

interface MailTemplatesTabProps {
  token: string;
}

export const MailTemplatesTab: React.FC<MailTemplatesTabProps> = ({ token }) => {
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>('user_invite');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/mail-templates', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setTemplates(data);
    } catch (err: any) {
      setErrorMsg('Fehler beim Laden der Vorlagen: ' + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [token]);

  const currentTpl = templates.find((t) => t.id === selectedId) || templates[0];

  const handleUpdateCurrent = (field: 'subject' | 'body_text', val: string) => {
    if (!currentTpl) return;
    setTemplates((prev) =>
      prev.map((t) => (t.id === currentTpl.id ? { ...t, [field]: val } : t))
    );
  };

  const handleInsertVariable = (varName: string) => {
    if (!currentTpl) return;
    const placeholder = `{{${varName}}}`;
    handleUpdateCurrent('body_text', currentTpl.body_text + ' ' + placeholder);
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/mail-templates', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(templates),
      });
      if (!res.ok) throw new Error(await res.text());
      setSuccessMsg('Alle E-Mail-Vorlagen wurden erfolgreich gespeichert.');
    } catch (err: any) {
      setErrorMsg('Speichern fehlgeschlagen: ' + (err.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  // Mock preview rendering
  const renderPreviewText = (text: string) => {
    return text
      .replace(/{{user_email}}/g, 'anna.lehrerin@schule.de')
      .replace(/{{invite_url}}/g, `${window.location.origin}/#invite=g21_inv_demo12345`)
      .replace(/{{school_name}}/g, 'Gradus21 Campus')
      .replace(/{{days_inactive}}/g, '180')
      .replace(/{{deletion_date}}/g, '15.11.2026');
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>E-Mail-Vorlagen & Benachrichtigungen</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Passe die Betreffzeilen und Inhalte automatisierter System-E-Mails an. Verwende Variablen zur dynamischen Personalisierung.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          <span>Vorlagen speichern</span>
        </button>
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

      {/* Template Selector Pills */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs overflow-x-auto">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => setSelectedId(tpl.id)}
            className={`px-3 py-1.5 rounded-lg font-semibold transition whitespace-nowrap ${
              selectedId === tpl.id
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {tpl.name}
          </button>
        ))}
      </div>

      {/* Editor & Preview Split */}
      {currentTpl ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Editor Column */}
          <div className="space-y-4 p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" />
              <span>Vorlage bearbeiten: {currentTpl.name}</span>
            </h4>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Betreffzeile (Subject):
              </label>
              <input
                type="text"
                value={currentTpl.subject}
                onChange={(e) => handleUpdateCurrent('subject', e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Variable Pills */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
                Verfügbare Variablen (Klicken zum Einfügen):
              </label>
              <div className="flex flex-wrap gap-1.5">
                {currentTpl.variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleInsertVariable(v)}
                    className="px-2 py-1 rounded-md text-[11px] font-mono bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                E-Mail-Inhalt (Textkörper):
              </label>
              <textarea
                rows={12}
                value={currentTpl.body_text}
                onChange={(e) => handleUpdateCurrent('body_text', e.target.value)}
                className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Live Preview Column */}
          <div className="space-y-4 p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 shadow-sm">
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-500" />
              <span>Live-Vorschau für den Empfänger</span>
            </h4>

            <div className="p-4 border border-slate-200 dark:border-slate-700/80 rounded-xl bg-white dark:bg-slate-950 shadow-inner space-y-3">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-2 text-xs space-y-1">
                <div>
                  <span className="font-semibold text-slate-500">Von:</span>{' '}
                  <span className="text-slate-800 dark:text-slate-200">
                    Gradus21 Notenverwaltung &lt;noreply@schule.de&gt;
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">An:</span>{' '}
                  <span className="text-slate-800 dark:text-slate-200">anna.lehrerin@schule.de</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Betreff:</span>{' '}
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {renderPreviewText(currentTpl.subject)}
                  </span>
                </div>
              </div>

              <div className="whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300 font-sans leading-relaxed">
                {renderPreviewText(currentTpl.body_text)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-12 text-center text-slate-400 text-xs">
          Vorlagen werden geladen...
        </div>
      )}
    </div>
  );
};

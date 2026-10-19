import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Clock,
  Download,
  HardDrive,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Upload,
} from 'lucide-react';

interface BackupEntry {
  filename: string;
  size_bytes: number;
  created_at: string;
}

interface BackupScheduleConfig {
  auto_backup_enabled: boolean;
  enabled?: boolean;
  interval_hours: number;
  retention_days: number;
  last_run?: string | null;
}

interface BackupConfigTabProps {
  token: string;
  onRestoreSuccess?: () => Promise<void> | void;
}

export const BackupConfigTab: React.FC<BackupConfigTabProps> = ({ token, onRestoreSuccess }) => {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [schedule, setSchedule] = useState<BackupScheduleConfig>({
    auto_backup_enabled: true,
    interval_hours: 24,
    retention_days: 30,
    last_run: null,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [creatingSnapshot, setCreatingSnapshot] = useState<boolean>(false);
  const [savingSchedule, setSavingSchedule] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [listRes, schedRes] = await Promise.all([
        fetch('/api/admin/backups', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/backups/schedule', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!listRes.ok) throw new Error(await listRes.text());
      const listData = await listRes.json();
      setBackups(listData);

      if (schedRes.ok) {
        const schedData = await schedRes.json();
        setSchedule({
          auto_backup_enabled: schedData.auto_backup_enabled ?? schedData.enabled ?? true,
          interval_hours: schedData.interval_hours ?? 24,
          retention_days: schedData.retention_days ?? 30,
          last_run: schedData.last_run ?? null,
        });
      }
    } catch (err: any) {
      setErrorMsg('Fehler beim Laden der Backups: ' + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleCreateSnapshot = async () => {
    setCreatingSnapshot(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/backups/snapshot', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSuccessMsg(`Snapshot ${data.filename} wurde erfolgreich erstellt!`);
      fetchData();
    } catch (err: any) {
      setErrorMsg('Erstellung des Snapshots fehlgeschlagen: ' + (err.message || String(err)));
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSchedule(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/backups/schedule', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auto_backup_enabled: schedule.auto_backup_enabled,
          enabled: schedule.auto_backup_enabled,
          interval_hours: schedule.interval_hours,
          retention_days: schedule.retention_days,
          last_run: schedule.last_run,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const saved = await res.json();
      setSchedule((prev) => ({
        ...prev,
        auto_backup_enabled: saved.auto_backup_enabled ?? saved.enabled ?? prev.auto_backup_enabled,
        interval_hours: saved.interval_hours ?? prev.interval_hours,
        retention_days: saved.retention_days ?? prev.retention_days,
        last_run: saved.last_run ?? prev.last_run,
      }));
      setSuccessMsg('Automatischer Backup-Zeitplan gespeichert.');
    } catch (err: any) {
      setErrorMsg('Speichern des Zeitplans fehlgeschlagen: ' + (err.message || String(err)));
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleDownload = async (filename: string) => {
    try {
      const res = await fetch(`/api/admin/backups/download/${encodeURIComponent(filename)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download fehlgeschlagen');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setErrorMsg('Download fehlgeschlagen: ' + String(err));
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (
      !window.confirm(
        `ACHTUNG: Möchtest du den Server-Snapshot "${file.name}" wirklich einspielen?\n` +
          `Alle aktuellen Datenbankinhalte und verschlüsselten Tresore werden mit dem Snapshot überschrieben!`
      )
    ) {
      e.target.value = '';
      return;
    }

    setRestoring(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch('/api/admin/backups/restore', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(json),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSuccessMsg(
        `Wiederherstellung erfolgreich abgeschlossen (${data.restored_users_count} Benutzer:innen, ${data.restored_envelopes_count} Umschläge). Daten werden aktualisiert...`
      );
      await fetchData();
      if (onRestoreSuccess) {
        await onRestoreSuccess();
      }
    } catch (err: any) {
      setErrorMsg('Wiederherstellung fehlgeschlagen: ' + (err.message || String(err)));
    } finally {
      setRestoring(false);
      e.target.value = '';
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Datensicherung & Server-Snapshots</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Erstelle konsistente Voll-Snapshots der verschlüsselten Tresore und verwalte automatische Backup-Intervalle.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition">
            <Upload className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            <span>{restoring ? 'Wiederherstellen...' : 'Snapshot einspielen'}</span>
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreFile}
              disabled={restoring}
              className="hidden"
            />
          </label>

          <button
            onClick={handleCreateSnapshot}
            disabled={creatingSnapshot}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
          >
            {creatingSnapshot ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Archive className="w-4 h-4" />
            )}
            <span>Sofort-Snapshot erstellen</span>
          </button>
        </div>
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

      {/* Backup Schedule Configuration */}
      <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-500" />
            <span>Automatischer Backup-Zeitplan</span>
          </h4>
          {schedule.last_run && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Letzter automatischer Snapshot: {new Date(schedule.last_run).toLocaleString('de-DE')}
            </span>
          )}
        </div>

        <form onSubmit={handleSaveSchedule} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
              Automatisierung:
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
              <input
                type="checkbox"
                checked={schedule.auto_backup_enabled}
                onChange={(e) => setSchedule({ ...schedule, auto_backup_enabled: e.target.checked })}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Regelmäßige Snapshots aktiv</span>
            </label>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
              Intervall (Stunden):
            </label>
            <select
              value={schedule.interval_hours}
              onChange={(e) =>
                setSchedule({ ...schedule, interval_hours: parseInt(e.target.value, 10) })
              }
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            >
              <option value={6}>Alle 6 Stunden</option>
              <option value={12}>Alle 12 Stunden</option>
              <option value={24}>Alle 24 Stunden (1x täglich)</option>
              <option value={48}>Alle 48 Stunden</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
              Vorhaltezeit (Tage):
            </label>
            <div className="flex items-center gap-2">
              <select
                value={schedule.retention_days}
                onChange={(e) =>
                  setSchedule({ ...schedule, retention_days: parseInt(e.target.value, 10) })
                }
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                <option value={7}>7 Tage</option>
                <option value={14}>14 Tage</option>
                <option value={30}>30 Tage (1 Monat)</option>
                <option value={90}>90 Tage (3 Monate)</option>
              </select>

              <button
                type="submit"
                disabled={savingSchedule}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 whitespace-nowrap"
              >
                {savingSchedule ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Speichern</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Snapshots Table */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-semibold">Dateiname</th>
                <th className="py-3 px-4 font-semibold">Dateigröße</th>
                <th className="py-3 px-4 font-semibold">Erstellt am</th>
                <th className="py-3 px-4 font-semibold text-right">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading && backups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">
                    Snapshots werden geladen...
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">
                    Noch keine Snapshots vorhanden. Klicke auf "Sofort-Snapshot erstellen".
                  </td>
                </tr>
              ) : (
                backups.map((b) => (
                  <tr
                    key={b.filename}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-slate-900 dark:text-slate-100">
                      {b.filename}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                      {formatBytes(b.size_bytes)}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                      {new Date(b.created_at).toLocaleString('de-DE')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDownload(b.filename)}
                        className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Herunterladen</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

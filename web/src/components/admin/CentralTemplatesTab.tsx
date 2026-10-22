import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Check,
  Code,
  Edit2,
  FileSpreadsheet,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Sliders,
  Trash2,
} from 'lucide-react';

import type { GlobalTemplateRecord } from '../../types/templates';
export type { GlobalTemplateRecord };

interface CentralTemplatesTabProps {
  token: string;
}

export const CentralTemplatesTab: React.FC<CentralTemplatesTabProps> = ({ token }) => {
  const [templates, setTemplates] = useState<GlobalTemplateRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Editor Modal State
  const [showEditor, setShowEditor] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tplType, setTplType] = useState<string>('curve');
  const [tplTitle, setTplTitle] = useState<string>('');
  const [tplDesc, setTplDesc] = useState<string>('');
  const [tplPayloadJson, setTplPayloadJson] = useState<string>('{}');
  const [saving, setSaving] = useState<boolean>(false);

  const fetchTemplates = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/templates', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Status ${res.status} (${res.statusText || 'Fehler'})`);
      }
      const data = await res.json();
      setTemplates(data);
    } catch (err: any) {
      setErrorMsg('Fehler beim Laden der globalen Vorlagen: ' + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [token]);

  const openCreateModal = (type: string = 'curve') => {
    setEditingId(null);
    setTplType(type);
    setTplTitle('');
    setTplDesc('');

    if (type === 'curve') {
      setTplPayloadJson(
        JSON.stringify(
          {
            name: 'IHK Standard (50% Bestehensgrenze)',
            cutoffs: { '1': 92, '2': 81, '3': 67, '4': 50, '5': 30, '6': 0 },
            linear: true,
          },
          null,
          2
        )
      );
    } else if (type === 'weighting') {
      setTplPayloadJson(
        JSON.stringify(
          {
            name: 'Gymnasiale Oberstufe (Klausur 50% / Mündlich 50%)',
            categories: [
              { name: 'Klausuren / Klassenarbeiten', weight: 50 },
              { name: 'Mündliche Mitarbeit & Tests', weight: 50 },
            ],
          },
          null,
          2
        )
      );
    } else {
      setTplPayloadJson(
        JSON.stringify(
          {
            name: 'G/M/E-Differenzierung Standard',
            levels: [
              { id: 'E', label: 'E-Niveau (Erweitert)', offset: 0 },
              { id: 'M', label: 'M-Niveau (Mittlerer Schulabschluss)', offset: -1 },
              { id: 'G', label: 'G-Niveau (Grundlegend)', offset: -2 },
            ],
          },
          null,
          2
        )
      );
    }
    setShowEditor(true);
  };

  const openEditModal = (tpl: GlobalTemplateRecord) => {
    setEditingId(tpl.id);
    setTplType(tpl.template_type);
    setTplTitle(tpl.title);
    setTplDesc(tpl.description);
    setTplPayloadJson(JSON.stringify(tpl.payload, null, 2));
    setShowEditor(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplTitle.trim()) return;

    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(tplPayloadJson);
    } catch (err: any) {
      setErrorMsg('Ungültiges JSON-Format im Konfigurations-Feld: ' + err.message);
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const url = editingId ? `/api/admin/templates/${editingId}` : '/api/admin/templates';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template_type: tplType,
          title: tplTitle.trim(),
          description: tplDesc.trim(),
          payload: parsedPayload,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Status ${res.status} (${res.statusText || 'Fehler'})`);
      }
      setSuccessMsg(`Globale Vorlage "${tplTitle}" erfolgreich gespeichert!`);
      setShowEditor(false);
      fetchTemplates();
    } catch (err: any) {
      setErrorMsg('Fehler beim Speichern der Vorlage: ' + (err.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tpl: GlobalTemplateRecord) => {
    if (!window.confirm(`Möchtest du die globale Vorlage "${tpl.title}" wirklich löschen?`)) {
      return;
    }
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/templates/${tpl.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Status ${res.status} (${res.statusText || 'Fehler'})`);
      }
      setSuccessMsg(`Globale Vorlage "${tpl.title}" gelöscht.`);
      fetchTemplates();
    } catch (err: any) {
      setErrorMsg('Löschen fehlgeschlagen: ' + (err.message || String(err)));
    }
  };

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showRawJsonMap, setShowRawJsonMap] = useState<Record<string, boolean>>({});

  const toggleRawJson = (id: string) => {
    setShowRawJsonMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredTemplates = templates.filter((t) => {
    const matchesType = filterType === 'all' ? true : t.template_type === filterType;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      t.title.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q));
    return matchesType && matchesSearch;
  });

  const curveCount = templates.filter((t) => t.template_type === 'curve').length;
  const weightingCount = templates.filter((t) => t.template_type === 'weighting').length;
  const levelsCount = templates.filter((t) => t.template_type === 'levels').length;

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'curve':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1">
            <Sliders className="w-3 h-3" />
            <span>Notenschlüssel</span>
          </span>
        );
      case 'weighting':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
            <FileSpreadsheet className="w-3 h-3" />
            <span>Gewichtung</span>
          </span>
        );
      case 'levels':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1">
            <Layers className="w-3 h-3" />
            <span>Binnendifferenzierung</span>
          </span>
        );
      default:
        return null;
    }
  };

  const renderPayloadPreview = (tpl: GlobalTemplateRecord) => {
    if (tpl.template_type === 'curve' && tpl.payload?.cutoffs) {
      const c = tpl.payload.cutoffs;
      if (c.n1 !== undefined) {
        return (
          <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
            <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold">1: ≥{c.n1}%</span>
            <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold">2: ≥{c.n2}%</span>
            <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-semibold">3: ≥{c.n3}%</span>
            <span className="px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 font-semibold">4: ≥{c.n4}%</span>
            <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-semibold">5: ≥{c.n5}%</span>
          </div>
        );
      }
      if (c['15'] !== undefined) {
        return (
          <div className="flex flex-wrap gap-1 text-[10px] font-mono">
            <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold">15P: ≥{c['15']}%</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold">10P: ≥{c['10']}%</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold">5P: ≥{c['5']}%</span>
            <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-semibold">1P: ≥{c['1']}%</span>
          </div>
        );
      }
    }

    if (tpl.template_type === 'weighting') {
      if (tpl.payload?.categories && Array.isArray(tpl.payload.categories)) {
        return (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {tpl.payload.categories.map((cat: any, i: number) => {
              const pct = typeof cat.weight === 'number' ? Math.round((cat.weight > 1 ? cat.weight / 100 : cat.weight) * 100) : '?';
              return (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-medium"
                >
                  <strong className="font-bold">{cat.short_code || cat.name}:</strong> {pct}%
                </span>
              );
            })}
          </div>
        );
      }
      if (tpl.payload?.weights && Array.isArray(tpl.payload.weights)) {
        return (
          <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
            Gewichte: {tpl.payload.weights.join(' : ')}
          </div>
        );
      }
    }

    if (tpl.template_type === 'levels') {
      const offsets = tpl.payload?.offsets;
      if (offsets) {
        return (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold">
              G: {offsets.G > 0 ? `+${offsets.G}` : offsets.G}%
            </span>
            <span className="px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-semibold">
              M: {offsets.M > 0 ? `+${offsets.M}` : offsets.M}%
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold">
              E: {offsets.E > 0 ? `+${offsets.E}` : offsets.E}%
            </span>
            {tpl.payload.enable === false && (
              <span className="px-1.5 py-0.5 text-[10px] text-slate-400 italic">
                (Nur optisches Badge)
              </span>
            )}
          </div>
        );
      }
    }

    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Globale Vorlagen (Zentral)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Zentral vorgegebene Notenschlüssel, Gewichtungsvorgaben und Differenzierungsstufen, die allen Lehrkräften
            als "Globale Vorlage" zur Verfügung stehen.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTemplates}
            className="p-2 border rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
            title="Aktualisieren"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => openCreateModal('curve')}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Globale Vorlage anlegen</span>
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

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              filterType === 'all'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Alle ({templates.length})
          </button>
          <button
            onClick={() => setFilterType('curve')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              filterType === 'curve'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Notenschlüssel ({curveCount})
          </button>
          <button
            onClick={() => setFilterType('weighting')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              filterType === 'weighting'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Gewichtungen ({weightingCount})
          </button>
          <button
            onClick={() => setFilterType('levels')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              filterType === 'levels'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Binnendifferenzierung ({levelsCount})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Vorlage suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
          />
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading && templates.length === 0 ? (
          <div className="col-span-2 py-12 text-center text-slate-400 text-xs">
            Vorlagen werden geladen...
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="col-span-2 py-12 text-center text-slate-400 text-xs border border-dashed rounded-2xl">
            Keine globalen Vorlagen gefunden.
          </div>
        ) : (
          filteredTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className="p-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-sm space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {getTypeBadge(tpl.template_type)}
                    <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full">
                      Globale Vorlage
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleRawJson(tpl.id)}
                      className={`p-1 rounded-lg border text-xs ${
                        showRawJsonMap[tpl.id]
                          ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500'
                      }`}
                      title="JSON anzeigen/ausblenden"
                    >
                      <Code className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openEditModal(tpl)}
                      className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                      title="Bearbeiten"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(tpl)}
                      className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500"
                      title="Löschen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tpl.title}
                  </h4>
                  {tpl.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                      {tpl.description}
                    </p>
                  )}
                </div>

                {/* Readable Visual Summary */}
                <div className="pt-1">
                  {renderPayloadPreview(tpl)}
                </div>
              </div>

              {/* Collapsible JSON Payload */}
              {showRawJsonMap[tpl.id] && (
                <div className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800 font-mono text-[10px] text-slate-600 dark:text-slate-400 max-h-36 overflow-y-auto mt-2">
                  <pre>{JSON.stringify(tpl.payload, null, 2)}</pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Edit/Create Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>{editingId ? 'Globale Vorlage bearbeiten' : 'Neue Globale Vorlage erstellen'}</span>
            </h4>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Typ der Vorlage:
                  </label>
                  <select
                    disabled={!!editingId}
                    value={tplType}
                    onChange={(e) => {
                      setTplType(e.target.value);
                      openCreateModal(e.target.value);
                    }}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                  >
                    <option value="curve">Notenschlüssel</option>
                    <option value="weighting">Gewichtung</option>
                    <option value="levels">Binnendifferenzierung</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Titel der Vorlage:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="z.B. IHK Standard 50%"
                    value={tplTitle}
                    onChange={(e) => setTplTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Beschreibung (für Lehrkräfte):
                </label>
                <input
                  type="text"
                  placeholder="Kurze Erklärung zur Anwendung dieser Vorlage..."
                  value={tplDesc}
                  onChange={(e) => setTplDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Konfiguration (JSON Payload):</span>
                  <span className="text-[10px] text-slate-400">Gültiges JSON</span>
                </label>
                <textarea
                  rows={8}
                  value={tplPayloadJson}
                  onChange={(e) => setTplPayloadJson(e.target.value)}
                  className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditor(false)}
                  className="px-3.5 py-2 border rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Globale Vorlage speichern</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

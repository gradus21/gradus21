import React, { useState, useMemo } from 'react';
import {
  X,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Sliders,
  Info,
  Calendar,
  Layers,
  FileText,
  Eye,
} from 'lucide-react';
import {
  ClassroomSubjectDataset,
  TermFilterId,
} from '../data/demoClasses';
import {
  AVAILABLE_EXPORT_COLUMNS,
  ClassReportForExport,
  ConfigurableExportOptions,
  DEFAULT_EXPORT_OPTIONS,
  ExportDelimiter,
  ExportFormat,
  ExportPresetId,
  buildExportTableData,
  exportClassToCsv,
  exportConfigurableClassToXlsx,
} from './ExportAndPrintHelpers';

interface ExportConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: ClassroomSubjectDataset;
  report: ClassReportForExport | null;
  activeTerm: TermFilterId;
  onUpdateDatasetMeta?: (patch: { subjectCode?: string; courseType?: string }) => void;
}

export const ExportConfigModal: React.FC<ExportConfigModalProps> = ({
  isOpen,
  onClose,
  dataset,
  report,
  activeTerm,
  onUpdateDatasetMeta,
}) => {
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [presetId, setPresetId] = useState<ExportPresetId>('standard');
  const [delimiter, setDelimiter] = useState<ExportDelimiter>(';');
  const [decimalSeparator, setDecimalSeparator] = useState<',' | '.'>(',');
  const [includeBom, setIncludeBom] = useState<boolean>(true);
  const [term, setTerm] = useState<TermFilterId>(activeTerm);
  const [subjectCode, setSubjectCode] = useState<string>(
    dataset.subjectCode || dataset.shortName || dataset.subjectName.slice(0, 3).toUpperCase()
  );
  const [courseType, setCourseType] = useState<string>(
    dataset.courseType || (dataset.config.scale_id === 'de_oberstufe_0_to_15' ? 'GKM' : '')
  );
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'nr',
    'lastName',
    'firstName',
    'className',
    'subject',
    'finalGrade',
    'calculatedGrade',
    'overallPercent',
    'remarks',
  ]);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Missing birthdate check for SchILD
  const studentsWithoutBirthdate = useMemo(() => {
    return dataset.students.filter((s) => !s.birthDate || !s.birthDate.trim());
  }, [dataset.students]);

  // Current export options object
  const currentOptions: ConfigurableExportOptions = useMemo(
    () => ({
      format,
      delimiter,
      decimalSeparator,
      includeBom,
      presetId,
      selectedColumns,
      term,
      subjectCode,
      courseType,
    }),
    [format, delimiter, decimalSeparator, includeBom, presetId, selectedColumns, term, subjectCode, courseType]
  );

  // Live preview table data (up to 3 rows)
  const previewData = useMemo(() => {
    try {
      const { headers, rows } = buildExportTableData(dataset, report, currentOptions);
      return {
        headers,
        rows: rows.slice(0, 3),
        totalRows: rows.length,
      };
    } catch {
      return { headers: [], rows: [], totalRows: 0 };
    }
  }, [dataset, report, currentOptions]);

  if (!isOpen) return null;

  const handleSelectPreset = (id: ExportPresetId) => {
    setPresetId(id);
    if (id === 'schild_nrw') {
      setDelimiter(';');
      setDecimalSeparator(',');
      setIncludeBom(true);
      setShowAdvanced(true);
    } else if (id === 'standard') {
      setDelimiter(';');
      setDecimalSeparator(',');
      setSelectedColumns([
        'nr',
        'lastName',
        'firstName',
        'className',
        'subject',
        'finalGrade',
        'calculatedGrade',
        'overallPercent',
        'remarks',
      ]);
    } else if (id === 'matrix_full') {
      setDelimiter(';');
      setDecimalSeparator(',');
    }
  };

  const toggleColumn = (colId: string) => {
    setPresetId('custom');
    setSelectedColumns((prev) =>
      prev.includes(colId) ? prev.filter((id) => id !== colId) : [...prev, colId]
    );
  };

  const handleExecuteExport = async () => {
    setIsExporting(true);
    try {
      // Save metadata to dataset if changed
      if (onUpdateDatasetMeta && (subjectCode !== dataset.subjectCode || courseType !== dataset.courseType)) {
        onUpdateDatasetMeta({ subjectCode, courseType });
      }

      if (format === 'xlsx') {
        await exportConfigurableClassToXlsx(dataset, report, currentOptions);
      } else {
        exportClassToCsv(dataset, report, currentOptions);
      }
      onClose();
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-3xl h-full sm:h-auto max-h-[100dvh] sm:max-h-[92vh] rounded-none sm:rounded-2xl border-0 sm:border shadow-2xl flex flex-col overflow-hidden relative"
        style={{
          backgroundColor: 'var(--bg-surface, #1e293b)',
          borderColor: 'var(--border-subtle, #334155)',
          color: 'var(--text-primary, #f8fafc)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 sm:p-5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-600 dark:text-teal-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">
                Noten- & Zeugnisexport (Excel & CSV)
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {dataset.subjectName} · {dataset.className} ({term === 'hj1' ? '1. Halbjahr' : term === 'hj2' ? '2. Halbjahr' : 'Gesamtjahr'})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl hover:bg-neutral-500/10 transition inline-flex items-center justify-center shrink-0"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body content with scroll */}
        <div className="p-5 overflow-y-auto space-y-5 text-sm">
          {/* Preset Selection Cards */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
              1. Vorlage / Zielsystem wählen
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* SchILD-NRW */}
              <button
                type="button"
                onClick={() => handleSelectPreset('schild_nrw')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between relative ${
                  presetId === 'schild_nrw'
                    ? 'border-teal-500 bg-teal-500/10 ring-2 ring-teal-500/30'
                    : 'hover:border-neutral-400 border-neutral-700/50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">SchILD-NRW</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-teal-500/20 text-teal-600 dark:text-teal-300">
                      Offiziell
                    </span>
                  </div>
                  <p className="text-[11px] mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                    Exakte 9 Spalten für den Notendatei-Import in SchILD
                  </p>
                </div>
                {presetId === 'schild_nrw' && (
                  <CheckCircle2 className="w-4 h-4 text-teal-500 absolute top-2 right-2" />
                )}
              </button>

              {/* Standard Notenliste */}
              <button
                type="button"
                onClick={() => handleSelectPreset('standard')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between relative ${
                  presetId === 'standard'
                    ? 'border-teal-500 bg-teal-500/10 ring-2 ring-teal-500/30'
                    : 'hover:border-neutral-400 border-neutral-700/50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">Standard-Notenliste</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-sky-500/20 text-sky-600 dark:text-sky-300">
                      Empfohlen
                    </span>
                  </div>
                  <p className="text-[11px] mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                    Kompakte Liste für Zeugniskonferenz & Klassenleitung
                  </p>
                </div>
                {presetId === 'standard' && (
                  <CheckCircle2 className="w-4 h-4 text-teal-500 absolute top-2 right-2" />
                )}
              </button>

              {/* Vollständige Matrix */}
              <button
                type="button"
                onClick={() => handleSelectPreset('matrix_full')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between relative ${
                  presetId === 'matrix_full'
                    ? 'border-teal-500 bg-teal-500/10 ring-2 ring-teal-500/30'
                    : 'hover:border-neutral-400 border-neutral-700/50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">Vollständige Matrix</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-neutral-500/20" style={{ color: 'var(--text-secondary)' }}>
                      Alle Details
                    </span>
                  </div>
                  <p className="text-[11px] mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                    Inkl. aller Einzelleistungen, Tests und Kategorien
                  </p>
                </div>
                {presetId === 'matrix_full' && (
                  <CheckCircle2 className="w-4 h-4 text-teal-500 absolute top-2 right-2" />
                )}
              </button>
            </div>
          </div>

          {/* SchILD Specific Info Callout */}
          {presetId === 'schild_nrw' && (
            <div className="p-3.5 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">SchILD-NRW Format-Vorgaben:</div>
                <div className="mt-0.5 opacity-90 leading-relaxed">
                  SchILD erfordert exakt 9 Spalten: <code className="font-mono bg-black/10 dark:bg-black/30 px-1 py-0.5 rounded">Name | Vorname | Geburtsdatum | Klasse | Fach-Kürzel | Kursart | Note | Punkte | Zeugnisbemerkung</code>.
                </div>
                {studentsWithoutBirthdate.length > 0 ? (
                  <div className="mt-1.5 font-medium text-amber-600 dark:text-amber-400">
                    ℹ️ Bei {studentsWithoutBirthdate.length} von {dataset.students.length} Schüler:innen ist kein Geburtsdatum hinterlegt. Die Datei wird trotzdem exportiert (SchILD matcht alternativ nach Name + Klasse).
                  </div>
                ) : (
                  <div className="mt-1.5 font-medium text-teal-600 dark:text-teal-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Alle {dataset.students.length} Schüler:innen besitzen ein Geburtsdatum.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* File Format & Base Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                Dateiformat:
              </label>
              <div className="flex rounded-xl border p-1" style={{ borderColor: 'var(--border-subtle)' }}>
                <button
                  type="button"
                  onClick={() => setFormat('xlsx')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                    format === 'xlsx' ? 'bg-teal-500 text-white shadow-sm' : 'hover:bg-neutral-500/10'
                  }`}
                >
                  Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('csv')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                    format === 'csv' ? 'bg-teal-500 text-white shadow-sm' : 'hover:bg-neutral-500/10'
                  }`}
                >
                  CSV (.csv)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                Halbjahr:
              </label>
              <select
                value={term}
                onChange={(e) => setTerm(e.target.value as TermFilterId)}
                className="w-full px-3 py-2 rounded-xl border text-xs font-medium bg-transparent"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              >
                <option value="hj1">1. Halbjahr (HJ1)</option>
                <option value="hj2">2. Halbjahr (HJ2)</option>
                <option value="all">Gesamtes Schuljahr</option>
              </select>
            </div>

            {format === 'csv' && (
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  CSV-Trennzeichen:
                </label>
                <select
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value as ExportDelimiter)}
                  className="w-full px-3 py-2 rounded-xl border text-xs font-medium bg-transparent"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                >
                  <option value=";">Semikolon ( ; ) – Standard Deutsch</option>
                  <option value=",">Komma ( , ) – Standard International</option>
                  <option value={"\t"}>Tabstopp ( \t )</option>
                </select>
              </div>
            )}
          </div>

          {/* Preset specific metadata (Fachkürzel & Kursart for SchILD / ASV) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl border" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-subtle, rgba(0,0,0,0.02))' }}>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                Amtliches Fach-Kürzel:
              </label>
              <input
                type="text"
                value={subjectCode}
                onChange={(e) => setSubjectCode(e.target.value)}
                placeholder="z.B. E, M, D, GE"
                className="w-full px-3 py-1.5 rounded-lg border text-xs font-mono font-bold bg-transparent"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              />
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                z. B. für SchILD-NRW Spalte „Fach-Kürzel“
              </span>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                Kursart (Sek I / Oberstufe):
              </label>
              <input
                type="text"
                value={courseType}
                onChange={(e) => setCourseType(e.target.value)}
                placeholder="z.B. GKM, GK, LK, AB3"
                className="w-full px-3 py-1.5 rounded-lg border text-xs font-mono font-bold bg-transparent"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              />
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                z. B. Grundkurs mündlich (GKM) oder leer
              </span>
            </div>
          </div>

          {/* Advanced Column Customizer Accordion */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs font-bold flex items-center gap-1.5 text-teal-600 dark:text-teal-400 hover:underline"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{showAdvanced ? 'Detaillierte Spaltenauswahl ausblenden' : 'Spalten & Format-Optionen anpassen...'}</span>
            </button>

            {showAdvanced && presetId !== 'schild_nrw' && presetId !== 'matrix_full' && (
              <div className="mt-3 p-4 rounded-xl border space-y-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                  Zu exportierende Spalten:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AVAILABLE_EXPORT_COLUMNS.map((col) => {
                    const isChecked = selectedColumns.includes(col.id);
                    return (
                      <label
                        key={col.id}
                        className="flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded-lg hover:bg-neutral-500/10 transition"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleColumn(col.id)}
                          className="rounded text-teal-600 focus:ring-teal-500"
                        />
                        <span className={isChecked ? 'font-medium' : 'opacity-60'}>
                          {col.label}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="pt-2 border-t flex flex-wrap items-center gap-4 text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeBom}
                      onChange={(e) => setIncludeBom(e.target.checked)}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>UTF-8 BOM einschließen (verhindert Umlaut-Fehler in Windows Excel)</span>
                  </label>

                  <label className="flex items-center gap-1.5">
                    <span>Dezimaltrennzeichen:</span>
                    <select
                      value={decimalSeparator}
                      onChange={(e) => setDecimalSeparator(e.target.value as ',' | '.')}
                      className="px-2 py-0.5 rounded border text-xs bg-transparent"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <option value=",">Komma ( , )</option>
                      <option value=".">Punkt ( . )</option>
                    </select>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Live Preview of first 3 rows */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <Eye className="w-3.5 h-3.5" />
                <span>Live-Vorschau (Erste 3 Zeilen der Datei):</span>
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {previewData.totalRows} Zeilen insgesamt
              </span>
            </div>
            <div className="rounded-xl border overflow-x-auto max-h-36" style={{ borderColor: 'var(--border-subtle)' }}>
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-neutral-500/10 border-b font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
                  <tr>
                    {previewData.headers.map((h, i) => (
                      <th key={i} className="px-3 py-1.5 font-bold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {previewData.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-neutral-500/5">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3 py-1.5 font-mono text-[11px]">
                          {String(cell || '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer with Actions */}
        <div className="flex items-center justify-between p-4 border-t pb-safe sm:pb-4" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold hover:bg-neutral-500/10 transition"
            style={{ color: 'var(--text-secondary)' }}
          >
            Abbrechen
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isExporting}
              onClick={handleExecuteExport}
              className="px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs font-bold text-white shadow-sm flex items-center gap-2 transition disabled:opacity-50"
              style={{ backgroundColor: 'var(--primary-500, #0d9488)' }}
            >
              <Download className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">
                {format === 'xlsx'
                  ? 'Excel-Tabelle (.xlsx) herunterladen'
                  : 'CSV-Tabelle (.csv) herunterladen'}
              </span>
              <span className="sm:hidden">
                {format === 'xlsx' ? 'Excel herunterladen' : 'CSV herunterladen'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

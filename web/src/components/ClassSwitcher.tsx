import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Edit3, FolderPlus, Search } from 'lucide-react';
import { ClassroomSubjectDataset } from '../data/demoClasses';

interface ClassSwitcherProps {
  datasets: ClassroomSubjectDataset[];
  activeDataset: ClassroomSubjectDataset;
  setActiveClassId: (id: string) => void;
  onEditClass?: () => void;
  onCreateClass?: () => void;
}

/**
 * Custom class picker — replaces the native <select>.
 * Popover with optional search, keyboard nav, and class actions.
 */
export const ClassSwitcher: React.FC<ClassSwitcherProps> = ({
  datasets,
  activeDataset,
  setActiveClassId,
  onEditClass,
  onCreateClass,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? datasets.filter((ds) =>
        `${ds.className} ${ds.subjectName} ${ds.schoolYear}`.toLowerCase().includes(q)
      )
    : datasets;
  const showSearch = datasets.length > 5;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    setCursor(Math.max(0, filtered.findIndex((d) => d.id === activeDataset.id)));
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (id: string) => {
    setActiveClassId(id);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(filtered.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter' && filtered[cursor]) {
      e.preventDefault();
      pick(filtered[cursor].id);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0" onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Klasse auswählen"
        className="group flex items-center gap-1.5 rounded-md px-2 py-1 min-w-0 max-w-[130px] md:max-w-[180px] lg:max-w-[220px] text-left transition-colors hover:bg-black/5 dark:hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
      >
        <span className="flex flex-col min-w-0 flex-1 leading-tight">
          <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {activeDataset.className}
          </span>
          <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
            {activeDataset.subjectName}
          </span>
        </span>
        <ChevronsUpDown
          className="w-3 h-3 shrink-0 opacity-40 group-hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text-secondary)' }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 w-64 rounded-lg border shadow-xl z-50 overflow-hidden origin-top-left animate-pop-in"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          {showSearch && (
            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <Search className="w-3.5 h-3.5 opacity-40" style={{ color: 'var(--text-secondary)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                placeholder="Klasse suchen…"
                className="flex-1 bg-transparent text-xs focus:outline-none"
                style={{ color: 'var(--text-primary)', backgroundColor: 'transparent' }}
              />
            </div>
          )}
          <ul role="listbox" aria-label="Klassen" className="max-h-72 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>
                Keine Treffer
              </li>
            )}
            {filtered.map((ds, i) => {
              const selected = ds.id === activeDataset.id;
              const highlighted = i === cursor;
              return (
                <li
                  key={ds.id}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(ds.id)}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors"
                  style={{ backgroundColor: highlighted ? 'var(--bg-subtle)' : 'transparent' }}
                >
                  <span className="flex flex-col min-w-0 flex-1 leading-tight">
                    <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {ds.className}
                      <span className="font-normal" style={{ color: 'var(--text-secondary)' }}>
                        {' '}· {ds.subjectName}
                      </span>
                    </span>
                    <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {ds.students.filter((s) => !s.is_archived).length} Schüler:innen
                      {ds.schoolYear ? ` · ${ds.schoolYear}` : ''}
                    </span>
                  </span>
                  {selected && <Check className="w-3 h-3 shrink-0" style={{ color: 'var(--primary-500)' }} />}
                </li>
              );
            })}
          </ul>
          {(onEditClass || onCreateClass) && (
            <div className="border-t p-1 flex flex-col" style={{ borderColor: 'var(--border-subtle)' }}>
              {onEditClass && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); onEditClass(); }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-left transition-colors hover:bg-[var(--bg-subtle)]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Edit3 className="w-3 h-3" /> Klasse bearbeiten
                </button>
              )}
              {onCreateClass && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); onCreateClass(); }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-left transition-colors hover:bg-[var(--bg-subtle)]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <FolderPlus className="w-3 h-3" /> Neue Klasse / Import
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

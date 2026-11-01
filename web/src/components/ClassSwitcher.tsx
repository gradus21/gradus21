import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { ClassroomSubjectDataset } from '../data/demoClasses';

interface ClassSwitcherProps {
  datasets: ClassroomSubjectDataset[];
  activeDataset: ClassroomSubjectDataset;
  setActiveClassId: (id: string) => void;
}

/**
 * Custom class picker (replaces the native <select>, whose OS-rendered arrow and
 * option list clashed with the dark theme). Popover with filter field + keyboard nav.
 */
export const ClassSwitcher: React.FC<ClassSwitcherProps> = ({
  datasets,
  activeDataset,
  setActiveClassId,
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
        className="group flex items-center gap-2 rounded-lg pl-2.5 pr-2 py-1 min-w-0 max-w-[160px] sm:max-w-[230px] md:max-w-[270px] text-left transition-colors hover:bg-black/5 dark:hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60"
      >
        <span className="flex flex-col min-w-0 leading-tight">
          <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {activeDataset.className}
          </span>
          <span className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
            {activeDataset.subjectName}
          </span>
        </span>
        <ChevronsUpDown
          className="w-3.5 h-3.5 shrink-0 ml-auto opacity-50 group-hover:opacity-90 transition-opacity"
          style={{ color: 'var(--text-secondary)' }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 w-72 rounded-xl border shadow-2xl z-50 overflow-hidden origin-top-left animate-pop-in"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          {showSearch && (
            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <Search className="w-3.5 h-3.5 opacity-50" style={{ color: 'var(--text-secondary)' }} />
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
          <ul role="listbox" aria-label="Klassen" className="max-h-80 overflow-y-auto p-1.5">
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
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
                  className="flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer transition-colors"
                  style={{ backgroundColor: highlighted ? 'var(--bg-subtle)' : 'transparent' }}
                >
                  <span className="flex flex-col min-w-0 flex-1 leading-tight">
                    <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {ds.className}
                      <span className="font-normal" style={{ color: 'var(--text-secondary)' }}>
                        {' '}· {ds.subjectName}
                      </span>
                    </span>
                    <span className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {ds.students.filter((s) => !s.is_archived).length} Schüler:innen
                      {ds.schoolYear ? ` · ${ds.schoolYear}` : ''}
                    </span>
                  </span>
                  {selected && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--primary-500)' }} />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FileCheck,
  FileText,
  GraduationCap,
} from 'lucide-react';
import { getDisplayDomain } from '../utils/legalConfig';

interface AvvConfirmationModalProps {
  isOpen: boolean;
  avvUrl?: string;
  guideLabel?: string;
  zIndexClass?: string;
  onCancel: () => void;
  onOpenGuide: () => void;
  onConfirm: () => void;
}

/**
 * Shared Art. 28 DSGVO (AVV) confirmation dialog used when enabling E2EE cloud sync.
 */
export const AvvConfirmationModal: React.FC<AvvConfirmationModalProps> = ({
  isOpen,
  avvUrl,
  guideLabel = 'Leitfaden',
  zIndexClass = 'z-[70]',
  onCancel,
  onOpenGuide,
  onConfirm,
}) => {
  if (!isOpen) return null;

  const resolvedAvvUrl = avvUrl || 'https://gradus21.de/avv.html';
  const domain = getDisplayDomain(avvUrl);

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="avv-confirmation-title"
    >
      <div
        className="max-w-lg w-full rounded-2xl border p-6 shadow-2xl space-y-4"
        style={{ backgroundColor: 'var(--bg-surface, #ffffff)', borderColor: 'var(--border-subtle, #e2e8f0)' }}
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <FileCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4
              id="avv-confirmation-title"
              className="font-bold text-sm"
              style={{ color: 'var(--text-primary)' }}
            >
              Liegt für deine Schule bereits ein AVV vor?
            </h4>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Gemäß Art. 28 DSGVO und den Schuldatenschutzgesetzen ist für die verschlüsselte Cloud-Synchronisation
              von Noten- und Schülerdaten ein <strong>Auftragsverarbeitungsvertrag (AVV)</strong> zwischen deiner Schule
              und Gradus21 erforderlich.
            </p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
          Falls deine Schulleitung oder der Datenschutzbeauftragte (bDSB) noch nicht zugestimmt hat, leiten wir dich
          gerne direkt zur Mustervorlage auf {domain} weiter.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="avv-modal-resources">
          <a
            href={resolvedAvvUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-500/20 transition flex items-center justify-center gap-1.5"
            title={`AVV-Mustervertrag online auf ${domain} öffnen`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span>AVV-Muster ({domain})</span>
            <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
          </a>

          <button
            type="button"
            onClick={onOpenGuide}
            className="px-3.5 py-2 rounded-xl border border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-500/20 transition flex items-center justify-center gap-1.5"
          >
            <GraduationCap className="w-3.5 h-3.5 shrink-0" />
            <span>{guideLabel}</span>
          </button>
        </div>

        <div
          data-testid="avv-modal-actions"
          className="flex flex-col-reverse sm:flex-row flex-wrap items-stretch sm:items-center justify-end gap-2 pt-3 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 rounded-xl border text-xs font-semibold hover:opacity-80 transition"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            Abbrechen
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition hover:opacity-95 flex items-center justify-center gap-1.5"
            style={{ backgroundColor: 'var(--primary-500)' }}
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Ja, AVV liegt vor / genehmigt</span>
          </button>
        </div>
      </div>
    </div>
  );
};

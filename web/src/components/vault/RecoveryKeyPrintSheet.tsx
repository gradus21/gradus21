import React from 'react';
import { Printer, Copy, Check } from 'lucide-react';
import { escapeHtml } from '../ExportAndPrintHelpers';

export function printRecoverySheetDocument(targetEmail: string, formattedKey: string): void {
  const win = window.open('', '_blank', 'width=800,height=700');
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>Gradus21 – Persönliches Notfallblatt</title>
        <style>
          @page { size: A4; margin: 20mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            line-height: 1.5;
            padding: 24px;
            max-width: 720px;
            margin: 0 auto;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #0d9488;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .title {
            font-size: 24px;
            font-weight: 800;
            color: #0f766e;
            margin: 0;
          }
          .subtitle {
            font-size: 13px;
            color: #64748b;
            margin-top: 4px;
          }
          .badge {
            background: #ccfbf1;
            color: #0f766e;
            font-size: 11px;
            font-weight: 700;
            padding: 4px 10px;
            border-radius: 9999px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .description {
            font-size: 14px;
            color: #334155;
            margin-bottom: 24px;
          }
          .box {
            border: 2px solid #0d9488;
            border-radius: 12px;
            padding: 20px;
            background: #f0fdfa;
            margin-bottom: 24px;
          }
          .box-label {
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #0f766e;
            margin-bottom: 6px;
          }
          .box-value {
            font-size: 15px;
            font-weight: 600;
            color: #0f172a;
            margin-bottom: 16px;
          }
          .code {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 22px;
            font-weight: 800;
            letter-spacing: 3px;
            color: #042f2e;
            padding: 16px;
            background: #ffffff;
            border: 2px dashed #0d9488;
            border-radius: 8px;
            text-align: center;
            margin: 12px 0;
            word-break: break-all;
          }
          .warning {
            border-left: 4px solid #f59e0b;
            background: #fffbeb;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 12px;
            color: #92400e;
            margin-bottom: 24px;
          }
          .footer {
            font-size: 11px;
            color: #94a3b8;
            text-align: center;
            border-top: 1px solid #e2e8f0;
            padding-top: 16px;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">Gradus21 — Persönliches Notfallblatt</h1>
            <div class="subtitle">Ende-zu-Ende verschlüsselte Noten- & Prüfungsverwaltung</div>
          </div>
          <div class="badge">Streng vertraulich</div>
        </div>

        <p class="description">
          Deine Schülerdaten und Noten sind nach dem <strong>Zero-Knowledge-Prinzip</strong> geschützt:
          Niemand außer dir (weder Schulleitung noch Server-Betreiber) hat Zugriff auf deinen Schlüssel.
          Solltest du dein Passwort jemals vergessen, ist dieser <strong>Notfall-Code die einzige Möglichkeit</strong>,
          deinen Tresor wiederherzustellen.
        </p>

        <div class="box">
          <div class="box-label">Zugehöriges Konto / E-Mail</div>
          <div class="box-value">${escapeHtml(targetEmail)}</div>

          <div class="box-label">Persönlicher Notfall-Wiederherstellungscode</div>
          <div class="code">${escapeHtml(formattedKey || 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX')}</div>
        </div>

        <div class="warning">
          <strong>Wichtiger Aufbewahrungshinweis:</strong><br />
          Drucke dieses Blatt aus und hefte es an einem sicheren Ort (z. B. im heimischen Lehrerordner oder Notfallumschlag) ab.
          Speichere diesen Code nicht unverschlüsselt auf Schulrechnern oder in E-Mails.
        </div>

        <div class="footer">
          Erstellt mit Gradus21 · Lokale kryptografische Schlüsselableitung (Argon2id + AES-256-GCM)
        </div>

        <script>
          window.print();
        </script>
      </body>
    </html>
  `);
  win.document.close();
}

interface RecoveryKeySheetCardProps {
  email: string;
  recoveryKeyFormatted: string;
  onConfirmSaved?: () => void;
  isConfirmed?: boolean;
}

export const RecoveryKeySheetCard: React.FC<RecoveryKeySheetCardProps> = ({
  email,
  recoveryKeyFormatted,
  onConfirmSaved,
  isConfirmed,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (!recoveryKeyFormatted) return;
    navigator.clipboard.writeText(recoveryKeyFormatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    printRecoverySheetDocument(email, recoveryKeyFormatted);
  };

  return (
    <div
      className="p-5 rounded-2xl border space-y-4"
      style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="space-y-1">
        <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          Persönlicher Notfall-Wiederherstellungsschlüssel
        </h4>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Drucke diesen Bogen aus. Da Gradus21 nach dem Zero-Knowledge-Prinzip arbeitet, kann
          bei Passwortverlust niemand deinen Tresor entsperren — außer mit diesem Code!
        </p>
      </div>

      <div
        className="p-3.5 rounded-xl border font-mono text-center text-sm md:text-base font-bold tracking-wider select-all"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--primary-text)',
        }}
      >
        {recoveryKeyFormatted || 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX'}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handlePrint}
          className="flex-1 min-w-[140px] px-3.5 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.98]"
        >
          <Printer className="w-4 h-4" />
          <span>Notfallblatt drucken</span>
        </button>

        <button
          type="button"
          onClick={handleCopy}
          className="px-3.5 py-2.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition active:scale-[0.98]"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          {copied ? <Check className="w-4 h-4 text-teal-600" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Kopiert' : 'Kopieren'}</span>
        </button>
      </div>

      {onConfirmSaved && (
        <label className="flex items-start gap-2.5 pt-2 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isConfirmed}
            onChange={onConfirmSaved}
            className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
          />
          <span style={{ color: 'var(--text-secondary)' }}>
            Ich habe den Notfall-Wiederherstellungscode ausgedruckt oder sicher verwahrt.
          </span>
        </label>
      )}
    </div>
  );
};

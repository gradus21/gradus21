import React, { useState } from 'react';
import {
  BookOpen,
  HardDrive,
  Mail,
  Server,
  Shield,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { ActiveVaultSession } from '../VaultLockAndAuthModal';
import { UserManagementTab } from './UserManagementTab';
import { BackupConfigTab } from './BackupConfigTab';
import { CentralTemplatesTab } from './CentralTemplatesTab';
import { SmtpConfigTab } from './SmtpConfigTab';
import { MailTemplatesTab } from './MailTemplatesTab';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: ActiveVaultSession;
  onRestoreSuccess?: () => Promise<void> | void;
}

type AdminTab = 'users' | 'backups' | 'templates' | 'smtp' | 'mails';

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  session,
  onRestoreSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-5xl h-[88vh] max-h-[900px] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 dark:bg-indigo-400/10 border border-indigo-600/20 dark:border-indigo-400/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Gradus21 System-Administration
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Zero-Knowledge E2EE aktiv</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Angemeldet als Administrator: <span className="font-semibold text-slate-700 dark:text-slate-300">{session.email}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content with Sidebar Tabs */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Sidebar */}
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 p-3 bg-slate-50/40 dark:bg-slate-950/20 space-y-1 overflow-x-auto md:overflow-y-auto flex md:flex-col gap-1 md:gap-0">
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition text-left whitespace-nowrap ${
                activeTab === 'users'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Benutzerverwaltung</span>
            </button>

            <button
              onClick={() => setActiveTab('backups')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition text-left whitespace-nowrap ${
                activeTab === 'backups'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850'
              }`}
            >
              <HardDrive className="w-4 h-4" />
              <span>Backups & Snapshots</span>
            </button>

            <button
              onClick={() => setActiveTab('templates')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition text-left whitespace-nowrap ${
                activeTab === 'templates'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Globale Vorlagen</span>
            </button>

            <button
              onClick={() => setActiveTab('smtp')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition text-left whitespace-nowrap ${
                activeTab === 'smtp'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850'
              }`}
            >
              <Server className="w-4 h-4" />
              <span>SMTP-Server</span>
            </button>

            <button
              onClick={() => setActiveTab('mails')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition text-left whitespace-nowrap ${
                activeTab === 'mails'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850'
              }`}
            >
              <Mail className="w-4 h-4" />
              <span>E-Mail-Vorlagen</span>
            </button>
          </div>

          {/* Tab Content Panel */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'users' && (
              <UserManagementTab token={session.token} currentUserId={session.userId} />
            )}
            {activeTab === 'backups' && (
              <BackupConfigTab token={session.token} onRestoreSuccess={onRestoreSuccess} />
            )}
            {activeTab === 'templates' && <CentralTemplatesTab token={session.token} />}
            {activeTab === 'smtp' && <SmtpConfigTab token={session.token} />}
            {activeTab === 'mails' && <MailTemplatesTab token={session.token} />}
          </div>
        </div>
      </div>
    </div>
  );
};

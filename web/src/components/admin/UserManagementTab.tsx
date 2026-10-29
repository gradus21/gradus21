import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  Mail,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';

export interface AdminUser {
  id: string;
  email: string;
  is_admin: boolean;
  is_active: boolean;
  totp_enabled: boolean;
  has_passkey: boolean;
  passkey_count?: number;
  created_at?: string;
  last_login_at?: string;
}

interface UserManagementTabProps {
  token: string;
  currentUserId: string;
}

export const UserManagementTab: React.FC<UserManagementTabProps> = ({
  token,
  currentUserId,
}) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteIsAdmin, setInviteIsAdmin] = useState<boolean>(false);
  const [inviteSendMail, setInviteSendMail] = useState<boolean>(true);
  const [inviteLoading, setInviteLoading] = useState<boolean>(false);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const fetchUsers = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/users', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setErrorMsg('Fehler beim Laden der Benutzer:innen: ' + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const handleToggleAdmin = async (user: AdminUser) => {
    const actionText = user.is_admin ? 'Admin-Rechte entziehen' : 'zur/zum Administrator:in ernennen';
    if (!window.confirm(`Möchtest du ${user.email} wirklich ${actionText}?`)) {
      return;
    }
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_admin: !user.is_admin }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      setSuccessMsg(`Rolle für ${user.email} erfolgreich geändert.`);
      fetchUsers();
    } catch (err: any) {
      setErrorMsg('Aktion fehlgeschlagen: ' + (err.message || String(err)));
    }
  };

  const handleToggleActive = async (user: AdminUser) => {
    const actionText = user.is_active ? 'deaktivieren' : 'wieder aktivieren';
    if (!window.confirm(`Möchtest du das Konto von ${user.email} wirklich ${actionText}?`)) {
      return;
    }
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      setSuccessMsg(`Status für ${user.email} erfolgreich aktualisiert.`);
      fetchUsers();
    } catch (err: any) {
      setErrorMsg('Aktion fehlgeschlagen: ' + (err.message || String(err)));
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (
      !window.confirm(
        `ACHTUNG: Möchtest du das Benutzerkonto von ${user.email} unwiderruflich löschen?\nAlle verschlüsselten Daten werden vollständig vom Server entfernt.`
      )
    ) {
      return;
    }
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      setSuccessMsg(`Konto ${user.email} wurde erfolgreich gelöscht.`);
      fetchUsers();
    } catch (err: any) {
      setErrorMsg('Löschen fehlgeschlagen: ' + (err.message || String(err)));
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    setErrorMsg(null);
    setCreatedInviteUrl(null);
    try {
      const res = await fetch('/api/admin/users/invite', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          is_admin: inviteIsAdmin,
          send_mail: inviteSendMail,
        }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      const fullUrl = data.invite_url.startsWith('http')
        ? data.invite_url
        : `${window.location.origin}${data.invite_url}`;
      setCreatedInviteUrl(fullUrl);
      if (inviteSendMail && data.mail_sent === false) {
        setErrorMsg(
          `Einladung erstellt, aber E-Mail-Versand fehlgeschlagen: ${data.mail_error || 'SMTP-Fehler'}`
        );
      } else {
        setSuccessMsg(`Einladung für ${inviteEmail} erfolgreich erstellt!`);
      }
    } catch (err: any) {
      setErrorMsg('Einladung fehlgeschlagen: ' + (err.message || String(err)));
    } finally {
      setInviteLoading(false);
    }
  };

  const formatDateTime = (isoStr?: string) => {
    if (!isoStr) return 'Noch nie eingeloggt';
    try {
      const date = new Date(isoStr);
      return date.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const filteredUsers = users.filter((u) =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Benutzer:innenverwaltung & Berechtigungen</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Übersicht aller registrierten Lehrkräfte und Administrator:innen. Zero-Knowledge-Datenschutz gewährleistet:
            Noteninhalte und Klassendaten bleiben für Admins strikt unlesbar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchUsers}
            className="p-2 border rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
            title="Aktualisieren"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setInviteEmail('');
              setInviteIsAdmin(false);
              setCreatedInviteUrl(null);
              setShowInviteModal(true);
            }}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Benutzer:in einladen</span>
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

      {/* Filter Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
        <input
          type="text"
          placeholder="Nach E-Mail-Adresse suchen..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* User Table */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-semibold">E-Mail-Adresse</th>
                <th className="py-3 px-4 font-semibold">Rolle & Status</th>
                <th className="py-3 px-4 font-semibold">Sicherheitsmerkmale</th>
                <th className="py-3 px-4 font-semibold">Letzter Login</th>
                <th className="py-3 px-4 font-semibold text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Benutzerkonten werden geladen...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Keine passenden Benutzerkonten gefunden.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isCurrent = user.id === currentUserId;
                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition"
                    >
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span>{user.email}</span>
                          {isCurrent && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold">
                              Du
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {user.is_admin ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              <span>Admin</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              Lehrkraft
                            </span>
                          )}

                          {user.is_active ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                              Aktiv
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
                              Gesperrt
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                          {user.totp_enabled ? (
                            <span
                              className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
                              title="2-Faktor-Authentifizierung (TOTP) aktiviert"
                            >
                              <Smartphone className="w-3.5 h-3.5" />
                              <span className="text-[11px]">2FA</span>
                            </span>
                          ) : (
                            <span
                              className="text-slate-300 dark:text-slate-600"
                              title="Kein 2FA eingerichtet"
                            >
                              <Smartphone className="w-3.5 h-3.5 opacity-40" />
                            </span>
                          )}

                          {user.has_passkey ? (
                            <span
                              className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400"
                              title={`${user.passkey_count || 1} Passkey(s) verknüpft`}
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              <span className="text-[11px] font-medium">
                                {user.passkey_count && user.passkey_count > 1
                                  ? `${user.passkey_count} Passkeys`
                                  : 'Passkey'}
                              </span>
                            </span>
                          ) : (
                            <span
                              className="text-slate-300 dark:text-slate-600"
                              title="Kein Passkey verknüpft"
                            >
                              <KeyRound className="w-3.5 h-3.5 opacity-40" />
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span>{formatDateTime(user.last_login_at)}</span>
                          {user.created_at && (
                            <span className="text-[10px] text-slate-400">
                              Registriert: {new Date(user.created_at).toLocaleDateString('de-DE')}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Toggle Admin */}
                          <button
                            onClick={() => handleToggleAdmin(user)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
                            title={user.is_admin ? 'Admin-Rechte entziehen' : 'Zur/zum Administrator:in ernennen'}
                          >
                            <Shield className={`w-3.5 h-3.5 ${user.is_admin ? 'text-purple-600' : ''}`} />
                          </button>

                          {/* Toggle Active / Inactive */}
                          <button
                            onClick={() => handleToggleActive(user)}
                            disabled={isCurrent && user.is_active}
                            className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition ${
                              isCurrent && user.is_active
                                ? 'opacity-30 cursor-not-allowed'
                                : user.is_active
                                ? 'text-amber-600 hover:text-amber-700'
                                : 'text-emerald-600 hover:text-emerald-700'
                            }`}
                            title={user.is_active ? 'Konto sperren' : 'Konto aktivieren'}
                          >
                            {user.is_active ? (
                              <UserX className="w-3.5 h-3.5" />
                            ) : (
                              <UserCheck className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Delete User */}
                          <button
                            onClick={() => handleDeleteUser(user)}
                            disabled={isCurrent}
                            className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950/30 text-rose-500 hover:text-rose-600 transition ${
                              isCurrent ? 'opacity-30 cursor-not-allowed' : ''
                            }`}
                            title={isCurrent ? 'Du kannst dich nicht selbst löschen' : 'Konto endgültig löschen'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Neue Lehrkraft einladen</span>
            </h4>

            {createdInviteUrl ? (
              <div className="space-y-4">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300">
                  Die Einladung wurde erfolgreich generiert!
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Einladungslink:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdInviteUrl}
                      className="w-full text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createdInviteUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }}
                      className="p-2 border rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 transition"
                      title="Link kopieren"
                    >
                      {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      setShowInviteModal(false);
                      setCreatedInviteUrl(null);
                      fetchUsers();
                    }}
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold hover:opacity-90"
                  >
                    Schließen
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendInvite} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    E-Mail-Adresse:
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="lehrkraft@schule.de"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={inviteIsAdmin}
                      onChange={(e) => setInviteIsAdmin(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Als Administrator:in berechtigen</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={inviteSendMail}
                      onChange={(e) => setInviteSendMail(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Einladungs-E-Mail automatisch via SMTP versenden</span>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-3.5 py-2 border rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={inviteLoading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
                  >
                    {inviteLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>Einladung erstellen</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

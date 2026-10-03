import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Check, RefreshCw, Settings, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MasterShell } from "@/features/master/shell/MasterShell";
import { getNeroxaPlatformAccess, listNeroxaAuditLogs, type NeroxaAuditLog, type NeroxaPlatformRole } from "@/features/master/clients/services";
import { canPerform, ROLE_LABELS } from "@/features/master/permissions";
import {
  getPlatformSettings,
  getSecuritySettings,
  updatePlatformSettings,
  updateSecuritySettings,
  type PlatformSettings,
  type SecuritySettings,
} from "@/features/master/settings/services";

export const Route = createFileRoute("/master-configuracoes")({ component: MasterConfiguracoes });

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function labelAction(action: string) {
  return action.replaceAll("_", " ").toLowerCase().replace(/\\b\\w/g, (letter) => letter.toUpperCase());
}

function MasterConfiguracoes() {
  const [role, setRole] = useState<NeroxaPlatformRole | null>(null);
  const [platform, setPlatform] = useState<PlatformSettings | null>(null);
  const [security, setSecurity] = useState<SecuritySettings | null>(null);
  const [logs, setLogs] = useState<NeroxaAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = async (initial = false) => {
    setError(null);
    setMessage(null);
    if (initial) setLoading(true); else setRefreshing(true);
    try {
      const access = await getNeroxaPlatformAccess();
      if (!access?.active || !canPerform(access.role, "manageSettings")) {
        setRole(access?.active ? access.role : null);
        throw new Error("Você não tem permissão para acessar as configurações.");
      }
      setRole(access.role);
      const results = await Promise.all([
        getPlatformSettings(),
        getSecuritySettings(),
        canPerform(access.role, "viewAudit") ? listNeroxaAuditLogs(100) : Promise.resolve([]),
      ]);
      setPlatform(results[0]);
      setSecurity(results[1]);
      setLogs(results[2]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as configurações.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(true); }, []);

  const save = async () => {
    if (!platform || !security) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await Promise.all([updatePlatformSettings(platform), updateSecuritySettings(security)]);
      setMessage("Configurações salvas com sucesso.");
      if (canPerform(role, "viewAudit")) setLogs(await listNeroxaAuditLogs(100));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar as configurações.");
    } finally {
      setSaving(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    const term = filter.trim().toLowerCase();
    if (!term) return true;
    return [log.action, log.resource_type, log.resource_id || "", log.actor_id || "", JSON.stringify(log.details)].join(" ").toLowerCase().includes(term);
  });

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Carregando configurações...</main>;

  return (
    <MasterShell>
      <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sistema</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Configurações</h1>
          <p className="mt-1 text-sm text-slate-500">Controles operacionais e de segurança da plataforma Neroxa Master.</p>
        </header>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {message && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><Check className="h-4 w-4" />{message}</div>}

        {platform && security && (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100"><Settings className="h-4 w-4 text-slate-600" /></div>
                  <div><h2 className="font-semibold">Plataforma</h2><p className="text-xs text-slate-500">Parâmetros gerais persistidos no Master.</p></div>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="Nome da plataforma"><input value={platform.name} onChange={(e) => setPlatform({ ...platform, name: e.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200" /></Field>
                  <Field label="Moeda">
                    <select value={platform.currency} onChange={(e) => setPlatform({ ...platform, currency: e.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200">
                      <option value="BRL">BRL — Real brasileiro</option><option value="USD">USD — Dólar americano</option><option value="EUR">EUR — Euro</option>
                    </select>
                  </Field>
                  <Field label="Fuso horário">
                    <select value={platform.timezone} onChange={(e) => setPlatform({ ...platform, timezone: e.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200">
                      <option value="America/Sao_Paulo">America/Sao_Paulo</option><option value="America/Manaus">America/Manaus</option><option value="America/Belem">America/Belem</option><option value="UTC">UTC</option>
                    </select>
                  </Field>
                  <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <input type="checkbox" checked={platform.maintenance_mode} onChange={(e) => setPlatform({ ...platform, maintenance_mode: e.target.checked })} />
                    <span><span className="font-medium">Modo manutenção</span><span className="block text-xs text-slate-500">Salva a preferência; não bloqueia o acesso automaticamente.</span></span>
                  </label>
                </div>
              </Card>

              <Card className="border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100"><ShieldCheck className="h-4 w-4 text-slate-600" /></div>
                  <div><h2 className="font-semibold">Segurança</h2><p className="text-xs text-slate-500">Preferências administrativas e perfil atual: {role ? ROLE_LABELS[role] : "—"}.</p></div>
                </div>
                <div className="mt-5 space-y-4">
                  <Field label="Tempo de sessão (minutos)"><input type="number" min={15} max={1440} value={security.session_timeout_minutes} onChange={(e) => setSecurity({ ...security, session_timeout_minutes: Math.min(1440, Math.max(15, Number(e.target.value) || 15)) })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200" /></Field>
                  <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <input type="checkbox" checked={security.require_reauthentication_for_sensitive_actions} onChange={(e) => setSecurity({ ...security, require_reauthentication_for_sensitive_actions: e.target.checked })} />
                    <span><span className="font-medium">Reautenticação para ações sensíveis</span><span className="block text-xs text-slate-500">Preferência registrada para futuras validações de ações críticas.</span></span>
                  </label>
                </div>
              </Card>
            </div>
            <div className="flex justify-end"><Button onClick={() => void save()} disabled={saving}>{saving ? "Salvando..." : "Salvar configurações"}</Button></div>
          </>
        )}

        {canPerform(role, "viewAudit") && (
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#102a2e] text-white"><Activity className="h-4 w-4" /></div>
                <div><h2 className="font-semibold">Auditoria</h2><p className="text-xs text-slate-500">Ações administrativas recentes no Master.</p></div>
              </div>
              <Button variant="outline" onClick={() => void load()} disabled={refreshing}><RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Atualizar</Button>
            </div>
            <div className="border-b border-slate-100 p-4"><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar por ação, recurso, usuário ou detalhes" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200" /></div>
            {filteredLogs.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">Nenhum registro encontrado.</div> : (
              <div className="divide-y divide-slate-100">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="grid gap-2 p-4 sm:grid-cols-[150px_minmax(0,1fr)_180px]">
                    <p className="text-xs text-slate-500">{formatDate(log.created_at)}</p>
                    <div><p className="text-sm font-medium text-slate-800">{labelAction(log.action)}</p><p className="text-xs text-slate-500">{log.resource_type}{log.resource_id ? " · " + log.resource_id : ""}</p></div>
                    <p className="break-all text-[10px] text-slate-400">Ator: {log.actor_id || "—"}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </MasterShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1.5 block font-medium text-slate-700">{label}</span>{children}</label>;
}

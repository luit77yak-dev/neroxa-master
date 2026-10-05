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
  getNeroxaLegalProfile,
  updatePlatformSettings,
  updateSecuritySettings,
  updateNeroxaLegalProfile,
  type PlatformSettings,
  type SecuritySettings,
  type NeroxaLegalProfile,
} from "@/features/master/settings/services";

export const Route = createFileRoute("/master-configuracoes")({ component: MasterConfiguracoes });

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function labelAction(action: string) {
  return action.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function MasterConfiguracoes() {
  const [role, setRole] = useState<NeroxaPlatformRole | null>(null);
  const [platform, setPlatform] = useState<PlatformSettings | null>(null);
  const [security, setSecurity] = useState<SecuritySettings | null>(null);
  const [legalProfile, setLegalProfile] = useState<NeroxaLegalProfile | null>(null);
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
      const [platformSettings, securitySettings, neroxaLegalProfile] = await Promise.all([
        getPlatformSettings(),
        getSecuritySettings(),
        getNeroxaLegalProfile(),
      ]);
      setPlatform(platformSettings);
      setSecurity(securitySettings);
      setLegalProfile(neroxaLegalProfile);
      if (canPerform(access.role, "viewAudit")) {
        void listNeroxaAuditLogs(100)
          .then(setLogs)
          .catch(() => setLogs([]));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as configurações.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(true); }, []);

  const save = async () => {
    if (!platform || !security || !legalProfile) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await Promise.all([
        updatePlatformSettings(platform),
        updateSecuritySettings(security),
        updateNeroxaLegalProfile(legalProfile),
      ]);
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

  if (loading) return <main className="grid min-h-screen place-items-center bg-muted/50 text-sm text-muted-foreground">Carregando configurações...</main>;

  return (
    <MasterShell>
      <div className="mx-auto min-w-0 max-w-[1400px] space-y-5 overflow-x-hidden p-3 sm:space-y-6 sm:p-6 lg:p-8">
        <header>
          <p className="text-xs font-medium tracking-wide text-muted-foreground/70">Sistema</p>
          <h1 className="mt-1 font-display text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px] text-foreground">Configurações</h1>
          <p className="mt-1 text-sm text-muted-foreground">Controles operacionais e de segurança da plataforma Neroxa Master.</p>
        </header>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {message && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-success/10 px-4 py-3 text-sm text-success"><Check className="h-4 w-4" />{message}</div>}

        {platform && security && (
          <>
            <Card className="border-border bg-card p-5 shadow-soft lg:col-span-2">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted"><ShieldCheck className="h-4 w-4 text-muted-foreground" /></div>
                <div><h2 className="font-semibold">Identificação da Neroxa</h2><p className="text-xs text-muted-foreground">A Neroxa está configurada como Pessoa Física nesta fase. Esses dados serão congelados no contrato quando ele for enviado para assinatura.</p></div>
              </div>
              {legalProfile && <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Nome comercial"><input value={legalProfile.trade_name} onChange={(e) => setLegalProfile({ ...legalProfile, trade_name: e.target.value })} placeholder="Neroxa | Soluções Personalizadas" className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-border" /></Field>
                <Field label="Nome civil / nome completo"><input value={legalProfile.legal_name} onChange={(e) => setLegalProfile({ ...legalProfile, legal_name: e.target.value })} placeholder="Seu nome completo" className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-border" /></Field>
                <Field label="CPF"><input value={legalProfile.tax_id} onChange={(e) => setLegalProfile({ ...legalProfile, tax_id: e.target.value })} placeholder="000.000.000-00" inputMode="numeric" autoComplete="off" className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-border" /></Field>
                <Field label="Nome para assinatura"><input value={legalProfile.signer_name} onChange={(e) => setLegalProfile({ ...legalProfile, signer_name: e.target.value })} placeholder="Seu nome completo" autoComplete="name" className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-border" /></Field>
                <Field label="Cargo do responsável"><input value={legalProfile.signer_role} onChange={(e) => setLegalProfile({ ...legalProfile, signer_role: e.target.value })} placeholder="Fundador / Responsável pela Neroxa" className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-slate-400 focus:ring-2 focus:ring-border" /></Field>
              </div>}
              <p className="mt-4 text-xs leading-5 text-muted-foreground">O CPF é usado como documento da prestadora nos contratos. Não coloque o CPF diretamente no código-fonte.</p>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-border bg-card p-5 shadow-soft">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted"><Settings className="h-4 w-4 text-muted-foreground" /></div>
                  <div><h2 className="font-semibold">Plataforma</h2><p className="text-xs text-muted-foreground">Parâmetros gerais persistidos no Master.</p></div>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="Nome da plataforma"><input value={platform.name} onChange={(e) => setPlatform({ ...platform, name: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-border" /></Field>
                  <Field label="Moeda">
                    <select value={platform.currency} onChange={(e) => setPlatform({ ...platform, currency: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-border">
                      <option value="BRL">BRL — Real brasileiro</option><option value="USD">USD — Dólar americano</option><option value="EUR">EUR — Euro</option>
                    </select>
                  </Field>
                  <Field label="Fuso horário">
                    <select value={platform.timezone} onChange={(e) => setPlatform({ ...platform, timezone: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-border">
                      <option value="America/Sao_Paulo">America/Sao_Paulo</option><option value="America/Manaus">America/Manaus</option><option value="America/Belem">America/Belem</option><option value="UTC">UTC</option>
                    </select>
                  </Field>
                  <label className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-3 text-sm">
                    <input type="checkbox" checked={platform.maintenance_mode} onChange={(e) => setPlatform({ ...platform, maintenance_mode: e.target.checked })} />
                    <span><span className="font-medium">Modo manutenção</span><span className="block text-xs text-muted-foreground">Salva a preferência; não bloqueia o acesso automaticamente.</span></span>
                  </label>
                </div>
              </Card>

              <Card className="border-border bg-card p-5 shadow-soft">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted"><ShieldCheck className="h-4 w-4 text-muted-foreground" /></div>
                  <div><h2 className="font-semibold">Segurança</h2><p className="text-xs text-muted-foreground">Preferências administrativas e perfil atual: {role ? ROLE_LABELS[role] : "—"}.</p></div>
                </div>
                <div className="mt-5 space-y-4">
                  <Field label="Tempo de sessão (minutos)"><input type="number" min={15} max={1440} value={security.session_timeout_minutes} onChange={(e) => setSecurity({ ...security, session_timeout_minutes: Math.min(1440, Math.max(15, Number(e.target.value) || 15)) })} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-border" /></Field>
                  <label className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-3 text-sm">
                    <input type="checkbox" checked={security.require_reauthentication_for_sensitive_actions} onChange={(e) => setSecurity({ ...security, require_reauthentication_for_sensitive_actions: e.target.checked })} />
                    <span><span className="font-medium">Reautenticação para ações sensíveis</span><span className="block text-xs text-muted-foreground">Preferência registrada para futuras validações de ações críticas.</span></span>
                  </label>
                </div>
              </Card>
            </div>
            <div className="flex flex-wrap justify-end gap-2"><Button onClick={() => void save()} disabled={saving}>{saving ? "Salvando..." : "Salvar configurações"}</Button></div>
          </>
        )}

        {canPerform(role, "viewAudit") && (
          <Card className="overflow-hidden border-border bg-card shadow-soft">
            <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar text-white"><Activity className="h-4 w-4" /></div>
                <div><h2 className="font-semibold">Auditoria</h2><p className="text-xs text-muted-foreground">Ações administrativas recentes no Master.</p></div>
              </div>
              <Button variant="outline" onClick={() => void load()} disabled={refreshing}><RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Atualizar</Button>
            </div>
            <div className="border-b border-border/60 p-4"><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar por ação, recurso, usuário ou detalhes" className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-border" /></div>
            {filteredLogs.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</div> : (
              <div className="divide-y divide-border">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="grid gap-2 p-4 sm:grid-cols-[150px_minmax(0,1fr)_180px]">
                    <p className="text-xs text-muted-foreground">{formatDate(log.created_at)}</p>
                    <div><p className="text-sm font-medium text-foreground">{labelAction(log.action)}</p><p className="text-xs text-muted-foreground">{log.resource_type}{log.resource_id ? " · " + log.resource_id : ""}</p></div>
                    <p className="break-all text-[10px] text-muted-foreground/70">Ator: {log.actor_id || "—"}</p>
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
  return <label className="block text-sm"><span className="mb-1.5 block font-medium text-foreground/80">{label}</span>{children}</label>;
}

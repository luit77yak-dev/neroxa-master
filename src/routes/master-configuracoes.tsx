import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, RefreshCw, Settings, ShieldCheck } from "lucide-react";
import { MasterShell } from "@/features/master/shell/MasterShell";
import { listNeroxaAuditLogs, type NeroxaAuditLog } from "@/features/master/clients/services";
import { getNeroxaPlatformAccess } from "@/features/master/clients/services";
import { canPerform, ROLE_LABELS } from "@/features/master/permissions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/master-configuracoes")({ component: MasterConfiguracoes });

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function labelAction(action: string) {
  return action.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function MasterConfiguracoes() {
  const [logs, setLogs] = useState<NeroxaAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<import("@/features/master/clients/services").NeroxaPlatformRole | null>(null);
  const [filter, setFilter] = useState("");

  const loadAudit = async (initial = false) => {
    setError(null);
    initial ? setLoading(true) : setRefreshing(true);
    try {
      const access = await getNeroxaPlatformAccess();
      setRole(access?.active ? access.role : null);
      if (!access?.active || !canPerform(access.role, "viewAudit")) return;
      setLogs(await listNeroxaAuditLogs(100));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a auditoria.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void loadAudit(true); }, []);

  const filteredLogs = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter((log) =>
      [log.action, log.resource_type, log.resource_id ?? "", log.actor_id ?? "", JSON.stringify(log.details)]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [filter, logs]);

  return (
    <MasterShell>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sistema</p>
          <h1 className="text-2xl font-semibold">Configurações</h1>
          <p className="mt-1 text-sm text-slate-500">Preferências, segurança e controles da plataforma Neroxa Master.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <Settings className="h-5 w-5 text-slate-500"/>
            <h2 className="mt-4 font-semibold">Plataforma</h2>
            <p className="mt-1 text-sm text-slate-500">Configurações gerais, integrações e parâmetros operacionais.</p>
          </section>
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <ShieldCheck className="h-5 w-5 text-slate-500"/>
            <h2 className="mt-4 font-semibold">Segurança</h2>
            <p className="mt-1 text-sm text-slate-500">{role ? `Perfil atual: ${ROLE_LABELS[role]}` : "Controles de acesso da equipe Neroxa."}</p>
          </section>
        </div>

        {canPerform(role, "viewAudit") && (
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#102a2e] text-white"><Activity className="h-4 w-4"/></div>
                <div>
                  <h2 className="font-semibold">Auditoria</h2>
                  <p className="text-xs text-slate-500">Registro das ações administrativas realizadas no Master.</p>
                </div>
              </div>
              <Button variant="outline" onClick={() => void loadAudit()} disabled={refreshing}>
                <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Atualizar
              </Button>
            </div>

            <div className="border-b border-slate-100 p-4">
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filtrar por ação, recurso, usuário ou detalhes"
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
              />
            </div>

            {error && <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            {loading ? (
              <div className="p-10 text-center text-sm text-slate-500">Carregando auditoria...</div>
            ) : filteredLogs.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">Nenhum registro encontrado.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="grid gap-2 p-4 sm:grid-cols-[150px_minmax(0,1fr)_180px] sm:items-start">
                    <p className="text-xs text-slate-500">{formatDate(log.created_at)}</p>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{labelAction(log.action)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{log.resource_type}{log.resource_id ? ` · ${log.resource_id}` : ""}</p>
                      {Object.keys(log.details ?? {}).length > 0 && (
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600">{JSON.stringify(log.details, null, 2)}</pre>
                      )}
                    </div>
                    <p className="break-all text-[10px] text-slate-400">Ator: {log.actor_id ?? "—"}</p>
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

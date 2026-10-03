import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Globe2, Loader2, RefreshCw, XCircle } from "lucide-react";
import {
  getNeroxaPlatformAccess,
  listNeroxaClients,
  listNeroxaClientInstances,
  listNeroxaInstanceDomains,
  type NeroxaPlatformRole,
  type NeroxaSystemDomain,
} from "@/features/master/clients/services";
import { canPerform } from "@/features/master/permissions";
import { validateDomainDns, type DomainStatus } from "@/features/master/domains/services";
import { Button } from "@/components/ui/button";
import { MasterShell } from "@/features/master/shell/MasterShell";

export const Route = createFileRoute("/master-dominios")({
  component: MasterDominios,
});

type DomainRow = NeroxaSystemDomain & {
  instanceName: string;
  instanceSlug: string;
  instanceStatus: "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
};

const statusLabel: Record<DomainStatus, string> = {
  PENDING: "Pendente",
  VERIFYING: "Em validação",
  VERIFIED: "Validado",
  FAILED: "Falhou",
  DISABLED: "Desativado",
};

const statusClass: Record<DomainStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  VERIFYING: "bg-blue-50 text-blue-700",
  VERIFIED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700",
  DISABLED: "bg-slate-100 text-slate-500",
};

function MasterDominios() {
  const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const contextClientId = params?.get("clientId") ?? null;
  const contextOrganizationId = params?.get("organizationId") ?? null;
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [role, setRole] = useState<NeroxaPlatformRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [dnsResult, setDnsResult] = useState<Record<string, { ok: boolean; message: string; records: { a: string[]; cname: string[]; nameservers: string[] } }>>({});
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const access = await getNeroxaPlatformAccess();
      if (!access?.active) throw new Error("Acesso restrito à equipe Neroxa.");
      setRole(access.role);

      const clients = await listNeroxaClients();
      const rows: DomainRow[] = [];
      const scopedClients = contextOrganizationId
        ? clients.filter((client) => client.organization_id === contextOrganizationId)
        : contextClientId
          ? clients.filter((client) => client.id === contextClientId)
          : clients;

      for (const client of scopedClients) {
        const instances = await listNeroxaClientInstances(client.organization_id);
        for (const instance of instances) {
          const instanceDomains = await listNeroxaInstanceDomains(instance.id);
          rows.push(
            ...instanceDomains.map((domain) => ({
              ...domain,
              instanceName: instance.name,
              instanceSlug: instance.slug,
              instanceStatus: instance.status,
            })),
          );
        }
      }

      setDomains(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os domínios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function validateDns(domain: DomainRow) {
    setWorking(domain.id);
    setError(null);
    try {
      const result = await validateDomainDns(domain.id, domain.domain);
      setDnsResult((current) => ({
        ...current,
        [domain.id]: {
          ok: result.ok,
          message: result.message,
          records: result.records,
        },
      }));
      await load();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Não foi possível validar o DNS.");
    } finally {
      setWorking(null);
    }
  }

  async function changeStatus(domain: DomainRow, nextStatus: DomainStatus) {
    setWorking(domain.id);
    setError(null);

    try {
      await transitionDomainStatus(domain.id, nextStatus);
      await load();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Não foi possível atualizar o status do domínio.");
    } finally {
      setWorking(null);
    }
  }

  const canManage = canPerform(role, "manageSystems");

  return (
    <MasterShell>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sistema</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Domínios</h1>
            <p className="mt-1 text-sm text-slate-500">
              Acompanhe e valide os domínios vinculados às instâncias dos clientes.
            </p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <p className="text-sm font-semibold text-slate-800">Domínios cadastrados</p>
            <p className="text-xs text-slate-500">{domains.length} domínio(s)</p>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando domínios…
            </div>
          ) : domains.length === 0 ? (
            <div className="p-10 text-center">
              <Globe2 className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">Nenhum domínio cadastrado</p>
              <p className="mt-1 text-xs text-slate-500">
                Cadastre um domínio na instância e ele aparecerá aqui para validação.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {domains.map((domain) => {
                const disabled = working === domain.id || domain.instanceStatus === "ARCHIVED";
                const canStart = canManage && !disabled && ["PENDING", "FAILED", "DISABLED"].includes(domain.status);
                const canConfirm = canManage && !disabled && domain.status === "VERIFYING";
                const canDisable = canManage && !disabled && domain.status === "VERIFIED";

                return (
                  <div key={domain.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{domain.domain}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {domain.instanceName} · {domain.instanceSlug}
                        {domain.is_primary ? " · Principal" : ""}
                      </p>
                      {domain.verified_at && (
                        <p className="mt-1 text-[11px] text-slate-400">
                          Validado em {new Date(domain.verified_at).toLocaleString("pt-BR")}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[domain.status]}`}>
                        {statusLabel[domain.status]}
                      </span>

                      {canStart && (
                        <Button size="sm" variant="outline" disabled={disabled} onClick={() => void validateDns(domain)}>
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                          {domain.status === "FAILED" ? "Validar novamente" : "Validar DNS"}
                        </Button>
                      )}

                      {canConfirm && (
                        <>
                          <Button size="sm" variant="outline" disabled={disabled} onClick={() => void changeStatus(domain, "VERIFIED")}>
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            Confirmar validação
                          </Button>
                          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => void changeStatus(domain, "FAILED")}>
                            <XCircle className="mr-1.5 h-3.5 w-3.5" />
                            Falhou
                          </Button>
                        </>
                      )}

                      {canDisable && (
                        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => void changeStatus(domain, "DISABLED")}>
                          Desativar
                        </Button>
                      )}

                      {dnsResult[domain.id] && (
                        <div className={`w-full rounded-lg border p-3 text-xs lg:w-auto lg:max-w-md ${dnsResult[domain.id].ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
                          <p className="font-medium">{dnsResult[domain.id].message}</p>
                          <p className="mt-1">A: {dnsResult[domain.id].records.a.join(", ") || "—"}</p>
                          <p>CNAME: {dnsResult[domain.id].records.cname.join(", ") || "—"}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </MasterShell>
  );
}

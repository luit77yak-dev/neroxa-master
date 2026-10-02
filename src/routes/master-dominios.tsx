import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Globe2, RefreshCw } from "lucide-react";
import {
  isNeroxaStaff,
  listNeroxaClients,
  listNeroxaClientInstances,
  listNeroxaInstanceDomains,
  type NeroxaSystemDomain,
  type NeroxaSystemInstance,
} from "@/features/master/clients/services";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/master-dominios")({
  component: MasterDominios,
});

type DomainRow = NeroxaSystemDomain & {
  instanceName: string;
  instanceSlug: string;
};

function MasterDominios() {
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      if (!(await isNeroxaStaff())) {
        throw new Error("Acesso restrito à equipe Neroxa.");
      }

      const clients = await listNeroxaClients();
      const rows: DomainRow[] = [];

      for (const client of clients) {
        const instances = await listNeroxaClientInstances(client.organization_id);
        for (const instance of instances) {
          const instanceDomains = await listNeroxaInstanceDomains(instance.id);
          rows.push(
            ...instanceDomains.map((domain) => ({
              ...domain,
              instanceName: instance.name,
              instanceSlug: instance.slug,
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

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sistema</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Domínios</h1>
          <p className="mt-1 text-sm text-slate-500">
            Acompanhe os domínios vinculados às instâncias dos clientes.
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
          <div className="p-8 text-sm text-slate-500">Carregando domínios…</div>
        ) : domains.length === 0 ? (
          <div className="p-10 text-center">
            <Globe2 className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">Nenhum domínio cadastrado</p>
            <p className="mt-1 text-xs text-slate-500">
              Os domínios das instâncias podem ser cadastrados na área do cliente.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {domains.map((domain) => (
              <div key={domain.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{domain.domain}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {domain.instanceName} · {domain.instanceSlug}
                    {domain.is_primary ? " · Principal" : ""}
                  </p>
                </div>
                <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {domain.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

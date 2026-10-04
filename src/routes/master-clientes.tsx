import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MasterShell } from "@/features/master/shell/MasterShell";
import { createNeroxaSystemInstance, listNeroxaSystems, type NeroxaSystem } from "@/features/master/systems/services";
import { loadSubscriptionOverview } from "@/features/master/subscriptions/services";
import { MasterLogin } from "@/features/master/shell/MasterLogin";
import { Client360Shell } from "@/features/master/clients/components/Client360/Client360Shell";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ALLOWED_TRANSITIONS,
  STATUS_LABELS,
  STATUS_TONE,
  type ClientStatus,
  type NeroxaClient,
  type NeroxaClientContact,
} from "@/features/master/clients/types";
import {
  createNeroxaClient,
  isNeroxaStaff,
  listNeroxaClientContacts,
  listNeroxaClients,
  transitionNeroxaClient,
  updateNeroxaClient,
  createNeroxaSystemDomain,
  listNeroxaClientInstances,
  listNeroxaInstanceDomains,
  type NeroxaSystemDomain,
  type NeroxaSystemInstance,
} from "@/features/master/clients/services";

export const Route = createFileRoute("/master-clientes")({
  component: MasterClientsPage,
});

const emptyDraft = { legalName: "", tradeName: "", taxId: "", notes: "" };

function MasterClientsPage() {
  const [routeContext] = useState(() => {
    if (typeof window === "undefined") return { clientId: null, section: "client" };
    const params = new URLSearchParams(window.location.search);
    return {
      clientId: params.get("clientId"),
      section: params.get("section") || "client",
    };
  });
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [clients, setClients] = useState<NeroxaClient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(routeContext.clientId);
  const [contacts, setContacts] = useState<NeroxaClientContact[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClientStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [instances, setInstances] = useState<NeroxaSystemInstance[]>([]);
  const [domains, setDomains] = useState<Record<string, NeroxaSystemDomain[]>>({});
  const [domainDraft, setDomainDraft] = useState("");
  const [domainInstanceId, setDomainInstanceId] = useState("");
  const [savingDomain, setSavingDomain] = useState(false);
  const [showInstanceCreate, setShowInstanceCreate] = useState(false);
  const [systems, setSystems] = useState<NeroxaSystem[]>([]);
  const [plans, setPlans] = useState<Array<{ id: string; name: string; active: boolean }>>([]);
  const [clientSubscriptions, setClientSubscriptions] = useState<Array<{ id: string; plan_id: string; status: string }>>([]);
  const [instanceDraft, setInstanceDraft] = useState({ systemId: "", planId: "", subscriptionId: "", name: "", slug: "" });
  const [savingInstance, setSavingInstance] = useState(false);

  const selected = clients.find((client) => client.id === selectedId) ?? null;

  const loadClients = async (keepSelection = true) => {
    setLoading(true);
    setError(null);
    try {
      const staff = await isNeroxaStaff();
      setAuthorized(staff);
      if (!staff) return;
      const rows = await listNeroxaClients();
      setClients(rows);
      if (routeContext.clientId && rows.some((client) => client.id === routeContext.clientId)) {
        setSelectedId(routeContext.clientId);
        return;
      }
      if (keepSelection && selectedId && rows.some((client) => client.id === selectedId)) return;
      setSelectedId(rows[0]?.id ?? null);
    } catch (cause) {
      setAuthorized(false);
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os clientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadClients(false);
  }, []);

  useEffect(() => {
    void listNeroxaSystems().then(setSystems).catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar os sistemas."));
    void loadSubscriptionOverview().then((overview) => setPlans(overview.plans.map((plan) => ({ id: plan.id, name: plan.name, active: plan.active })))).catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar os planos."));
    if (!selected?.organization_id) {
      setContacts([]);
      setInstances([]);
      setDomains({});
      setDomainInstanceId("");
      return;
    }

    void loadSubscriptionOverview().then((overview) => setClientSubscriptions(overview.subscriptions.filter((subscription) => subscription.client_id === selected.organization_id).map((subscription) => ({ id: subscription.id, plan_id: subscription.plan_id, status: subscription.status })))).catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar as assinaturas."));

    void listNeroxaClientContacts(selected.id)
      .then(setContacts)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar o contato."));

    void listNeroxaClientInstances(selected.organization_id)
      .then((rows) => {
        setInstances(rows);
        setDomainInstanceId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? "");
        return Promise.all(rows.map(async (instance) => [instance.id, await listNeroxaInstanceDomains(instance.id)] as const));
      })
      .then((entries) => setDomains(Object.fromEntries(entries)))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar as instâncias."));
  }, [selectedId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (selectedId) {
      params.set("clientId", selectedId);
    } else {
      params.delete("clientId");
      params.delete("section");
    }
    window.history.replaceState({}, "", params.toString() ? `/master-clientes?${params.toString()}` : "/master-clientes");
  }, [selectedId]);

  useEffect(() => {
    if (!selected) return;
    setDraft({
      legalName: selected.legal_name ?? "",
      tradeName: selected.trade_name ?? "",
      taxId: selected.tax_id ?? "",
      notes: selected.notes ?? "",
    });
    setEditing(false);
  }, [selectedId]);

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clients.filter((client) => {
      const matchesStatus = statusFilter === "ALL" || client.status === statusFilter;
      if (!matchesStatus) return false;
      if (!term) return true;
      return [client.trade_name, client.legal_name, client.tax_id]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [clients, search, statusFilter]);

  const counts = useMemo(() => ({
    total: clients.length,
    active: clients.filter((client) => client.status === "ACTIVE").length,
    onboarding: clients.filter((client) => client.status === "IMPLEMENTATION").length,
    attention: clients.filter((client) => client.status === "DELINQUENT").length,
  }), [clients]);

  const notify = (message: string) => {
    setError(null);
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2800);
  };

  const handleCreate = async () => {
    if (!draft.legalName.trim() && !draft.tradeName.trim()) {
      setError("Informe a razão social ou o nome comercial.");
      return;
    }
    setSaving(true);
    try {
      const id = await createNeroxaClient(draft);
      await loadClients(false);
      setSelectedId(id);
      setShowCreate(false);
      setDraft(emptyDraft);
      notify("Cliente criado como Lead.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o cliente.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selected) return;
    if (!draft.legalName.trim() && !draft.tradeName.trim()) {
      setError("Informe a razão social ou o nome comercial.");
      return;
    }
    setSaving(true);
    try {
      await updateNeroxaClient({ clientId: selected.id, ...draft });
      await loadClients();
      setEditing(false);
      notify("Dados do cliente atualizados.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o cliente.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateInstance = async () => {
    if (!selected?.organization_id) {
      setError("Este cliente ainda não possui uma organização vinculada.");
      return;
    }
    const system = systems.find((row) => row.id === instanceDraft.systemId);
    if (!system || !instanceDraft.planId || !instanceDraft.name.trim() || !instanceDraft.slug.trim()) {
      setError("Informe sistema, plano, nome e slug da instância.");
      return;
    }
    setSavingInstance(true);
    try {
      const created = await createNeroxaSystemInstance({
        organizationId: selected.organization_id,
        systemId: system.id,
        systemType: system.system_type,
        planId: instanceDraft.planId,
        subscriptionId: instanceDraft.subscriptionId || null,
        name: instanceDraft.name,
        slug: instanceDraft.slug,
      });
      setInstances(await listNeroxaClientInstances(selected.organization_id));
      setDomainInstanceId(created.id);
      setShowInstanceCreate(false);
      setInstanceDraft({ systemId: "", planId: "", subscriptionId: "", name: "", slug: "" });
      notify("Instância criada em provisionamento.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar a instância.");
    } finally {
      setSavingInstance(false);
    }
  };

  const handleAddDomain = async () => {
    if (!domainInstanceId) {
      setError("Selecione uma instância para vincular o domínio.");
      return;
    }
    if (!domainDraft.trim()) {
      setError("Informe o domínio.");
      return;
    }

    setSavingDomain(true);
    try {
      const domainId = await createNeroxaSystemDomain({
        instanceId: domainInstanceId,
        domain: domainDraft,
        isPrimary: (domains[domainInstanceId] ?? []).length === 0,
      });
      const refreshed = await listNeroxaInstanceDomains(domainInstanceId);
      setDomains((current) => ({ ...current, [domainInstanceId]: refreshed }));
      setDomainDraft("");
      notify("Domínio cadastrado como pendente de verificação.");
      void domainId;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar o domínio.");
    } finally {
      setSavingDomain(false);
    }
  };

  const handleTransition = async (status: ClientStatus) => {
    if (!selected || status === selected.status) return;
    setSaving(true);
    try {
      await transitionNeroxaClient(selected.id, status);
      await loadClients();
      notify(`Status alterado para ${STATUS_LABELS[status]}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar o status.");
    } finally {
      setSaving(false);
    }
  };

 if(authorized===false)return <MasterLogin />;

  if (authorized === null || loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">
        <Loader2 className="h-7 w-7 animate-spin" />
      </main>
    );
  }

  return (
    <MasterShell>
    <main className="min-h-screen bg-slate-50 text-slate-900">

      <div className="mx-auto grid max-w-[1500px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Clientes", counts.total, "Total cadastrado"],
              ["Ativos", counts.active, "Operação ativa"],
              ["Implantação", counts.onboarding, "Em onboarding"],
              ["Atenção", counts.attention, "Inadimplentes"],
            ].map(([label, value, hint]) => (
              <Card key={label} className="border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{hint}</p>
              </Card>
            ))}
          </div>

          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por empresa, nome comercial ou CNPJ"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as ClientStatus | "ALL")}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="ALL">Todos os status</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {error && (
              <div className="flex items-start gap-2 border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            )}
            {notice && (
              <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <Check className="h-4 w-4" /> {notice}
              </div>
            )}

            <div className="divide-y divide-slate-100">
              {filteredClients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => setSelectedId(client.id)}
                  className={`flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50 ${selectedId === client.id ? "bg-slate-50" : ""}`}
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{client.trade_name || client.legal_name || "Cliente sem nome"}</p>
                    <p className="truncate text-xs text-slate-500">{client.legal_name || "Sem razão social"}{client.organization_id ? " · Organização vinculada" : " · Lead sem organização"}</p>
                  </div>
                  <span className={`hidden rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex ${STATUS_TONE[client.status]}`}>
                    {STATUS_LABELS[client.status]}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition ${selectedId === client.id ? "rotate-[-90deg]" : ""}`} />
                </button>
              ))}
              {!filteredClients.length && (
                <div className="px-6 py-14 text-center">
                  <Users className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-700">Nenhum cliente encontrado</p>
                  <p className="mt-1 text-xs text-slate-500">Ajuste os filtros ou cadastre o primeiro cliente.</p>
                </div>
              )}
            </div>
          </Card>
        </section>

        <Client360Shell
          key={selected.id}
          clientId={selected.id}
          organizationId={selected.organization_id}
          clientName={selected.trade_name || selected.legal_name || "Cliente sem nome"}
          status={STATUS_LABELS[selected.status]}
          initialSection={routeContext.clientId === selected.id ? routeContext.section : "client"}
          onSectionChange={(section) => {
            const params = new URLSearchParams(window.location.search);
            params.set("clientId", selected.id);
            if (section) params.set("section", section);
            else params.delete("section");
            window.history.replaceState({}, "", `/master-clientes?${params.toString()}`);
          }}
        >
          <aside className="lg:sticky lg:top-[73px] lg:max-h-[calc(100vh-89px)] lg:overflow-y-auto">
                    {selected ? (
                      <Card className="border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white">
                                <Building2 className="h-5 w-5" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-lg font-semibold">{selected.trade_name || selected.legal_name}</p>
                                <p className="text-xs text-slate-500">{selected.organization_id ? "Organização vinculada" : "Ainda sem organização"}</p>
                              </div>
                            </div>

                          </div>
                          <div className="mt-4">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_TONE[selected.status]}`}>
                              {STATUS_LABELS[selected.status]}
                            </span>
                          </div>
                        </div>
          
                        <div className="space-y-5 p-5">
                          <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold">Dados comerciais</h2>
                            <Button variant="ghost" size="sm" onClick={() => setEditing((value) => !value)}>
                              <Pencil className="h-3.5 w-3.5" /> {editing ? "Cancelar" : "Editar"}
                            </Button>
                          </div>
          
                          {editing ? (
                            <ClientForm draft={draft} setDraft={setDraft} onSubmit={handleUpdate} saving={saving} compact />
                          ) : (
                            <div className="space-y-3 text-sm">
                              <Detail label="Razão social" value={selected.legal_name} />
                              <Detail label="Nome comercial" value={selected.trade_name} />
                              <Detail label="CNPJ / CPF" value={selected.tax_id} />
                              <Detail label="Observações" value={selected.notes} />
                            </div>
                          )}
          
                          <div>
                            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Próximos estados</p>
                            <div className="flex flex-wrap gap-2">
                              {ALLOWED_TRANSITIONS[selected.status].map((status) => (
                                <Button key={status} variant="outline" size="sm" disabled={saving} onClick={() => void handleTransition(status)}>
                                  {STATUS_LABELS[status]}
                                </Button>
                              ))}
                              {!ALLOWED_TRANSITIONS[selected.status].length && (
                                <p className="text-xs text-slate-500">Este estado não possui novas transições.</p>
                              )}
                            </div>
                          </div>
          
                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">Instâncias e domínios</p>
                                <p className="mt-1 text-xs text-slate-500">Cadastre o endereço que será usado pelo sistema do cliente.</p>
                              </div>
                            </div>
          
                            {selected.organization_id && <Button className="mt-4 w-full" variant="outline" onClick={() => setShowInstanceCreate(true)}><Plus className="h-4 w-4" /> Adicionar sistema</Button>}
          
                            {!selected.organization_id ? (
                              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                                Este cliente ainda não está vinculado a uma organização. Vincule a organização antes de cadastrar um domínio.
                              </div>
                            ) : instances.length === 0 ? (
                              <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500">
                                Nenhuma instância foi provisionada para este cliente ainda.
                              </div>
                            ) : (
                              <>
                                <div className="mt-4 space-y-3">
                                  {instances.map((instance) => (
                                    <div key={instance.id} className="rounded-lg border border-slate-200 p-3">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium">{instance.name}</p>
                                          <p className="truncate text-xs text-slate-500">{instance.slug} · {instance.status}</p>
                                        </div>
                                        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-600">
                                          {instance.system_type}
                                        </span>
                                      </div>
                                      <div className="mt-3 space-y-2">
                                        {(domains[instance.id] ?? []).map((domain) => (
                                          <div key={domain.id} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                                            <div className="min-w-0">
                                              <p className="truncate text-xs font-medium text-slate-800">{domain.domain}</p>
                                              <p className="text-[10px] text-slate-500">{domain.is_primary ? "Principal · " : ""}{domain.status}</p>
                                            </div>
                                          </div>
                                        ))}
                                        {!domains[instance.id]?.length && (
                                          <p className="text-[11px] text-slate-500">Nenhum domínio cadastrado.</p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
          
                                <div className="mt-4 border-t border-slate-100 pt-4">
                                  <p className="text-xs font-semibold text-slate-700">Adicionar domínio</p>
                                  <div className="mt-2 space-y-2">
                                    <select
                                      value={domainInstanceId}
                                      onChange={(event) => setDomainInstanceId(event.target.value)}
                                      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
                                    >
                                      {instances.map((instance) => (
                                        <option key={instance.id} value={instance.id}>{instance.name}</option>
                                      ))}
                                    </select>
                                    <input
                                      value={domainDraft}
                                      onChange={(event) => setDomainDraft(event.target.value)}
                                      onKeyDown={(event) => { if (event.key === "Enter") void handleAddDomain(); }}
                                      placeholder="Ex.: cliente.neroxa.ia.br"
                                      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
                                    />
                                    <Button className="w-full" onClick={() => void handleAddDomain()} disabled={savingDomain}>
                                      {savingDomain ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                      {savingDomain ? "Cadastrando..." : "Cadastrar domínio"}
                                    </Button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
          
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center gap-2">
                              <UserRound className="h-4 w-4 text-slate-500" />
                              <p className="text-sm font-semibold">Contato principal</p>
                            </div>
                            {contacts[0] ? (
                              <div className="mt-3 space-y-1 text-sm">
                                <p className="font-medium">{contacts[0].name}</p>
                                {contacts[0].role_title && <p className="text-xs text-slate-500">{contacts[0].role_title}</p>}
                                {contacts[0].email && <p className="flex items-center gap-2 text-xs text-slate-600"><Mail className="h-3.5 w-3.5" />{contacts[0].email}</p>}
                                {contacts[0].whatsapp && <p className="text-xs text-slate-600">WhatsApp: {contacts[0].whatsapp}</p>}
                              </div>
                            ) : (
                              <p className="mt-3 text-xs text-slate-500">Nenhum contato cadastrado ainda.</p>
                            )}
                          </div>
                        </div>
                      </Card>
                    ) : (
                      <Card className="border-dashed border-slate-300 bg-white p-8 text-center">
                        <Building2 className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-3 text-sm font-medium">Selecione um cliente</p>
                      </Card>
                    )}
                  
          </aside>
        </Client360Shell>
      </div>

      {showInstanceCreate && selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-lg overflow-auto border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div><p className="text-xs font-medium uppercase tracking-wider text-slate-500">Neroxa Master</p><h2 className="mt-1 text-lg font-semibold">Adicionar sistema ao cliente</h2></div>
              <Button variant="ghost" size="icon" onClick={() => setShowInstanceCreate(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-4 p-5">
              <Field label="Sistema"><select value={instanceDraft.systemId} onChange={(event) => { const system = systems.find((row) => row.id === event.target.value); setInstanceDraft((current) => ({ ...current, systemId: event.target.value, name: system ? `${selected.trade_name || selected.legal_name} · ${system.name}` : current.name, slug: system ? `${(selected.trade_name || selected.legal_name || "cliente").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${system.slug}` : current.slug })); }} className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm"><option value="">Selecione o sistema</option>{systems.filter((system) => system.active).map((system) => <option key={system.id} value={system.id}>{system.name} · {system.version}</option>)}</select></Field>
              <Field label="Plano"><select value={instanceDraft.planId} onChange={(event) => setInstanceDraft((current) => ({ ...current, planId: event.target.value, subscriptionId: "" }))} className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm"><option value="">Selecione o plano</option>{plans.filter((plan) => plan.active).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></Field>
              <Field label="Assinatura (opcional)"><select value={instanceDraft.subscriptionId} onChange={(event) => setInstanceDraft((current) => ({ ...current, subscriptionId: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm"><option value="">Vincular depois</option>{clientSubscriptions.filter((subscription) => subscription.plan_id === instanceDraft.planId).map((subscription) => <option key={subscription.id} value={subscription.id}>{subscription.status} · {subscription.id.slice(0, 8)}</option>)}</select><p className="mt-1 text-[11px] text-slate-500">Não cria nem altera a assinatura.</p></Field>
              <Field label="Nome da instância"><input value={instanceDraft.name} onChange={(event) => setInstanceDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Pizzaria Aurora · Pizza Perfect Plate" /></Field>
              <Field label="Slug"><input value={instanceDraft.slug} onChange={(event) => setInstanceDraft((current) => ({ ...current, slug: event.target.value }))} placeholder="pizzaria-aurora-pizza-perfect-plate" /></Field>
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">A instância será criada como <strong>PROVISIONING</strong>. Nenhum projeto Vercel ou domínio será criado automaticamente.</div>
              <Button className="w-full" onClick={() => void handleCreateInstance()} disabled={savingInstance}>{savingInstance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{savingInstance ? "Criando..." : "Criar instância"}</Button>
            </div>
          </Card>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-lg overflow-auto border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Neroxa Master</p>
                <h2 className="mt-1 text-lg font-semibold">Novo cliente</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowCreate(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-5">
              <ClientForm draft={draft} setDraft={setDraft} onSubmit={handleCreate} saving={saving} />
            </div>
          </Card>
        </div>
      )}
      </main>
    </MasterShell>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 break-words font-medium text-slate-800">{value || "—"}</p>
    </div>
  );
}

function ClientForm({
  draft,
  setDraft,
  onSubmit,
  saving,
  compact = false,
}: {
  draft: typeof emptyDraft;
  setDraft: (value: typeof emptyDraft) => void;
  onSubmit: () => void;
  saving: boolean;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <Field label="Nome comercial">
        <input value={draft.tradeName} onChange={(event) => setDraft({ ...draft, tradeName: event.target.value })} placeholder="Ex.: Pizzaria Aurora" />
      </Field>
      <Field label="Razão social">
        <input value={draft.legalName} onChange={(event) => setDraft({ ...draft, legalName: event.target.value })} placeholder="Ex.: Aurora Alimentação LTDA" />
      </Field>
      <Field label="CNPJ / CPF">
        <input value={draft.taxId} onChange={(event) => setDraft({ ...draft, taxId: event.target.value })} placeholder="Documento" />
      </Field>
      <Field label="Observações">
        <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={compact ? 3 : 4} placeholder="Contexto comercial, necessidades ou próximos passos" />
      </Field>
      <Button className="w-full" onClick={onSubmit} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {saving ? "Salvando..." : compact ? "Salvar alterações" : "Criar cliente"}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      <div className="[&_input]:h-10 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-slate-200 [&_input]:bg-slate-50 [&_input]:px-3 [&_input]:text-sm [&_input]:outline-none [&_input]:transition [&_input]:focus:border-slate-400 [&_input]:focus:bg-white [&_textarea]:w-full [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-slate-200 [&_textarea]:bg-slate-50 [&_textarea]:px-3 [&_textarea]:py-2.5 [&_textarea]:text-sm [&_textarea]:outline-none [&_textarea]:transition [&_textarea]:focus:border-slate-400 [&_textarea]:focus:bg-white">
        {children}
      </div>
    </label>
  );
}

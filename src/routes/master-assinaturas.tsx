import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  ExternalLink,
  FileText,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getNeroxaPlatformAccess, isNeroxaStaff } from "@/features/master/clients/services";
import { canPerform } from "@/features/master/permissions";
import { MasterShell } from "@/features/master/shell/MasterShell";
import { MasterLogin } from "@/features/master/shell/MasterLogin";
import {
  COMMERCIAL_MODEL_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  type Subscription,
  type SubscriptionBilling,
  type SubscriptionPlan,
} from "@/features/master/subscriptions/types";
import {
  createSubscription,
  listActivatableSubscriptionContracts,
  loadSubscriptionOverview,
  updateSubscriptionStatus,
  type SubscriptionContractOption,
} from "@/features/master/subscriptions/services";
import { listNeroxaSystems } from "@/features/master/systems/services";
import { listProductPlans, listProducts } from "@/features/master/products/services";

export const Route = createFileRoute("/master-assinaturas")({
  component: MasterSubscriptionsPage,
});

const statusTone: Record<keyof typeof SUBSCRIPTION_STATUS_LABELS, string> = {
  PENDING: "bg-blue-50 text-blue-700",
  ACTIVE: "bg-success/10 text-success",
  PAUSED: "bg-amber-50 text-amber-700",
  DELINQUENT: "bg-red-50 text-red-700",
  CANCELLED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-muted text-muted-foreground",
};

const billingTone: Record<string, string> = {
  PENDING: "bg-blue-50 text-blue-700",
  PAID: "bg-success/10 text-success",
  OVERDUE: "bg-red-50 text-red-700",
  CANCELLED: "bg-muted text-muted-foreground",
  REFUNDED: "bg-violet-50 text-violet-700",
  NEGOTIATION: "bg-amber-50 text-amber-700",
};

const billingLabels: Record<string, string> = {
  PENDING: "Pendente",
  PAID: "Paga",
  OVERDUE: "Vencida",
  CANCELLED: "Cancelada",
  REFUNDED: "Reembolsada",
  NEGOTIATION: "Negociação",
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const raw = String(value).trim();
  if (!raw) return "—";
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + "T12:00:00" : raw);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR").format(parsed);
};

function MasterSubscriptionsPage() {
  const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const contextClientId = params?.get("clientId") ?? null;
  const contextOrganizationId = params?.get("organizationId") ?? null;

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [role, setRole] = useState<import("@/features/master/clients/services").NeroxaPlatformRole | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [billing, setBilling] = useState<SubscriptionBilling[]>([]);
  const [clients, setClients] = useState<{ id: string; legal_name: string | null; trade_name: string | null; status: string }[]>([]);
  const [systems, setSystems] = useState<{ id: string; name: string }[]>([]);
  const [planProducts, setPlanProducts] = useState<Record<string, string[]>>({});
  const [contracts, setContracts] = useState<SubscriptionContractOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(Boolean(contextClientId));
  const [newContractId, setNewContractId] = useState("");
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<"ALL" | keyof typeof SUBSCRIPTION_STATUS_LABELS>("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async (initial = false) => {
    setError(null);
    if (initial) setLoading(true);
    else setRefreshing(true);

    try {
      const staff = await isNeroxaStaff();
      setAuthorized(staff);
      if (!staff) return;

      const access = await getNeroxaPlatformAccess();
      setRole(access?.active ? access.role : null);

      const overview = await loadSubscriptionOverview();
      setPlans(overview.plans);
      setSubscriptions(overview.subscriptions);
      setBilling(overview.billing);
      setClients(overview.clients);
      setLoading(false);

      void (async () => {
        try {
          const [systemData, productData, contractData] = await Promise.all([
            listNeroxaSystems(),
            listProducts(),
            listActivatableSubscriptionContracts(),
          ]);
          setContracts(contractData);
          setSystems(systemData.map((system) => ({ id: system.id, name: system.name })));

          const productLinks = await Promise.all(
            productData.map(async (product) => [product.id, await listProductPlans(product.id)] as const),
          );
          const mapped: Record<string, string[]> = {};
          for (const [productId, links] of productLinks) {
            for (const link of links.filter((item) => item.included)) {
              const plan = overview.plans.find((item) => item.id === link.plan_id);
              const product = productData.find((item) => item.id === productId);
              if (plan && product) mapped[plan.id] = [...(mapped[plan.id] ?? []), product.name];
            }
          }
          setPlanProducts(mapped);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Parte do catálogo não pôde ser carregada.");
        }
      })();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as assinaturas.");
      setLoading(false);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(true);
  }, []);

  const handleStatus = async (id: string, status: "ACTIVE" | "PAUSED" | "CANCELLED") => {
    setSaving(id);
    setError(null);
    try {
      await updateSubscriptionStatus(id, status);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar a assinatura.");
    } finally {
      setSaving(null);
    }
  };

  const scopedSubscriptions = contextOrganizationId
    ? subscriptions.filter((item) => item.client_id === contextOrganizationId)
    : contextClientId
      ? subscriptions.filter((item) => item.client_id === contextClientId)
      : subscriptions;

  const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const planMap = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);

  const visibleSubscriptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return scopedSubscriptions.filter((subscription) => {
      if (filter !== "ALL" && subscription.status !== filter) return false;
      if (!normalizedQuery) return true;
      const client = clientMap.get(subscription.client_id);
      const plan = planMap.get(subscription.plan_id);
      return [client?.trade_name, client?.legal_name, plan?.name, subscription.id]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(normalizedQuery));
    });
  }, [clientMap, filter, planMap, query, scopedSubscriptions]);

  const metrics = useMemo(
    () => ({
      total: scopedSubscriptions.length,
      active: scopedSubscriptions.filter((item) => item.status === "ACTIVE").length,
      delinquent: scopedSubscriptions.filter((item) => item.status === "DELINQUENT").length,
      recurring: scopedSubscriptions
        .filter((item) => ["ACTIVE", "PAUSED", "DELINQUENT"].includes(item.status))
        .reduce((sum, item) => sum + item.contracted_recurring_value, 0),
    }),
    [scopedSubscriptions],
  );

  const selectedContractOption = contracts.find((contract) => contract.id === newContractId) ?? null;
  const selectedClient = selectedContractOption
    ? clients.find((client) => client.id === selectedContractOption.client_id) ?? null
    : null;
  const selectedPlan = selectedContractOption?.plan_id
    ? plans.find((plan) => plan.id === selectedContractOption.plan_id) ?? null
    : null;
  const selectedPlanProducts = selectedContractOption?.plan_id
    ? planProducts[selectedContractOption.plan_id] ?? []
    : [];

  const createContractOptions = contracts.filter((contract) => {
    if (contextClientId && contract.client_id !== contextClientId) return false;
    const client = clients.find((item) => item.id === contract.client_id);
    return Boolean(client && !["LEAD", "PROPOSAL", "NEGOTIATION", "CANCELLED"].includes(client.status));
  });

  const handleCreateSubscription = async () => {
    if (!newContractId) {
      setError("Selecione o contrato.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const subscriptionId = await createSubscription({ contractId: newContractId });
      setCreateOpen(false);
      setNewContractId("");
      setSelectedId(String(subscriptionId));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ativar o contrato e criar a assinatura.");
    } finally {
      setCreating(false);
    }
  };

  if (authorized === false) return <MasterLogin />;
  if (authorized === null || loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">
        <Loader2 className="h-7 w-7 animate-spin" />
      </main>
    );
  }

  return (
    <MasterShell>
      <div className="mx-auto min-w-0 max-w-[1500px] space-y-5 overflow-x-hidden px-3 py-4 sm:px-6 sm:py-5">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground/70">Gestão · Assinaturas</p>
            <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight tracking-tight text-foreground sm:text-[32px]">
              Assinaturas
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Centro operacional da recorrência: contratação, situação, período e cobranças vinculadas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { setCreateOpen(true); setError(null); }} disabled={!canPerform(role, "manageSubscriptions")}>
              <Plus className="h-4 w-4" /> Nova assinatura
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={refreshing}>
              <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Atualizar
            </Button>
          </div>
        </section>

        {error && (
          <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={CreditCard} label="Assinaturas" value={String(metrics.total)} hint="Total no contexto atual" />
          <Metric icon={CheckCircle2} label="Ativas" value={String(metrics.active)} hint="Recorrência em operação" />
          <Metric icon={CircleDollarSign} label="Recorrência" value={formatCurrency(metrics.recurring)} hint="Base ativa, pausada ou inadimplente" />
          <Metric icon={AlertTriangle} label="Inadimplentes" value={String(metrics.delinquent)} hint="Exigem regularização" />
        </div>

        <Card className="border-border bg-card p-4 shadow-soft">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-input px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="Buscar por cliente, plano ou ID"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && <Button variant="ghost" size="icon" onClick={() => setQuery("")} aria-label="Limpar busca"><X className="h-4 w-4" /></Button>}
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {(["ALL", "PENDING", "ACTIVE", "DELINQUENT", "PAUSED", "CANCELLED", "EXPIRED"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => { setFilter(item); setSelectedId(null); }}
                  className={"whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition " + (
                    filter === item ? "bg-sidebar text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {item === "ALL" ? "Todas" : SUBSCRIPTION_STATUS_LABELS[item]}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <div>

            </div>

            <div className="mt-4 divide-y divide-border">
              {visibleSubscriptions.map((subscription) => {
                const client = clientMap.get(subscription.client_id);
                const plan = planMap.get(subscription.plan_id);
                const active = selectedId === subscription.id;
                const lastBilling = billing.find((item) => item.subscription_id === subscription.id);

                const rowBilling = billing.filter((item) => item.subscription_id === subscription.id);
                const rowContract = subscription.contract_id
                  ? contracts.find((item) => item.id === subscription.contract_id) ?? null
                  : null;

                return (
                  <div key={subscription.id} className={active ? "rounded-xl bg-muted/40" : ""}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(active ? null : subscription.id)}
                      aria-expanded={active}
                      className={"flex w-full flex-col gap-3 py-4 text-left transition sm:flex-row sm:items-center " + (active ? "px-3" : "hover:bg-muted/30")}
                    >
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{client?.trade_name || client?.legal_name || "Cliente não identificado"}</p>
                        <p className="truncate text-xs text-muted-foreground">{plan?.name || "Plano não identificado"} · {subscription.billing_interval === "YEARLY" ? "Anual" : "Mensal"}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                        <div className="text-right">
                          <p className="text-sm font-semibold">{formatCurrency(subscription.contracted_recurring_value)}</p>
                          <p className="text-[11px] text-muted-foreground/70">próx. {formatDate(subscription.next_billing_date)}</p>
                        </div>
                        <span className={"rounded-full px-2.5 py-1 text-[10px] font-medium " + statusTone[subscription.status]}>
                          {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                        </span>
                        {lastBilling && <span className={"rounded-full px-2 py-1 text-[10px] " + (billingTone[lastBilling.status] ?? "bg-muted text-muted-foreground")}>{billingLabels[lastBilling.status] ?? lastBilling.status}</span>}
                      </div>
                    </button>

                    {active && (
                      <div className="border-t border-border/70 px-3 pb-4 pt-4">
                        <SubscriptionDetail
                          subscription={subscription}
                          client={client}
                          plan={plan}
                          contract={rowContract}
                          billing={rowBilling}
                          role={role}
                          saving={saving}
                          canManage={canPerform(role, "manageSubscriptions")}
                          onStatus={handleStatus}
                          systemName={plan?.system_id ? systems.find((system) => system.id === plan.system_id)?.name : undefined}
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {visibleSubscriptions.length === 0 && (
                <div className="py-12 text-center">
                  <CreditCard className="mx-auto h-8 w-8 text-muted-foreground/40" />
                  <p className="mt-3 text-sm font-medium">Nenhuma assinatura encontrada</p>
                  <p className="mt-1 text-xs text-muted-foreground">Ajuste os filtros ou conclua uma nova contratação.</p>
                </div>
              )}
            </div>
          </Card>

          <Card className="min-w-0 border-border bg-card p-5 shadow-soft">
            {!selectedSubscription ? (
              <div className="grid min-h-[420px] place-items-center text-center">
                <div>
                  <Activity className="mx-auto h-8 w-8 text-muted-foreground/40" />
                  <p className="mt-3 text-sm font-medium">Selecione uma assinatura</p>
                  <p className="mt-1 text-xs text-muted-foreground">O detalhe operacional aparecerá aqui.</p>
                </div>
              </div>
            ) : (
              <SubscriptionDetail
                subscription={selectedSubscription}
                client={clientMap.get(selectedSubscription.client_id)}
                plan={planMap.get(selectedSubscription.plan_id)}
                contract={selectedContract}
                billing={selectedBilling}
                role={role}
                saving={saving}
                canManage={canPerform(role, "manageSubscriptions")}
                onStatus={handleStatus}
                systemName={selectedSubscription ? systems.find((system) => system.id === planMap.get(selectedSubscription.plan_id)?.system_id)?.name : undefined}
              />
            )}
          </Card>
        </div>

        <Card className="border-border bg-card p-5 shadow-soft">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar text-white"><FileText className="h-4 w-4" /></div>
            <div>
              <h2 className="text-base font-semibold">Catálogo de planos</h2>
              <p className="text-xs text-muted-foreground">Referência comercial; o valor da assinatura permanece congelado no contrato.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{plan.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {plan.system_id ? systems.find((system) => system.id === plan.system_id)?.name ?? "Segmento" : "Plano global"} · {COMMERCIAL_MODEL_LABELS[plan.commercial_model]}
                    </p>
                  </div>
                  <span className={"rounded-full px-2 py-1 text-[10px] " + (plan.active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
                    {plan.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <p className="mt-4 text-lg font-semibold">{formatCurrency(plan.base_price)}</p>
                <p className="text-[11px] text-muted-foreground">{plan.billing_interval === "YEARLY" ? "por ano" : plan.billing_interval === "MONTHLY" ? "por mês" : "cobrança avulsa"}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(planProducts[plan.id] ?? []).map((product) => (
                    <span key={product} className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">{product}</span>
                  ))}
                </div>
              </div>
            ))}
            {plans.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Nenhum plano cadastrado.</p>}
          </div>
        </Card>

        {createOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
            <Card className="max-h-[90vh] w-full max-w-xl overflow-y-auto border-border bg-card p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground/70">Nova contratação</p>
                  <h2 className="mt-1 text-xl font-semibold text-foreground">Contrato de assinatura</h2>
                  <p className="mt-1 text-sm text-muted-foreground">A assinatura nasce da ativação de um contrato em rascunho vinculado a uma proposta aceita.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)} disabled={creating}>Fechar</Button>
              </div>
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-xs font-medium text-foreground/80">Contrato</span>
                  <select className="mt-1.5 h-10 w-full rounded-md border border-input bg-card px-3 text-sm" value={newContractId} onChange={(event) => setNewContractId(event.target.value)} disabled={creating}>
                    <option value="">Selecione o contrato</option>
                    {createContractOptions.map((contract) => {
                      const client = clients.find((item) => item.id === contract.client_id);
                      const plan = plans.find((item) => item.id === contract.plan_id);
                      return <option key={contract.id} value={contract.id}>{contract.contract_number || contract.title} · {client?.trade_name || client?.legal_name || "Cliente"} · {plan?.name || "Plano"}</option>;
                    })}
                  </select>
                </label>
                {selectedContractOption && selectedClient && selectedPlan && (
                  <Card className="border-border bg-muted/50 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">Cliente</p><p className="mt-1 text-sm font-semibold">{selectedClient.trade_name || selectedClient.legal_name}</p><p className="text-xs text-muted-foreground">{selectedContractOption.contract_number || selectedContractOption.title}</p></div>
                      <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">Plano</p><p className="mt-1 text-sm font-semibold">{selectedPlan.name}</p><p className="text-xs text-muted-foreground">{selectedPlan.billing_interval === "YEARLY" ? "Anual" : "Mensal"}</p></div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg bg-card p-3 ring-1 ring-border"><p className="text-[11px] text-muted-foreground/70">Valor recorrente</p><p className="mt-1 text-base font-semibold">{formatCurrency(selectedContractOption.recurring_value ?? selectedPlan.base_price)}</p></div>
                      <div className="rounded-lg bg-card p-3 ring-1 ring-border"><p className="text-[11px] text-muted-foreground/70">Implantação</p><p className="mt-1 text-base font-semibold">{formatCurrency(selectedPlan.setup_price)}</p></div>
                    </div>
                    <div className="mt-4 border-t border-border pt-3"><p className="text-xs font-medium">Produtos incluídos</p><div className="mt-2 flex flex-wrap gap-1.5">{selectedPlanProducts.length ? selectedPlanProducts.map((product) => <span key={product} className="rounded-full bg-card px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-border">{product}</span>) : <span className="text-xs text-muted-foreground">Nenhum produto vinculado.</span>}</div></div>
                  </Card>
                )}
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancelar</Button>
                <Button onClick={() => void handleCreateSubscription()} disabled={creating || !newContractId}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Ativar contrato e criar assinatura
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </MasterShell>
  );
}

function SubscriptionDetail({
  subscription,
  client,
  plan,
  contract,
  billing,
  role,
  saving,
  canManage,
  onStatus,
  systemName,
}: {
  subscription: Subscription;
  client?: { id: string; legal_name: string | null; trade_name: string | null; status: string };
  plan?: SubscriptionPlan;
  contract: SubscriptionContractOption | null;
  billing: SubscriptionBilling[];
  role: import("@/features/master/clients/services").NeroxaPlatformRole | null;
  saving: string | null;
  canManage: boolean;
  onStatus: (id: string, status: "ACTIVE" | "PAUSED" | "CANCELLED") => Promise<void>;
  systemName?: string;
}) {
  const lastBilling = billing[0];
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground/70">Detalhe da assinatura</p>
          <h2 className="mt-1 truncate text-lg font-semibold">{client?.trade_name || client?.legal_name || "Cliente não identificado"}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{plan?.name || "Plano não identificado"} · {systemName || "Plano global"}</p>
        </div>
        <span className={"shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium " + statusTone[subscription.status]}>{SUBSCRIPTION_STATUS_LABELS[subscription.status]}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Info label="Valor recorrente" value={formatCurrency(subscription.contracted_recurring_value)} />
        <Info label="Periodicidade" value={subscription.billing_interval === "YEARLY" ? "Anual" : "Mensal"} />
        <Info label="Início" value={formatDate(subscription.started_at)} />
        <Info label="Próximo vencimento/período" value={formatDate(subscription.next_billing_date)} />
        <Info label="Gateway" value={subscription.gateway_provider || "Não configurado"} />
        <Info label="Gateway status" value={subscription.gateway_status || "Não configurado"} />
      </div>

      {contract && (
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /><p className="text-xs font-medium">Contrato vinculado</p></div>
          <p className="mt-2 text-sm font-semibold">{contract.contract_number || contract.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">Status: {contract.status} · valor contratado: {formatCurrency(contract.recurring_value ?? subscription.contracted_recurring_value)}</p>
          <a className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" href={"/master-contratos?contractId=" + contract.id}>
            Abrir contratos <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {lastBilling && (
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-medium">Última cobrança</p><p className="mt-1 text-[11px] text-muted-foreground">Vencimento {formatDate(lastBilling.due_date)}</p></div>
            <span className={"rounded-full px-2.5 py-1 text-[10px] " + (billingTone[lastBilling.status] ?? "bg-muted text-muted-foreground")}>{billingLabels[lastBilling.status] ?? lastBilling.status}</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Info label="Valor" value={formatCurrency(lastBilling.amount)} />
            <Info label="Pagamento" value={lastBilling.paid_at ? formatDate(lastBilling.paid_at) : "Ainda não pago"} />
            <Info label="Gateway" value={lastBilling.gateway_status || "Não configurado"} />
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-xs font-medium">Histórico de cobranças</p><p className="mt-1 text-[11px] text-muted-foreground">{billing.length} registro(s)</p></div>
          {billing.length > 0 && <a className="text-xs font-medium text-primary hover:underline" href={"/master-financeiro?organizationId=" + subscription.client_id}>Ver financeiro <ExternalLink className="inline h-3 w-3" /></a>}
        </div>
        <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
          {billing.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0"><p className="text-xs font-medium">{formatDate(item.due_date)}</p><p className="text-[11px] text-muted-foreground">{item.payment_method || "Método não definido"}</p></div>
              <div className="text-right"><p className="text-xs font-semibold">{formatCurrency(item.amount)}</p><span className={"rounded-full px-2 py-0.5 text-[9px] " + (billingTone[item.status] ?? "bg-muted text-muted-foreground")}>{billingLabels[item.status] ?? item.status}</span></div>
            </div>
          ))}
          {billing.length === 0 && <p className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">Nenhuma cobrança vinculada.</p>}
        </div>
      </div>

      {canManage && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {subscription.status === "ACTIVE" && (
            <Button variant="outline" size="sm" disabled={saving === subscription.id} onClick={() => void onStatus(subscription.id, "PAUSED")}>
              <Pause className="h-3.5 w-3.5" /> Pausar
            </Button>
          )}
          {subscription.status === "PAUSED" && (
            <Button variant="outline" size="sm" disabled={saving === subscription.id} onClick={() => void onStatus(subscription.id, "ACTIVE")}>
              <Play className="h-3.5 w-3.5" /> Reativar
            </Button>
          )}
          {["ACTIVE", "PAUSED", "DELINQUENT", "PENDING"].includes(subscription.status) && (
            <Button variant="outline" size="sm" disabled={saving === subscription.id} onClick={() => { if (window.confirm("Cancelar esta assinatura? Essa ação encerra a recorrência.")) void onStatus(subscription.id, "CANCELLED"); }}>
              Cancelar assinatura
            </Button>
          )}
          {subscription.status === "ACTIVE" && (
            <Button variant="ghost" size="sm" onClick={() => { window.location.href = "/master-implantacao?subscriptionId=" + subscription.id + "&organizationId=" + subscription.client_id; }}>
              <Activity className="h-3.5 w-3.5" /> Implantação
            </Button>
          )}
          {role === "FINANCE" && subscription.status === "PENDING" && (
            <Button variant="ghost" size="sm" onClick={() => { window.location.href = "/master-financeiro?organizationId=" + subscription.client_id; }}>
              <CircleDollarSign className="h-3.5 w-3.5" /> Ir para financeiro
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        A autorização continua sendo validada no Master e no banco; esta tela não cria exceções para regras de cobrança.
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value}</p>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof CreditCard;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="border-border bg-card p-4 shadow-soft">
      <Icon className="h-4 w-4 text-muted-foreground/70" />
      <p className="mt-3 text-xs font-medium tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

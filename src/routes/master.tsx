import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, Building2, CheckCircle2, FileText, ShieldCheck, Users, WalletCards } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MasterShell } from "@/features/master/shell/MasterShell";
import { MasterLogin } from "@/features/master/shell/MasterLogin";
import { isNeroxaStaff } from "@/features/master/clients/services";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/master")({
  component: MasterOverviewPage,
});

type OverviewData = {
  clients: number;
  mrr: number;
  activeContracts: number;
  implementations: number;
  openProposals: number;
  activeSubscriptions: number;
  openInvoices: number;
};

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

type MasterRoute = "/master-comercial" | "/master-assinaturas" | "/master-financeiro" | "/master-implantacao";
type Priority = { tone: "warn" | "info"; title: string; hint: string; to: MasterRoute };

function buildPriorities(d: OverviewData): Priority[] {
  const list: Priority[] = [];
  if (d.openInvoices > 0) {
    list.push({ tone: "warn", title: `${d.openInvoices} cobrança(s) em aberto`, hint: "Pendentes ou vencidas", to: "/master-financeiro" });
  }
  if (d.openProposals > 0) {
    list.push({ tone: "info", title: `${d.openProposals} proposta(s) em andamento`, hint: "Rascunho, enviadas ou em negociação", to: "/master-comercial" });
  }
  if (d.clients > 0 && d.activeContracts === 0) {
    list.push({ tone: "info", title: "Nenhum contrato ativo", hint: "Formalize o relacionamento com os clientes", to: "/master-comercial" });
  }
  return list;
}

function MasterOverviewPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadOverview = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (!session) {
          setAuthorized(false);
          return;
        }

        const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalError) throw aalError;
        if (!active) return;

        if (aal.currentLevel !== "aal2" && aal.nextLevel === "aal2") {
          setAuthorized(false);
          return;
        }

        const staff = await isNeroxaStaff();
        if (!active) return;

        if (!staff) {
          setAuthorized(false);
          return;
        }

        setAuthorized(true);

        const [
          clientsResult,
          subscriptionsResult,
          contractsResult,
          proposalsResult,
          billingResult,
          implementationsResult,
        ] = await Promise.all([
          supabase.from("neroxa_clients" as never).select("id", { count: "exact", head: true }),
          supabase
            .from("neroxa_subscriptions" as never)
            .select("price")
            .eq("status", "ACTIVE"),
          supabase
            .from("neroxa_contracts" as never)
            .select("id", { count: "exact", head: true })
            .eq("status", "ACTIVE"),
          supabase
            .from("neroxa_proposals" as never)
            .select("id", { count: "exact", head: true })
            .in("status", ["DRAFT", "SENT", "NEGOTIATION"]),
          supabase
            .from("neroxa_billing_records" as never)
            .select("id", { count: "exact", head: true })
            .in("status", ["PENDING", "OVERDUE"]),
          supabase
            .from("neroxa_system_instances" as never)
            .select("id", { count: "exact", head: true }),
        ]);

        const results = [
          clientsResult,
          subscriptionsResult,
          contractsResult,
          proposalsResult,
          billingResult,
          implementationsResult,
        ];

        const failed = results.find((result) => result.error);
        if (failed?.error) throw new Error(failed.error.message);

        if (!active) return;

        const subscriptions = (subscriptionsResult.data ?? []) as unknown as Array<{ price?: number | null }>;

        setData({
          clients: clientsResult.count ?? 0,
          mrr: subscriptions.reduce((total, item) => total + Number(item.price ?? 0), 0),
          activeContracts: contractsResult.count ?? 0,
          implementations: implementationsResult.count ?? 0,
          openProposals: proposalsResult.count ?? 0,
          activeSubscriptions: subscriptions.length,
          openInvoices: billingResult.count ?? 0,
        });
        setError(null);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Não foi possível carregar a visão geral.");
      }
    };

    void loadOverview();

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        window.setTimeout(() => {
          if (active) void loadOverview();
        }, 0);
      }

      if (event === "SIGNED_OUT" && active) {
        setAuthorized(false);
        setData(null);
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  if (authorized === false) return <MasterLogin />;
  if (authorized === null) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </main>
    );
  }

  const priorities = data ? buildPriorities(data) : [];
  const steps: Array<{ label: string; value: string; hint: string; to: MasterRoute; icon: typeof FileText }> = [
    { label: "Comercial", value: String(data?.openProposals ?? 0), hint: "propostas em aberto", to: "/master-comercial", icon: FileText },
    { label: "Assinaturas", value: String(data?.activeSubscriptions ?? 0), hint: `ativas, ${money(data?.mrr ?? 0)} de MRR`, to: "/master-assinaturas", icon: Activity },
    { label: "Implantação", value: String(data?.implementations ?? 0), hint: "instâncias cadastradas", to: "/master-implantacao", icon: Building2 },
    { label: "Financeiro", value: String(data?.openInvoices ?? 0), hint: "cobranças em aberto", to: "/master-financeiro", icon: WalletCards },
  ];

  return (
    <MasterShell>
      <div className="mx-auto min-w-0 max-w-[1400px] space-y-5 overflow-x-hidden px-3 py-4 sm:space-y-6 sm:px-8 sm:py-8">
        <section>
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">Visão geral</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            Panorama da empresa: receita recorrente, base de clientes e o andamento de cada etapa, da proposta à cobrança.
          </p>
        </section>

        {error && (
          <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Não foi possível atualizar alguns indicadores: {error}
          </Card>
        )}

        <Card className="grid grid-cols-2 overflow-hidden border-border bg-card shadow-soft lg:grid-cols-4">
          <Metric icon={Activity} label="Receita recorrente (MRR)" value={money(data?.mrr ?? 0)} hint="Assinaturas ativas" />
          <Metric icon={Users} label="Clientes" value={String(data?.clients ?? 0)} hint="Base cadastrada" />
          <Metric icon={FileText} label="Contratos ativos" value={String(data?.activeContracts ?? 0)} hint="Relacionamentos vigentes" />
          <Metric icon={Building2} label="Implantações" value={String(data?.implementations ?? 0)} hint="Instâncias cadastradas" />
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card className="border-border bg-card p-5 shadow-soft sm:p-6">
            <h2 className="text-lg font-semibold">Andamento por etapa</h2>
            <p className="mt-1 text-sm text-muted-foreground">Da proposta à cobrança. Toque em uma etapa para abrir o módulo.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {steps.map((step, index) => (
                <Link
                  key={step.label}
                  to={step.to}
                  className="group rounded-xl border border-border bg-background p-4 transition hover:border-primary/40 hover:bg-card hover:shadow-soft"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
                        {index + 1}
                      </span>
                      {step.label}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <p className="mt-3 font-display text-3xl font-semibold tabular-nums">{step.value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{step.hint}</p>
                </Link>
              ))}
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="border-border bg-card p-5 shadow-soft">
              <h2 className="text-lg font-semibold">Prioridades</h2>
              {priorities.length === 0 ? (
                <div className="mt-4 flex items-start gap-3 rounded-lg bg-success/10 p-3 text-sm text-success">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Tudo em dia. Nenhuma pendência no momento.</span>
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {priorities.map((item) => (
                    <li key={item.title}>
                      <Link to={item.to} className="flex items-start gap-3 py-3 transition hover:opacity-80">
                        <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md ${item.tone === "warn" ? "bg-warning/20 text-warning-foreground" : "bg-primary/10 text-primary"}`}>
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{item.title}</span>
                          <span className="block text-xs text-muted-foreground">{item.hint}</span>
                        </span>
                        <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground/40" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="border-sidebar-border bg-sidebar p-5 text-sidebar-foreground shadow-soft">
              <div className="flex items-center gap-2 text-sidebar-primary">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs font-medium tracking-wide">Acesso protegido</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-sidebar-foreground/80">
                A visão geral só exibe dados liberados para a equipe autorizada e não altera nenhum registro.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </MasterShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="border-b border-r border-border p-5 last:border-r-0 lg:border-b-0 [&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className="mt-3 font-display text-[26px] font-semibold leading-none tabular-nums tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

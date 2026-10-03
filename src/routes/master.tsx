import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, ArrowRight, Building2, FileText, ShieldCheck, Users, WalletCards } from "lucide-react";
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

  return (
    <MasterShell>
      <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6">
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Visão geral</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Neroxa Master</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Resumo operacional da plataforma, com os principais indicadores comerciais, financeiros e de implantação.
          </p>
        </section>

        {error && (
          <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Não foi possível atualizar alguns indicadores: {error}
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={Users} label="Clientes" value={String(data?.clients ?? 0)} hint="Base cadastrada" />
          <Metric icon={Activity} label="MRR" value={money(data?.mrr ?? 0)} hint="Assinaturas ativas" />
          <Metric icon={FileText} label="Contratos ativos" value={String(data?.activeContracts ?? 0)} hint="Relacionamentos vigentes" />
          <Metric icon={Building2} label="Implantações" value={String(data?.implementations ?? 0)} hint="Instâncias cadastradas" />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric icon={ArrowRight} label="Propostas em aberto" value={String(data?.openProposals ?? 0)} hint="Rascunho, enviadas ou negociação" compact />
          <Metric icon={ShieldCheck} label="Assinaturas ativas" value={String(data?.activeSubscriptions ?? 0)} hint="Recorrência vigente" compact />
          <Metric icon={WalletCards} label="Financeiro em aberto" value={String(data?.openInvoices ?? 0)} hint="Pendências e vencidas" compact />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card className="border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Status operacional</h2>
                <p className="mt-1 text-xs text-slate-500">Indicadores puxados diretamente do banco da plataforma.</p>
              </div>
            </div>
            <div className="mt-5 divide-y divide-slate-100">
              {[
                ["Comercial", `${data?.openProposals ?? 0} propostas em aberto`],
                ["Assinaturas", `${data?.activeSubscriptions ?? 0} ativas · ${money(data?.mrr ?? 0)} MRR`],
                ["Financeiro", `${data?.openInvoices ?? 0} cobranças em aberto`],
                ["Implantação", `${data?.implementations ?? 0} instâncias cadastradas`],
              ].map(([title, description]) => {
                const route = {
                  Comercial: "/master-comercial",
                  Assinaturas: "/master-assinaturas",
                  Financeiro: "/master-financeiro",
                  Implantação: "/master-implantacao",
                }[title];
                return (
                <Link key={title} to={route} className="flex items-center gap-3 py-3.5 transition hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:text-slate-500" />
                </Link>
                );
              })}
            </div>
          </Card>

          <Card className="border-slate-200 bg-[#102a2e] p-5 text-slate-100 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Segurança</p>
            <h2 className="mt-2 text-lg font-semibold">Acesso por permissão.</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              A visão geral usa somente dados disponíveis para a equipe autorizada e não altera nenhum registro.
            </p>
          </Card>
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
  compact = false,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
  compact?: boolean;
}) {
  return (
    <Card className="border-slate-200 bg-white p-4 shadow-sm">
      <Icon className="h-4 w-4 text-slate-400" />
      <p className="mt-3 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 font-semibold ${compact ? "text-lg" : "text-xl"}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}

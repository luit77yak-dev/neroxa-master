import { useState, type ReactNode } from "react";
import { ArrowLeft, Building2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type TabKey =
  | "overview"
  | "commercial"
  | "subscriptions"
  | "systems"
  | "domains"
  | "implementation"
  | "finance"
  | "support"
  | "contacts"
  | "audit";

const TABS: Array<{ key: TabKey; label: string; description: string }> = [
  { key: "overview", label: "Visão geral", description: "Resumo operacional do cliente." },
  { key: "commercial", label: "Comercial", description: "Propostas e contratos." },
  { key: "subscriptions", label: "Assinaturas", description: "Planos, ciclos e status." },
  { key: "systems", label: "Sistemas", description: "Sistemas e instâncias contratadas." },
  { key: "domains", label: "Domínios", description: "Domínios e publicação." },
  { key: "implementation", label: "Implantação", description: "Acompanhamento da implantação." },
  { key: "finance", label: "Financeiro", description: "Cobranças e situação financeira." },
  { key: "support", label: "Suporte", description: "Atendimentos e chamados." },
  { key: "contacts", label: "Contatos", description: "Pessoas e responsáveis." },
  { key: "audit", label: "Auditoria", description: "Histórico de ações administrativas." },
];

export function Client360Shell({
  clientName,
  status,
  onBack,
  children,
}: {
  clientName: string;
  status: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const active = TABS.find((tab) => tab.key === activeTab) ?? TABS[0];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 shrink-0">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Clientes</span>
          </Button>
          <div className="h-5 w-px bg-slate-200" />
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-950 text-white">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{clientName}</p>
            <p className="text-[11px] text-slate-500">Cliente 360°</p>
          </div>
          <span className="ml-auto shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            {status}
          </span>
        </div>

        <div className="border-b border-slate-200">
          <nav
            aria-label="Seções do cliente"
            className="flex min-w-0 gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-4"
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition",
                  activeTab === tab.key
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </Card>

      {activeTab === "overview" ? (
        children
      ) : (
        <Card className="border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
              <ChevronRight className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">{active.label}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">{active.description}</p>
              <p className="mt-4 text-xs text-slate-400">
                Esta seção está preparada para receber os dados reais do cliente sem sobrecarregar a visão geral.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

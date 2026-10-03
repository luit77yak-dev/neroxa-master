import { useState, type ReactNode } from "react";
import { ArrowLeft, Building2, ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Section = {
  key: string;
  title: string;
  description: string;
  href?: string;
};

const SECTIONS: Section[] = [
  { key: "client", title: "Dados do cliente", description: "Dados cadastrais, status e contatos" },
  { key: "commercial", title: "Comercial", description: "Propostas e contratos", href: "/master-comercial" },
  { key: "subscription", title: "Plano e assinatura", description: "Planos, ciclos e situação", href: "/master-assinaturas" },
  { key: "systems", title: "Sistemas", description: "Sistemas e instâncias", href: "/master-sistemas" },
  { key: "domains", title: "Domínios", description: "Endereços e status dos domínios", href: "/master-dominios" },
  { key: "implementation", title: "Implantação", description: "Jobs e acompanhamento", href: "/master-implantacao" },
  { key: "finance", title: "Financeiro", description: "Cobranças e situação financeira", href: "/master-financeiro" },
  { key: "support", title: "Suporte", description: "Chamados e atendimentos", href: "/master-suporte" },
  { key: "audit", title: "Auditoria", description: "Histórico administrativo", href: "/master-configuracoes" },
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
  const [expanded, setExpanded] = useState(true);
  const [openSection, setOpenSection] = useState("client");

  return (
    <div className="min-w-0 space-y-4">
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 min-h-10 shrink-0">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Clientes</span>
          </Button>
          <div className="h-5 w-px bg-slate-200" />
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-950 text-white">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{clientName}</p>
            <p className="text-[11px] text-slate-500">Cliente 360° · visão operacional</p>
          </div>
          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            {status}
          </span>
        </div>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Visão operacional</p>
          <div className="mt-1 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">{clientName}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Resumo rápido para operação. Abra a edição completa quando precisar alterar ou acompanhar detalhes.
              </p>
            </div>
            <span className="hidden shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 sm:inline-flex">
              Cliente 360°
            </span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <SummaryItem label="Status" value={status} />
            <SummaryItem label="Visão" value="Operacional" />
            <SummaryItem label="Edição" value="Expansível" />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-slate-50 sm:px-5"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Edição completa</p>
            <p className="mt-0.5 text-xs text-slate-500">Toque para abrir os módulos do cliente.</p>
          </div>
          <ChevronDown
            className={["h-5 w-5 shrink-0 text-slate-400 transition-transform", expanded ? "rotate-180" : ""].join(" ")}
          />
        </button>

        {expanded && (
          <div className="border-t border-slate-200 p-3 sm:p-5">
            <div className="overflow-hidden rounded-xl border border-slate-200">
              {SECTIONS.map((section) => {
                const isOpen = openSection === section.key;

                return (
                  <section key={section.key} className="border-b border-slate-200 last:border-b-0">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenSection(isOpen ? "" : section.key)}
                      className="flex min-h-16 w-full items-center justify-between gap-4 bg-white px-4 py-3 text-left transition hover:bg-slate-50 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{section.title}</p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">{section.description}</p>
                      </div>
                      <ChevronDown
                        className={[
                          "h-5 w-5 shrink-0 text-slate-400 transition-transform",
                          isOpen ? "rotate-180" : "",
                        ].join(" ")}
                      />
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4">
                        {section.key === "client" ? (
                          <div className="min-w-0">{children}</div>
                        ) : section.href ? (
                          <a
                            href={section.href}
                            className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800">Abrir {section.title}</p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                Continuar esta operação no módulo correspondente.
                              </p>
                            </div>
                            <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
                          </a>
                        ) : null}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

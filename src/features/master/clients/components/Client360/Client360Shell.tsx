import { useState, type ReactNode } from "react";
import { ArrowLeft, Building2, ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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

  return (
    <div className="min-w-0 space-y-4">
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 shrink-0">
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
          className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-slate-50 sm:px-5"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Edição completa</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Dados do cliente, status, sistemas, domínios e contatos.
            </p>
          </div>
          <ChevronDown
            className={["h-5 w-5 shrink-0 text-slate-400 transition-transform", expanded ? "rotate-180" : ""].join(" ")}
          />
        </button>

        {expanded && (
          <div className="border-t border-slate-200 p-3 sm:p-5">
            <div className="min-w-0">{children}</div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ModuleLink title="Comercial" description="Propostas e contratos" href="/master-comercial" />
              <ModuleLink title="Assinaturas" description="Planos e ciclos" href="/master-assinaturas" />
              <ModuleLink title="Financeiro" description="Cobranças e situação financeira" href="/master-financeiro" />
              <ModuleLink title="Implantação" description="Jobs e acompanhamento" href="/master-implantacao" />
              <ModuleLink title="Suporte" description="Chamados e atendimentos" href="/master-suporte" />
              <ModuleLink title="Auditoria" description="Histórico administrativo" href="/master-configuracoes" />
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

function ModuleLink({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">{description}</p>
      </div>
      <ExternalLink className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-slate-700" />
    </a>
  );
}

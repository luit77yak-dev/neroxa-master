import { CircleHelp, MessageSquareText } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/master-suporte")({ component: MasterSuporte });

function MasterSuporte() {
  return <div className="space-y-6 p-4 sm:p-6 lg:p-8">
    <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Atendimento</p><h1 className="text-2xl font-semibold">Suporte</h1><p className="mt-1 text-sm text-slate-500">Central para acompanhar solicitações e incidentes dos clientes.</p></div><Button><MessageSquareText className="mr-2 h-4 w-4"/>Novo chamado</Button></div>
    <div className="rounded-2xl border bg-white p-8 text-center shadow-sm"><CircleHelp className="mx-auto h-9 w-9 text-slate-300"/><h2 className="mt-3 font-semibold">Central de suporte</h2><p className="mt-1 text-sm text-slate-500">O módulo está ativo e preparado para receber o fluxo de chamados da plataforma.</p></div>
  </div>;
}
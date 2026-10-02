import { Settings, ShieldCheck } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { MasterShell } from "@/features/master/shell/MasterShell";

export const Route = createFileRoute("/master-configuracoes")({ component: MasterConfiguracoes });

function MasterConfiguracoes() {
  return (
    <MasterShell>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sistema</p><h1 className="text-2xl font-semibold">Configurações</h1><p className="mt-1 text-sm text-slate-500">Preferências e controles da plataforma Neroxa Master.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border bg-white p-6 shadow-sm"><Settings className="h-5 w-5 text-slate-500"/><h2 className="mt-4 font-semibold">Plataforma</h2><p className="mt-1 text-sm text-slate-500">Configurações gerais, integrações e parâmetros operacionais.</p></section>
          <section className="rounded-2xl border bg-white p-6 shadow-sm"><ShieldCheck className="h-5 w-5 text-slate-500"/><h2 className="mt-4 font-semibold">Segurança</h2><p className="mt-1 text-sm text-slate-500">Controles de acesso e membros da equipe Neroxa.</p></section>
        </div>
      </div>
    </MasterShell>
  );
}

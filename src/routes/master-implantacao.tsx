import { FolderKanban, Rocket } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { MasterShell } from "@/features/master/shell/MasterShell";

export const Route = createFileRoute("/master-implantacao")({ component: MasterImplantacao });

function MasterImplantacao() {
  return (
    <MasterShell>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Operação</p><h1 className="text-2xl font-semibold">Implantação</h1><p className="mt-1 text-sm text-slate-500">Acompanhe provisionamento, configuração e publicação das instâncias.</p></div><Button variant="outline"><Rocket className="mr-2 h-4 w-4"/>Atualizar</Button></div>
        <div className="rounded-2xl border bg-white p-8 text-center shadow-sm"><FolderKanban className="mx-auto h-9 w-9 text-slate-300"/><h2 className="mt-3 font-semibold">Central de implantação</h2><p className="mt-1 text-sm text-slate-500">A fila de implantação será conectada às instâncias e jobs de provisionamento.</p></div>
      </div>
    </MasterShell>
  );
}

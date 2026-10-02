import { Package, Plus } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/master-produtos")({ component: MasterProdutos });

function MasterProdutos() {
  return <div className="space-y-6 p-4 sm:p-6 lg:p-8">
    <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Gestão</p><h1 className="text-2xl font-semibold">Produtos</h1><p className="mt-1 text-sm text-slate-500">Catálogo de soluções que a Neroxa pode comercializar e implantar.</p></div><Button><Plus className="mr-2 h-4 w-4"/>Novo produto</Button></div>
    <div className="rounded-2xl border bg-white p-8 text-center shadow-sm"><Package className="mx-auto h-9 w-9 text-slate-300"/><h2 className="mt-3 font-semibold">Catálogo de produtos</h2><p className="mt-1 text-sm text-slate-500">A estrutura está ativa. O próximo passo é conectar produtos aos planos e ao fluxo comercial.</p></div>
  </div>;
}
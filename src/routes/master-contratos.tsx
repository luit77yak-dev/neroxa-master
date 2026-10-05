import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileCheck2, Loader2, Pencil, Play, Pause, XCircle, ArrowLeft, Eye, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getNeroxaPlatformAccess } from "@/features/master/clients/services";
import { MasterShell } from "@/features/master/shell/MasterShell";
import { MasterLogin } from "@/features/master/shell/MasterLogin";
import { canPerform } from "@/features/master/permissions";
import { CONTRACT_STATUS_LABELS, type CommercialContract } from "@/features/master/commercial/types";
import { loadCommercialOverview, updateContractDraft, updateContractStatus } from "@/features/master/commercial/services";

export const Route = createFileRoute("/master-contratos")({ component: MasterContractsPage });

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function MasterContractsPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [role, setRole] = useState<import("@/features/master/clients/services").NeroxaPlatformRole | null>(null);
  const [contracts, setContracts] = useState<CommercialContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CommercialContract | null>(null);
  const [draft, setDraft] = useState({ title: "", contractNumber: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    try {
      const access = await getNeroxaPlatformAccess();
      setAuthorized(Boolean(access?.active));
      setRole(access?.role ?? null);
      if (!access?.active) return;
      const overview = await loadCommercialOverview();
      setContracts(overview.contracts);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os contratos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (authorized === false) return <MasterLogin />;
  if (authorized === null || loading) return <main className="grid min-h-screen place-items-center bg-background"><Loader2 className="h-7 w-7 animate-spin" /></main>;

  const save = async () => {
    if (!editing || !canPerform(role, "manageCommercial")) return;
    setSaving(editing.id);
    try {
      await updateContractDraft({ id: editing.id, title: draft.title, contractNumber: draft.contractNumber || null });
      setEditing(null);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); }
    finally { setSaving(null); }
  };

  return (
    <MasterShell>
      <div className="mx-auto min-w-0 max-w-[1200px] space-y-5 overflow-x-hidden px-3 py-4 sm:px-6 sm:py-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-medium tracking-wide text-muted-foreground/70">Gestão · Comercial</p><h1 className="mt-1 text-[28px] font-semibold tracking-tight">Contratos</h1><p className="mt-1 text-sm text-muted-foreground">Contratos gerados a partir de propostas aceitas.</p></div>
          <Link to="/master-comercial"><Button variant="outline"><ArrowLeft className="h-4 w-4" />Voltar ao Comercial</Button></Link>
        </header>

        {error && <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>}

        {contracts.length === 0 ? (
          <Card className="p-8 text-center"><FileCheck2 className="mx-auto h-9 w-9 text-muted-foreground" /><h2 className="mt-3 font-semibold">Nenhum contrato ainda</h2><p className="mt-1 text-sm text-muted-foreground">Aceite uma proposta e gere o primeiro contrato pelo Comercial.</p></Card>
        ) : (
          <div className="space-y-3">
            {contracts.map((contract) => (
              <Card key={contract.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted"><FileCheck2 className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{contract.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{contract.contract_number || "Sem número"} · {CONTRACT_STATUS_LABELS[contract.status]}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="rounded-full bg-muted px-2.5 py-1">Implantação: {money(contract.setup_value)}</span><span className="rounded-full bg-muted px-2.5 py-1">Recorrência: {money(contract.recurring_value)}</span><span className="rounded-full bg-muted px-2.5 py-1">Versão {contract.version}</span></div>
                  </div>
                  {canPerform(role, "manageCommercial") && <div className="flex flex-wrap gap-2">
                    {<Button variant="outline" size="sm" onClick={() => setSelectedId(contract.id)}><Eye className="h-3.5 w-3.5" />Visualizar</Button>}{contract.status === "DRAFT" && <Button variant="outline" size="sm" onClick={() => { setEditing(contract); setDraft({ title: contract.title, contractNumber: contract.contract_number ?? "" }); }}><Pencil className="h-3.5 w-3.5" />Editar</Button>}
                    {contract.status === "DRAFT" && <Button size="sm" disabled={saving === contract.id} onClick={() => void (async () => { setSaving(contract.id); try { await updateContractStatus(contract.id, "ACTIVE"); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível ativar."); } finally { setSaving(null); } })()}><Play className="h-3.5 w-3.5" />Ativar</Button>}
                    {contract.status === "ACTIVE" && <Button variant="outline" size="sm" disabled={saving === contract.id} onClick={() => void (async () => { setSaving(contract.id); try { await updateContractStatus(contract.id, "SUSPENDED"); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível suspender."); } finally { setSaving(null); } })()}><Pause className="h-3.5 w-3.5" />Suspender</Button>}
                    {["DRAFT","ACTIVE","SUSPENDED"].includes(contract.status) && <Button variant="outline" size="sm" disabled={saving === contract.id} onClick={() => { if (window.confirm("Encerrar este contrato?")) void updateContractStatus(contract.id, "TERMINATED").then(load).catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível encerrar.")); }}><XCircle className="h-3.5 w-3.5" />Encerrar</Button>}
                  </div>}
                </div>
              </Card>
            ))}
          </div>
        )}

        {selectedId && (() => {
          const contract = contracts.find((item) => item.id === selectedId);
          if (!contract) return null;
          const client = contract.client_id;
          return (
            <Card className="border-border bg-card p-5 shadow-soft print:shadow-none">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground/70">NEROXA · CONTRATO COMERCIAL</p>
                  <h2 className="mt-1 text-2xl font-semibold">{contract.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{contract.contract_number || "Número ainda não definido"} · {CONTRACT_STATUS_LABELS[contract.status]}</p>
                </div>
                <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir / PDF</Button>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Cliente</p><p className="mt-1 break-all text-sm font-medium">{client}</p></div>
                <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Modelo</p><p className="mt-1 text-sm font-medium">{contract.commercial_model === "SUBSCRIPTION" ? "Assinatura" : "Permanente"}</p></div>
                <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Implantação</p><p className="mt-1 text-sm font-medium">{money(contract.setup_value)}</p></div>
                <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Recorrência</p><p className="mt-1 text-sm font-medium">{money(contract.recurring_value)}</p></div>
              </div>
              <div className="mt-6 space-y-4 text-sm leading-6">
                <section><h3 className="font-semibold">1. Objeto</h3><p className="mt-1 text-muted-foreground">Prestação dos serviços e disponibilização do sistema descritos na proposta comercial vinculada a este contrato.</p></section>
                <section><h3 className="font-semibold">2. Valores e condições</h3><p className="mt-1 text-muted-foreground">Implantação: {money(contract.setup_value)}. Recorrência: {money(contract.recurring_value)}. Manutenção: {money(contract.maintenance_value)}.</p></section>
                <section><h3 className="font-semibold">3. Vigência</h3><p className="mt-1 text-muted-foreground">A vigência e as condições operacionais serão definidas na ativação do contrato e no vínculo de assinatura correspondente.</p></section>
                <section><h3 className="font-semibold">4. Status e versão</h3><p className="mt-1 text-muted-foreground">Este documento representa a versão {contract.version} do contrato, atualmente em status {CONTRACT_STATUS_LABELS[contract.status]}.</p></section>
              </div>
              <div className="mt-8 grid gap-8 border-t border-border pt-8 sm:grid-cols-2">
                <div><div className="border-b border-foreground/40 pb-2"></div><p className="mt-2 text-xs text-muted-foreground">Neroxa</p></div>
                <div><div className="border-b border-foreground/40 pb-2"></div><p className="mt-2 text-xs text-muted-foreground">Cliente</p></div>
              </div>
            </Card>
          );
        })()}
 
        {editing && canPerform(role, "manageCommercial") && <Card className="p-5">
          <h2 className="font-semibold">Editar rascunho</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-muted-foreground">Título<input className="mt-1 h-10 w-full rounded-lg border border-border bg-muted/50 px-3 text-sm text-foreground" value={draft.title} onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))} /></label>
            <label className="text-xs font-medium text-muted-foreground">Número<input className="mt-1 h-10 w-full rounded-lg border border-border bg-muted/50 px-3 text-sm text-foreground" value={draft.contractNumber} onChange={(e) => setDraft((v) => ({ ...v, contractNumber: e.target.value }))} placeholder="NRX-2026-001" /></label>
          </div>
          <div className="mt-4 flex gap-2 justify-end"><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={() => void save()} disabled={saving === editing.id}>Salvar</Button></div>
        </Card>}
      </div>
    </MasterShell>
  );
}

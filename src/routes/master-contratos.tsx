import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Copy, Eye, FileCheck2, Link2, Loader2, Pause, Pencil, Play, Printer, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getNeroxaPlatformAccess } from "@/features/master/clients/services";
import { MasterShell } from "@/features/master/shell/MasterShell";
import { MasterLogin } from "@/features/master/shell/MasterLogin";
import { canPerform } from "@/features/master/permissions";
import { CONTRACT_STATUS_LABELS, type CommercialContract } from "@/features/master/commercial/types";
import { loadCommercialOverview, sendContractForSignature, signContractAsNeroxa, updateContractDraft, updateContractStatus } from "@/features/master/commercial/services";

export const Route = createFileRoute("/master-contratos")({ component: MasterContractsPage });

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function signatureLabel(status: CommercialContract["signature_status"]) {
  return {
    NOT_SENT: "Não enviado",
    PENDING_CUSTOMER: "Aguardando cliente",
    PENDING_NEROXA: "Aguardando Neroxa",
    SIGNED: "Assinado",
    DECLINED: "Recusado",
    CANCELLED: "Cancelado",
  }[status];
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
  const [signing, setSigning] = useState<CommercialContract | null>(null);
  const [signer, setSigner] = useState({ name: "", role: "Administrador" });
  const [shareLink, setShareLink] = useState<string | null>(null);

  const selected = useMemo(() => contracts.find((item) => item.id === selectedId) ?? null, [contracts, selectedId]);

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

  const send = async (contract: CommercialContract) => {
    setSaving(contract.id);
    setError(null);
    try {
      await sendContractForSignature(contract.id);
      const token = contract.public_signature_token;
      const link = token ? window.location.origin + "/assinar-contrato?token=" + token : null;
      setShareLink(link);
      if (link) await navigator.clipboard?.writeText(link).catch(() => undefined);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar o contrato para assinatura.");
    } finally { setSaving(null); }
  };

  const signAsNeroxa = async () => {
    if (!signing) return;
    setSaving(signing.id);
    setError(null);
    try {
      await signContractAsNeroxa({ id: signing.id, name: signer.name, role: signer.role });
      setSigning(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a assinatura da Neroxa.");
    } finally { setSaving(null); }
  };

  return (
    <MasterShell>
      <div className="mx-auto w-full min-w-0 max-w-[1200px] space-y-4 overflow-x-clip px-2.5 py-3 sm:space-y-5 sm:px-6 sm:py-5">
        <header className="w-full min-w-0 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground/70">Gestão · Comercial</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">Contratos</h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">Contratos gerados a partir de propostas aceitas, com assinatura eletrônica das duas partes.</p>
          </div>
          <div className="mt-4">
            <Link to="/master-comercial" className="block w-full sm:w-auto"><Button variant="outline" className="w-full sm:w-auto"><ArrowLeft className="h-4 w-4" />Voltar ao Comercial</Button></Link>
          </div>
        </header>

        {error && <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>}

        {shareLink && (
          <Card className="border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="text-sm font-semibold">Link de assinatura do contrato</p><p className="mt-1 break-all text-xs text-muted-foreground">{shareLink}</p></div>
              <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:flex sm:w-auto"><Button variant="outline" onClick={() => void navigator.clipboard?.writeText(shareLink)}><Copy className="h-4 w-4" />Copiar</Button><a href={shareLink} target="_blank" rel="noreferrer"><Button className="w-full"><Link2 className="h-4 w-4" />Abrir</Button></a></div>
            </div>
          </Card>
        )}

        {contracts.length === 0 ? (
          <Card className="p-8 text-center"><FileCheck2 className="mx-auto h-9 w-9 text-muted-foreground" /><h2 className="mt-3 font-semibold">Nenhum contrato ainda</h2><p className="mt-1 text-sm text-muted-foreground">Aceite uma proposta e gere o primeiro contrato pelo Comercial.</p></Card>
        ) : (
          <div className="space-y-3">
            {contracts.map((contract) => {
              const canSend = contract.status === "DRAFT" && contract.signature_status === "NOT_SENT";
              const canSign = contract.status === "DRAFT" && contract.signature_status === "PENDING_NEROXA";
              const canActivate = contract.status === "DRAFT" && contract.signature_status === "SIGNED";
              return (
                <Card key={contract.id} className="p-4 sm:p-5">
                  <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted"><FileCheck2 className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold">{contract.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{contract.contract_number || "Sem número"} · {CONTRACT_STATUS_LABELS[contract.status]}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="rounded-full bg-muted px-2.5 py-1">Assinatura: {signatureLabel(contract.signature_status)}</span><span className="rounded-full bg-muted px-2.5 py-1">Implantação: {money(contract.setup_value)}</span><span className="rounded-full bg-muted px-2.5 py-1">Recorrência: {money(contract.recurring_value)}</span><span className="rounded-full bg-muted px-2.5 py-1">Versão {contract.version}</span></div>
                    </div>
                    {canPerform(role, "manageCommercial") && <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
                      <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setSelectedId(contract.id)}><Eye className="h-3.5 w-3.5" />Visualizar</Button>
                      {contract.status === "DRAFT" && contract.signature_status === "NOT_SENT" && <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => { setEditing(contract); setDraft({ title: contract.title, contractNumber: contract.contract_number ?? "" }); }}><Pencil className="h-3.5 w-3.5" />Editar</Button>}
                      {canSend && <Button size="sm" className="w-full sm:w-auto" disabled={saving === contract.id} onClick={() => void send(contract)}><Send className="h-3.5 w-3.5" />Enviar assinatura</Button>}
                      {canSign && <Button size="sm" className="w-full sm:w-auto" disabled={saving === contract.id} onClick={() => setSigning(contract)}><CheckCircle2 className="h-3.5 w-3.5" />Assinar Neroxa</Button>}
                      {canActivate && <Button size="sm" className="w-full sm:w-auto" disabled={saving === contract.id} onClick={() => void (async () => { setSaving(contract.id); try { await updateContractStatus(contract.id, "ACTIVE"); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível ativar."); } finally { setSaving(null); } })()}><Play className="h-3.5 w-3.5" />Ativar</Button>}
                      {contract.status === "ACTIVE" && <Button variant="outline" size="sm" className="w-full sm:w-auto" disabled={saving === contract.id} onClick={() => void updateContractStatus(contract.id, "SUSPENDED").then(load).catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível suspender."))}><Pause className="h-3.5 w-3.5" />Suspender</Button>}
                      {["ACTIVE","SUSPENDED"].includes(contract.status) && <Button variant="outline" size="sm" className="w-full sm:w-auto" disabled={saving === contract.id} onClick={() => { if (window.confirm("Encerrar este contrato?")) void updateContractStatus(contract.id, "TERMINATED").then(load).catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível encerrar.")); }}><XCircle className="h-3.5 w-3.5" />Encerrar</Button>}
                    </div>}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {selected && (
          <Card className="min-w-0 overflow-hidden border-border bg-card p-4 shadow-soft print:shadow-none sm:p-6">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0"><p className="text-xs font-medium tracking-wide text-muted-foreground/70">NEROXA · CONTRATO COMERCIAL</p><h2 className="mt-1 break-words text-xl font-semibold sm:text-2xl">{selected.title}</h2><p className="mt-1 text-sm text-muted-foreground">{selected.contract_number || "Número ainda não definido"} · {CONTRACT_STATUS_LABELS[selected.status]}</p></div>
              <Button variant="outline" className="w-full shrink-0 sm:w-auto" onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir / PDF</Button>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Cliente</p><p className="mt-1 break-all text-sm font-medium">{selected.customer_signer_name || selected.client_id}</p></div>
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Modelo</p><p className="mt-1 text-sm font-medium">{selected.commercial_model === "SUBSCRIPTION" ? "Assinatura" : "Permanente"}</p></div>
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Implantação</p><p className="mt-1 text-sm font-medium">{money(selected.setup_value)}</p></div>
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Recorrência</p><p className="mt-1 text-sm font-medium">{money(selected.recurring_value)}</p></div>
            </div>
            <div className="mt-6 space-y-5 text-sm leading-6">
              <section><h3 className="font-semibold">1. Objeto</h3><p className="mt-1 text-muted-foreground">Prestação dos serviços e disponibilização do sistema descritos na proposta comercial vinculada a este contrato.</p></section>
              <section><h3 className="font-semibold">2. Valores e condições</h3><p className="mt-1 text-muted-foreground">Implantação: {money(selected.setup_value)}. Recorrência: {money(selected.recurring_value)}. Manutenção: {money(selected.maintenance_value)}.</p></section>
              <section><h3 className="font-semibold">3. Vigência</h3><p className="mt-1 text-muted-foreground">{selected.term_months ? `Prazo inicial de ${selected.term_months} meses.` : "Vigência a partir da ativação, conforme as condições comerciais desta versão."}</p></section>
              <section><h3 className="font-semibold">4. Assinaturas</h3><div className="mt-2 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border p-4"><p className="font-medium">Cliente</p><p className="mt-1">{selected.customer_signer_name || "Aguardando assinatura"}</p><p className="text-xs text-muted-foreground">{selected.customer_signed_at ? new Date(selected.customer_signed_at).toLocaleString("pt-BR") : "Não assinado"}</p></div><div className="rounded-xl border border-border p-4"><p className="font-medium">Neroxa</p><p className="mt-1">{selected.neroxa_signer_name || "Aguardando assinatura"}</p><p className="text-xs text-muted-foreground">{selected.neroxa_signed_at ? new Date(selected.neroxa_signed_at).toLocaleString("pt-BR") : "Não assinado"}</p></div></div></section>
              <section><h3 className="font-semibold">5. Status e versão</h3><p className="mt-1 text-muted-foreground">Versão {selected.version}. Assinatura: {signatureLabel(selected.signature_status)}. Status operacional: {CONTRACT_STATUS_LABELS[selected.status]}.</p></section>
            </div>
          </Card>
        )}

        {editing && canPerform(role, "manageCommercial") && <Card className="p-5">
          <h2 className="font-semibold">Editar rascunho</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-muted-foreground">Título<input className="mt-1 h-10 w-full rounded-lg border border-border bg-muted/50 px-3 text-sm text-foreground" value={draft.title} onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))} /></label>
            <label className="text-xs font-medium text-muted-foreground">Número<input className="mt-1 h-10 w-full rounded-lg border border-border bg-muted/50 px-3 text-sm text-foreground" value={draft.contractNumber} onChange={(e) => setDraft((v) => ({ ...v, contractNumber: e.target.value }))} placeholder="NRX-2026-001" /></label>
          </div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={() => void save()} disabled={saving === editing.id}>Salvar</Button></div>
        </Card>}

        {signing && canPerform(role, "manageCommercial") && <Card className="border-primary/30 bg-primary/5 p-5">
          <h2 className="font-semibold">Assinar em nome da Neroxa</h2>
          <p className="mt-1 text-sm text-muted-foreground">A assinatura será registrada para a versão {signing.version} deste contrato e o conteúdo ficará congelado.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-muted-foreground">Nome do responsável<input className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" value={signer.name} onChange={(e) => setSigner((v) => ({ ...v, name: e.target.value }))} placeholder="Nome completo" /></label>
            <label className="text-xs font-medium text-muted-foreground">Cargo<input className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" value={signer.role} onChange={(e) => setSigner((v) => ({ ...v, role: e.target.value }))} placeholder="Administrador" /></label>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setSigning(null)}>Cancelar</Button><Button onClick={() => void signAsNeroxa()} disabled={saving === signing.id}><CheckCircle2 className="h-4 w-4" />Confirmar assinatura</Button></div>
        </Card>}
      </div>
    </MasterShell>
  );
}

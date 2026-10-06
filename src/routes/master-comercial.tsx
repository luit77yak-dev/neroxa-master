import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  Loader2,
  Edit3,
  Save,
  X,
  RefreshCw,
  Send,
  Pause,
  Play,
  TrendingUp,
  Plus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getNeroxaPlatformAccess, isNeroxaStaff } from "@/features/master/clients/services";
import { canPerform } from "@/features/master/permissions";
import { MasterShell } from "@/features/master/shell/MasterShell";
import { MasterLogin } from "@/features/master/shell/MasterLogin";
import {
  CONTRACT_STATUS_LABELS,
  PROPOSAL_STATUS_LABELS,
  type CommercialContract,
  type CommercialProposal,
} from "@/features/master/commercial/types";
import { createContractFromProposal, createProposal, loadCommercialOverview, updateContractDraft, updateContractStatus, updateProposalStatus } from "@/features/master/commercial/services";
import { loadSubscriptionOverview } from "@/features/master/subscriptions/services";
import type { SubscriptionPlan } from "@/features/master/subscriptions/types";

export const Route = createFileRoute("/master-comercial")({
  component: MasterCommercialPage,
});

const proposalTone: Record<keyof typeof PROPOSAL_STATUS_LABELS, string> = {
  DRAFT: "bg-muted text-foreground/80",
  SENT: "bg-blue-50 text-blue-700",
  NEGOTIATION: "bg-violet-50 text-violet-700",
  ACCEPTED: "bg-success/10 text-success",
  REJECTED: "bg-red-50 text-red-700",
  EXPIRED: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-muted text-muted-foreground",
};

const contractTone: Record<keyof typeof CONTRACT_STATUS_LABELS, string> = {
  DRAFT: "bg-muted text-foreground/80",
  ACTIVE: "bg-success/10 text-success",
  SUSPENDED: "bg-amber-50 text-amber-700",
  TERMINATED: "bg-red-50 text-red-700",
  EXPIRED: "bg-muted text-muted-foreground",
};

function MasterCommercialPage() {
  const params=typeof window==="undefined"?null:new URLSearchParams(window.location.search);
  const contextClientId=params?.get("clientId") ?? null;
  const contextOrganizationId=params?.get("organizationId") ?? null;
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [role, setRole] = useState<import("@/features/master/clients/services").NeroxaPlatformRole | null>(null);
  const [proposals, setProposals] = useState<CommercialProposal[]>([]);
  const [contracts, setContracts] = useState<CommercialContract[]>([]);
  const [clients, setClients] = useState<{ id: string; legal_name: string | null; trade_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [contractDraft, setContractDraft] = useState({ title: "", contractNumber: "" });
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [showNewProposal, setShowNewProposal] = useState(Boolean(contextClientId || contextOrganizationId));
  const [proposalForm, setProposalForm] = useState({ clientId: contextOrganizationId ?? contextClientId ?? "", planId: "", title: "", notes: "", validUntil: "" });
  const [creatingProposal, setCreatingProposal] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareProposalId, setShareProposalId] = useState<string | null>(null);
  const [proposalStatusFilter, setProposalStatusFilter] = useState<"ALL" | keyof typeof PROPOSAL_STATUS_LABELS>("ALL");
  const [contractStatusFilter, setContractStatusFilter] = useState<"ALL" | keyof typeof CONTRACT_STATUS_LABELS>("ALL");
  const [expandedProposalId, setExpandedProposalId] = useState<string | null>(null);
  const [expandedContractId, setExpandedContractId] = useState<string | null>(null);

  const load = async (initial = false) => {
    setError(null);
    if (initial) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const access = await getNeroxaPlatformAccess();
      const staff = Boolean(access?.active);
      setAuthorized(staff);
      setRole(access?.role ?? null);
      if (!staff) return;

      const [overview, subscriptionOverview] = await Promise.all([loadCommercialOverview(), loadSubscriptionOverview()]);
      setPlans(subscriptionOverview.plans.filter((plan) => plan.active));
      setProposals(overview.proposals);
      setContracts(overview.contracts);
      setClients(overview.clients);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o Comercial.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(true);
  }, []);
  const handleCreateProposal = async () => {
    if (!canPerform(role, "manageCommercial")) return;
    if (!proposalForm.clientId || !proposalForm.planId) {
      setError("Selecione o cliente e o plano.");
      return;
    }
    setCreatingProposal(true);
    setError(null);
    try {
      await createProposal({ clientId: proposalForm.clientId, planId: proposalForm.planId, title: proposalForm.title, notes: proposalForm.notes || null, validUntil: proposalForm.validUntil || null });
      setProposalForm((current) => ({ ...current, title: "", notes: "", validUntil: "" }));
      setShowNewProposal(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar a proposta.");
    } finally {
      setCreatingProposal(false);
    }
  };

  const handleShareProposal = async (proposal: CommercialProposal) => {
    if (!canPerform(role, "manageCommercial")) return;
    setError(null);
    try {
      if (proposal.status === "DRAFT") await updateProposalStatus(proposal.id, "SENT");
      const link = window.location.origin + "/proposta-publica?token=" + proposal.public_token;
      setShareLink(link);
      setShareProposalId(proposal.id);
      setShareProposalId(proposal.id);
      try {
        await navigator.clipboard?.writeText(link);
      } catch {
        // O link continua disponível para cópia manual em navegadores que bloqueiam clipboard.
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível preparar o link da proposta.");
    }
  };

  const handleProposalStatus = async (id: string, status: "DRAFT" | "SENT" | "NEGOTIATION" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CANCELLED") => { if (!canPerform(role, "manageCommercial")) return; setSaving(id); setError(null); try { await updateProposalStatus(id, status); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível alterar a proposta."); } finally { setSaving(null); } };
  const handleContractStatus = async (id: string, status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "TERMINATED" | "EXPIRED") => { if (!canPerform(role, "manageCommercial")) return; setSaving(id); setError(null); try { await updateContractStatus(id, status); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível alterar o contrato."); } finally { setSaving(null); } };
  const handleCreateContract = async (proposalId: string) => { if (!canPerform(role, "manageCommercial")) return; setSaving(proposalId); setError(null); try { await createContractFromProposal(proposalId); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível gerar o contrato."); } finally { setSaving(null); } };

  const startEditContract = (contract: CommercialContract) => {
    if (contract.status !== "DRAFT" || !canPerform(role, "manageCommercial")) return;
    setEditingContractId(contract.id);
    setContractDraft({ title: contract.title, contractNumber: contract.contract_number ?? "" });
    setError(null);
  };

  const saveContractDraft = async () => {
    if (!editingContractId || !canPerform(role, "manageCommercial")) return;
    setSaving(editingContractId);
    setError(null);
    try {
      await updateContractDraft({ id: editingContractId, title: contractDraft.title, contractNumber: contractDraft.contractNumber || null });
      setEditingContractId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o contrato.");
    } finally {
      setSaving(null);
    }
  };

  const clientMap = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );

  const scopedProposals = contextOrganizationId
    ? proposals.filter((item) => item.client_id === contextOrganizationId)
    : contextClientId
      ? proposals.filter((item) => item.client_id === contextClientId)
      : proposals;
  const scopedContracts = contextClientId
    ? contracts.filter((item) => item.client_id === contextClientId)
    : contracts;

  const metrics = useMemo(() => ({
    totalProposals: scopedProposals.length,
    openProposals: scopedProposals.filter((item) => ["SENT", "NEGOTIATION"].includes(item.status)).length,
    acceptedProposals: scopedProposals.filter((item) => item.status === "ACCEPTED").length,
    activeContracts: scopedContracts.filter((item) => item.status === "ACTIVE").length,
  }), [scopedProposals, scopedContracts]);
  const filteredProposals = proposalStatusFilter === "ALL"
    ? scopedProposals
    : scopedProposals.filter((item) => item.status === proposalStatusFilter);
  const filteredContracts = contractStatusFilter === "ALL"
    ? scopedContracts
    : scopedContracts.filter((item) => item.status === contractStatusFilter);
  const recentProposals = filteredProposals.slice(0, 5);
  const recentContracts = filteredContracts.slice(0, 5);

  if (authorized === false) return <MasterLogin />;

  if (authorized === null || loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">
        <Loader2 className="h-7 w-7 animate-spin" />
      </main>
    );
  }

  return (
    <MasterShell>
      <div className="mx-auto min-w-0 max-w-[1500px] space-y-5 overflow-x-hidden px-3 py-4 sm:px-6 sm:py-5">
        <section className="w-full min-w-0 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-muted-foreground/70">
                Gestão · Comercial
              </p>
              <h1 className="mt-1 break-words font-display text-[28px] leading-tight font-semibold tracking-tight text-foreground sm:text-[32px]">
                Comercial
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
                Acompanhe propostas e contratos sem misturar regras comerciais com a operação dos clientes.
              </p>
            </div>
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto lg:min-w-[390px]">
              <Button className="w-full" variant="outline" onClick={() => void load()} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              {canPerform(role, "manageCommercial") && (
                <>
                  <Link to="/master-contratos" className="w-full">
                    <Button className="w-full" variant="outline">
                      <FileCheck2 className="h-4 w-4" />
                      Contratos
                    </Button>
                  </Link>
                  <Button className="w-full" onClick={() => setShowNewProposal((current) => !current)}>
                    <Plus className="h-4 w-4" />
                    Nova proposta
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>

        {showNewProposal && canPerform(role, "manageCommercial") && (
          <Card className="border-border bg-card p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-medium tracking-wide text-muted-foreground/70">Comercial · Nova proposta</p><h2 className="mt-1 text-base font-semibold">Criar proposta</h2><p className="mt-1 text-xs text-muted-foreground">Selecione o cliente e o plano. Os valores serão copiados automaticamente do plano.</p></div>
              <Button variant="ghost" size="icon" onClick={() => setShowNewProposal(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label><span className="mb-1.5 block text-xs font-medium text-muted-foreground">Cliente</span><select className="h-10 w-full rounded-lg border border-border bg-muted/50 px-3 text-sm" value={proposalForm.clientId} onChange={(e) => setProposalForm((v) => ({ ...v, clientId: e.target.value }))}><option value="">Selecione um cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.trade_name || client.legal_name || "Cliente"}</option>)}</select></label>
              <label><span className="mb-1.5 block text-xs font-medium text-muted-foreground">Plano</span><select className="h-10 w-full rounded-lg border border-border bg-muted/50 px-3 text-sm" value={proposalForm.planId} onChange={(e) => setProposalForm((v) => ({ ...v, planId: e.target.value }))}><option value="">Selecione um plano</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
              <label><span className="mb-1.5 block text-xs font-medium text-muted-foreground">Título</span><input className="h-10 w-full rounded-lg border border-border bg-muted/50 px-3 text-sm" value={proposalForm.title} onChange={(e) => setProposalForm((v) => ({ ...v, title: e.target.value }))} placeholder="Ex.: Pizza Perfect Plate · Implantação" /></label>
              <label><span className="mb-1.5 block text-xs font-medium text-muted-foreground">Validade</span><input type="date" className="h-10 w-full rounded-lg border border-border bg-muted/50 px-3 text-sm" value={proposalForm.validUntil} onChange={(e) => setProposalForm((v) => ({ ...v, validUntil: e.target.value }))} /></label>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">Observações</span><textarea className="min-h-20 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm" value={proposalForm.notes} onChange={(e) => setProposalForm((v) => ({ ...v, notes: e.target.value }))} /></label>
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setShowNewProposal(false)}>Cancelar</Button><Button onClick={() => void handleCreateProposal()} disabled={creatingProposal || !proposalForm.clientId || !proposalForm.planId}>{creatingProposal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Criar proposta</Button></div>
          </Card>
        )}

        {error && (
          <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={FileText} label="Propostas" value={metrics.totalProposals} hint="Total registrado" />
          <Metric icon={Send} label="Em andamento" value={metrics.openProposals} hint="Enviadas ou em negociação" />
          <Metric icon={CheckCircle2} label="Aceitas" value={metrics.acceptedProposals} hint="Prontas para contrato" />
          <Metric icon={FileCheck2} label="Contratos ativos" value={metrics.activeContracts} hint="Vínculos comerciais ativos" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <CommercialList
            title="Propostas recentes"
            description="Últimas movimentações comerciais"
            icon={FileText}
            empty="Nenhuma proposta cadastrada ainda."
            toolbar={
              <select
                aria-label="Filtrar propostas por status"
                className="h-9 rounded-lg border border-border bg-muted/50 px-2.5 text-xs"
                value={proposalStatusFilter}
                onChange={(event) => setProposalStatusFilter(event.target.value as typeof proposalStatusFilter)}
              >
                <option value="ALL">Todos os status</option>
                {Object.entries(PROPOSAL_STATUS_LABELS).map(([status, label]) => (
                  <option key={status} value={status}>{label}</option>
                ))}
              </select>
            }
          >
            {recentProposals.map((proposal) => {
              const client = clientMap.get(proposal.client_id);
              return (
                <div key={proposal.id} className="border-b border-border/60 py-3.5 last:border-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{proposal.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {client?.trade_name || client?.legal_name || "Cliente não identificado"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={expandedProposalId === proposal.id ? "Ocultar detalhes" : "Ver detalhes"}
                        onClick={() => setExpandedProposalId((current) => current === proposal.id ? null : proposal.id)}
                      >
                        {expandedProposalId === proposal.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${proposalTone[proposal.status]}`}>
                        {PROPOSAL_STATUS_LABELS[proposal.status]}
                      </span>
                      {proposal.status === "DRAFT" && (
                        <Button variant="ghost" size="icon" title="Enviar proposta" disabled={saving === proposal.id} onClick={() => void handleShareProposal(proposal)}>
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {proposal.status === "SENT" && (
                        <Button variant="ghost" size="icon" title="Copiar link" onClick={() => void handleShareProposal(proposal)}>
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {["SENT", "NEGOTIATION"].includes(proposal.status) && (
                        <Button variant="ghost" size="icon" title="Aceitar" disabled={saving === proposal.id} onClick={() => void handleProposalStatus(proposal.id, "ACCEPTED")}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {proposal.status === "ACCEPTED" && !contracts.some((contract) => contract.proposal_id === proposal.id) && (
                        <Button variant="outline" size="sm" disabled={saving === proposal.id} onClick={() => void handleCreateContract(proposal.id)}>
                          Gerar contrato
                        </Button>
                      )}
                      {!["ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"].includes(proposal.status) && (
                        <Button variant="outline" size="sm" disabled={saving === proposal.id} onClick={() => { if (window.confirm("Cancelar esta proposta?")) void handleProposalStatus(proposal.id, "CANCELLED"); }}>
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>

                  {expandedProposalId === proposal.id && (
                    <div className="mt-3 ml-0 rounded-xl border border-border bg-muted/20 p-4 sm:ml-12">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Detail label="Status" value={PROPOSAL_STATUS_LABELS[proposal.status]} />
                        <Detail label="Validade" value={proposal.valid_until ? new Date(proposal.valid_until + "T00:00:00").toLocaleDateString("pt-BR") : "Sem validade"} />
                        <Detail label="Modelo" value={proposal.commercial_model === "PERMANENT" ? "Compra permanente" : "Assinatura"} />
                        <Detail label="Moeda" value={proposal.currency || "BRL"} />
                        <Detail label="Recorrência" value={proposal.recurring_value == null ? "—" : `R$ ${proposal.recurring_value.toFixed(2).replace(".", ",")}`} />
                        <Detail label="Implantação" value={`R$ ${proposal.setup_value.toFixed(2).replace(".", ",")}`} />
                        <Detail label="Manutenção" value={proposal.maintenance_value == null ? "—" : `R$ ${proposal.maintenance_value.toFixed(2).replace(".", ",")}`} />
                        <Detail label="Versão" value={String(proposal.version ?? 1)} />
                      </div>
                      {proposal.notes && (
                        <div className="mt-3 rounded-lg border border-border bg-background/60 p-3">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Observações</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{proposal.notes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {shareLink && shareProposalId === proposal.id && (
                    <div className="mt-3 ml-0 rounded-xl border border-border bg-muted/30 p-4 sm:ml-12">
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">Proposta enviada com sucesso</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            O link público desta proposta está pronto para compartilhar com o cliente.
                          </p>
                        </div>
                        <Button className="w-full shrink-0 sm:w-auto" onClick={() => window.open(shareLink, "_blank", "noopener,noreferrer")}>
                          Abrir proposta
                        </Button>
                      </div>
                      <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row">
                        <input readOnly value={shareLink} aria-label="Link público da proposta" className="h-10 min-w-0 w-full flex-1 rounded-lg border border-border bg-background px-3 text-xs" />
                        <Button className="w-full shrink-0 sm:w-auto" variant="outline" onClick={() => void navigator.clipboard?.writeText(shareLink).catch(() => undefined)}>
                          Copiar link
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

          </CommercialList>

          <CommercialList
            title="Contratos recentes"
            description="Últimos vínculos comerciais registrados"
            icon={FileCheck2}
            empty="Nenhum contrato cadastrado ainda."
            toolbar={
              <select
                aria-label="Filtrar contratos por status"
                className="h-9 rounded-lg border border-border bg-muted/50 px-2.5 text-xs"
                value={contractStatusFilter}
                onChange={(event) => setContractStatusFilter(event.target.value as typeof contractStatusFilter)}
              >
                <option value="ALL">Todos os status</option>
                {Object.entries(CONTRACT_STATUS_LABELS).map(([status, label]) => (
                  <option key={status} value={status}>{label}</option>
                ))}
              </select>
            }
          >
            {recentContracts.map((contract) => {
              const client = clientMap.get(contract.client_id);
              return (
                <div key={contract.id} className="border-b border-border/60 py-3.5 last:border-0">
                  <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <FileCheck2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{contract.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {contract.contract_number || "Sem número"} · {client?.trade_name || client?.legal_name || "Cliente não identificado"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={expandedContractId === contract.id ? "Ocultar detalhes" : "Ver detalhes"}
                      onClick={() => setExpandedContractId((current) => current === contract.id ? null : contract.id)}
                    >
                      {expandedContractId === contract.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${contractTone[contract.status]}`}>{CONTRACT_STATUS_LABELS[contract.status]}</span>{contract.status==="DRAFT"&&<Button variant="ghost" size="icon" title="Editar rascunho" disabled={saving===contract.id} onClick={()=>startEditContract(contract)}><Edit3 className="h-3.5 w-3.5"/></Button>}{contract.status==="DRAFT"&&<Button variant="ghost" size="icon" title="Ativar" disabled={saving===contract.id} onClick={()=>void handleContractStatus(contract.id,"ACTIVE")}><Play className="h-3.5 w-3.5"/></Button>}{contract.status==="ACTIVE"&&<Button variant="ghost" size="icon" title="Suspender" disabled={saving===contract.id} onClick={()=>void handleContractStatus(contract.id,"SUSPENDED")}><Pause className="h-3.5 w-3.5"/></Button>}{["DRAFT","ACTIVE","SUSPENDED"].includes(contract.status)&&<Button variant="outline" size="sm" disabled={saving===contract.id} onClick={()=>{if(window.confirm("Encerrar este contrato? Essa ação altera o status para encerrado."))void handleContractStatus(contract.id,"TERMINATED")}}>Encerrar</Button>}</div>
                  </div>
                  {expandedContractId === contract.id && (
                    <div className="mt-3 rounded-xl border border-border bg-muted/20 p-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Detail label="Status" value={CONTRACT_STATUS_LABELS[contract.status]} />
                        <Detail label="Assinatura" value={contract.signature_status === "SIGNED" ? "Assinado" : contract.signature_status === "PENDING_CUSTOMER" ? "Aguardando cliente" : contract.signature_status === "PENDING_NEROXA" ? "Aguardando Neroxa" : contract.signature_status === "NOT_SENT" ? "Não enviado" : contract.signature_status} />
                        <Detail label="Modelo" value={contract.commercial_model === "PERMANENT" ? "Compra permanente" : "Assinatura"} />
                        <Detail label="Recorrência" value={contract.recurring_value == null ? "—" : `R$ ${contract.recurring_value.toFixed(2).replace(".", ",")}`} />
                        <Detail label="Implantação" value={`R$ ${contract.setup_value.toFixed(2).replace(".", ",")}`} />
                        <Detail label="Manutenção" value={contract.maintenance_value == null ? "—" : `R$ ${contract.maintenance_value.toFixed(2).replace(".", ",")}`} />
                        <Detail label="Número" value={contract.contract_number || "Sem número"} />
                        <Detail label="Versão" value={String(contract.version ?? 1)} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CommercialList>
        </div>

        {editingContractId && (
          <Card className="border-border bg-card p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground/70">Contrato · Edição</p>
                <h2 className="mt-1 text-base font-semibold text-foreground">Editar rascunho</h2>
                <p className="mt-1 text-xs text-muted-foreground">Os valores comerciais permanecem vinculados à proposta aceita e não podem ser alterados aqui.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditingContractId(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Título</span>
                <input className="h-10 w-full rounded-lg border border-border bg-muted/50 px-3 text-sm" value={contractDraft.title} onChange={(event) => setContractDraft((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Número do contrato</span>
                <input className="h-10 w-full rounded-lg border border-border bg-muted/50 px-3 text-sm" value={contractDraft.contractNumber} onChange={(event) => setContractDraft((current) => ({ ...current, contractNumber: event.target.value }))} placeholder="Ex.: NRX-2026-001" />
              </label>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {[
                ["Modelo", editingContractId ? contracts.find((item) => item.id === editingContractId)?.commercial_model === "PERMANENT" ? "Compra permanente" : "Assinatura" : "—"],
                ["Recorrência", editingContractId ? (() => { const item = contracts.find((row) => row.id === editingContractId); return item?.recurring_value == null ? "—" : `R$ ${item.recurring_value.toFixed(2).replace(".", ",")}`; })() : "—"],
                ["Implantação", editingContractId ? (() => { const item = contracts.find((row) => row.id === editingContractId); return item ? `R$ ${item.setup_value.toFixed(2).replace(".", ",")}` : "—"; })() : "—"],
                ["Versão", editingContractId ? String(contracts.find((item) => item.id === editingContractId)?.version ?? 1) : "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-muted/50 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setEditingContractId(null)}>Cancelar</Button>
              <Button onClick={() => void saveContractDraft()} disabled={saving === editingContractId}>
                {saving === editingContractId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar rascunho
              </Button>
            </div>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card className="border-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar text-white">
                <BriefcaseBusiness className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Fluxo comercial</h2>
                <p className="text-xs text-muted-foreground">A fundação já controla as transições críticas.</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {["Lead", "Proposta", "Negociação", "Aceite", "Contrato"].map((step, index, all) => (
                <div key={step} className="flex items-center gap-2">
                  <span className="rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground/80">
                    {step}
                  </span>
                  {index < all.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-slate-300" />}
                </div>
              ))}
            </div>
          </Card>

          <Card className="border-border bg-sidebar p-5 text-slate-100 shadow-soft">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-slate-300" />
              <p className="text-xs font-medium tracking-wide text-muted-foreground/70">Próximo módulo</p>
            </div>
            <h2 className="mt-2 text-lg font-semibold">Assinaturas</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Depois de contrato, a próxima camada registra plano, preço contratado e recorrência.
            </p>
            <Link to="/master" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-white">
              Voltar ao Master <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Card>
        </div>

        <Card className="border-border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Clock3 className="h-4 w-4 shrink-0" />
            Esta visão usa apenas dados reais disponíveis no módulo Comercial; métricas financeiras ficam para o módulo Financeiro.
          </div>
        </Card>
      </div>
    </MasterShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof FileText;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card className="border-border bg-card p-4 shadow-soft">
      <Icon className="h-4 w-4 text-muted-foreground/70" />
      <p className="mt-3 text-xs font-medium tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background/60 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function CommercialList({
  title,
  description,
  icon: Icon,
  empty,
  toolbar,
  children,
}: {
  title: string;
  description: string;
  icon: typeof FileText;
  empty: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border bg-card p-5 shadow-soft">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {toolbar}
      </div>
      <div className="mt-4">
        {children || <p className="py-8 text-center text-xs text-muted-foreground">{empty}</p>}
      </div>
    </Card>
  );
}

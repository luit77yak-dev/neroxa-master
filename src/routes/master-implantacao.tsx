import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock3, FolderKanban, Globe2, Loader2, Pencil, Play, RefreshCw, RotateCcw, Trash2, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getNeroxaPlatformAccess, listNeroxaClients, type NeroxaClient, type NeroxaPlatformRole } from "@/features/master/clients/services";
import { canPerform } from "@/features/master/permissions";
import { MasterLogin } from "@/features/master/shell/MasterLogin";
import { MasterShell } from "@/features/master/shell/MasterShell";
import { cancelProvisioningJob, deleteImplementationInstance, listImplementationInstances, listProvisioningJobs, prepareImplementationFromSubscription, retryProvisioningJob, updateImplementationInstance, updateImplementationInstanceStatus, updateProvisioningJob, type ImplementationInstance, type InstanceStatus, type ProvisioningJob, type ProvisioningStatus } from "@/features/master/implementation/services";

export const Route = createFileRoute("/master-implantacao")({ component: MasterImplantacao });

const statusLabel: Record<ProvisioningStatus, string> = { PENDING: "Pendente", RUNNING: "Executando", COMPLETED: "Concluído", FAILED: "Falhou", CANCELLED: "Cancelado" };
const statusClass: Record<ProvisioningStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700", RUNNING: "bg-blue-50 text-blue-700", COMPLETED: "bg-success/10 text-success", FAILED: "bg-red-50 text-red-700", CANCELLED: "bg-muted text-muted-foreground",
};
const INSTANCE_STATUSES: InstanceStatus[] = ["PROVISIONING", "ACTIVE", "SUSPENDED", "ARCHIVED"];
const SYSTEM_TYPES = ["DELIVERY", "FOOD", "CLINIC", "BEAUTY", "BARBER", "FITNESS", "CUSTOM"];
function MasterImplantacao() {
  const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const contextClientId = params?.get("clientId") ?? null;
  const contextOrganizationId = params?.get("organizationId") ?? null;
  const contextSubscriptionId = params?.get("subscriptionId") ?? null;
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [role, setRole] = useState<NeroxaPlatformRole | null>(null);
  const [jobs, setJobs] = useState<ProvisioningJob[]>([]);
  const [instances, setInstances] = useState<ImplementationInstance[]>([]);
  const [clients, setClients] = useState<NeroxaClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [instanceStatusFilter, setInstanceStatusFilter] = useState<InstanceStatus | "ALL">("ALL");
  const [jobStatusFilter, setJobStatusFilter] = useState<ProvisioningStatus | "ALL">("ALL");
  const [error, setError] = useState<string | null>(null);
  const [prepareOpen, setPrepareOpen] = useState(Boolean(contextSubscriptionId));
  const [prepareName, setPrepareName] = useState("");
  const [prepareSlug, setPrepareSlug] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [instanceName, setInstanceName] = useState("");
  const [instanceSlug, setInstanceSlug] = useState("");
  const [instanceType, setInstanceType] = useState("CUSTOM");
  const [savingInstance, setSavingInstance] = useState(false);
  const [expandedInstance, setExpandedInstance] = useState<string | null>(null);
  const [editingInstance, setEditingInstance] = useState<ImplementationInstance | null>(null);

  const load = async () => {
    setError(null);
    try {
      const access = await getNeroxaPlatformAccess();
      setAuthorized(Boolean(access?.active));
      setRole(access?.active ? access.role : null);
      if (!access?.active) return;
      const [jobData, instanceData, clientData] = await Promise.all([listProvisioningJobs(), listImplementationInstances(), listNeroxaClients()]);
      const scopedJobs = contextOrganizationId ? jobData.filter((job) => job.organization_id === contextOrganizationId) : contextClientId ? jobData.filter((job) => job.organization_id === contextClientId) : jobData;
      const scopedInstances = contextOrganizationId ? instanceData.filter((instance) => instance.organization_id === contextOrganizationId) : contextClientId ? instanceData.filter((instance) => instance.organization_id === contextClientId) : instanceData;
      setJobs(scopedJobs);
      setInstances(scopedInstances);
      setClients(clientData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a central de implantação.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const metrics = useMemo(() => ({
    pending: jobs.filter(j => j.status === "PENDING").length,
    running: jobs.filter(j => j.status === "RUNNING").length,
    failed: jobs.filter(j => j.status === "FAILED").length,
    active: instances.filter(i => i.status === "ACTIVE").length,
  }), [jobs, instances]);

  const run = async (job: ProvisioningJob) => {
    setWorking(job.id); setError(null);
    try { await updateProvisioningJob({ id: job.id, status: "RUNNING" }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível iniciar o job."); }
    finally { setWorking(null); }
  };

  const complete = async (job: ProvisioningJob) => {
    setWorking(job.id); setError(null);
    try { await updateProvisioningJob({ id: job.id, status: "COMPLETED" }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir o job."); }
    finally { setWorking(null); }
  };

  const retry = async (job: ProvisioningJob) => {
    setWorking(job.id); setError(null);
    try { await retryProvisioningJob(job); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar a nova tentativa."); }
    finally { setWorking(null); }
  };

  const cancel = async (job: ProvisioningJob) => {
    setWorking(job.id); setError(null);
    try { await cancelProvisioningJob(job.id); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível cancelar o job."); }
    finally { setWorking(null); }
  };

  const changeInstanceStatus = async (instance: ImplementationInstance, status: InstanceStatus) => {
    if (status === instance.status) return;
    setWorking(instance.id); setError(null);
    try { await updateImplementationInstanceStatus({ id: instance.id, status }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível alterar o status da instância."); }
    finally { setWorking(null); }
  };

  const openEdit = (instance: ImplementationInstance) => {
    setEditingInstance(instance);
    setExpandedInstance(instance.id);
    setInstanceName(instance.name);
    setInstanceSlug(instance.slug);
    setInstanceType(instance.system_type);
    setError(null);
  };

  const saveInstance = async () => {
    if (!editingInstance) return;
    setSavingInstance(true);
    setError(null);
    try {
      await updateImplementationInstance({
        id: editingInstance.id,
        name: instanceName,
        slug: instanceSlug,
        systemType: instanceType,
      });
      setEditingInstance(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a instância.");
    } finally {
      setSavingInstance(false);
    }
  };

  const removeInstance = async (instance: ImplementationInstance) => {
    if (instance.status !== "ARCHIVED") return;
    const confirmed = window.confirm("Excluir instância permanentemente? Esta ação não pode ser desfeita. A exclusão só será permitida se a instância não possuir vínculos ou histórico operacional.");
    if (!confirmed) return;
    setWorking(instance.id); setError(null);
    try { await deleteImplementationInstance(instance.id); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível excluir a instância."); }
    finally { setWorking(null); }
  };

  const prepareFromSubscription = async () => {
    if (!contextSubscriptionId || !prepareName.trim() || !prepareSlug.trim()) {
      setError("Informe o nome e o slug da instância.");
      return;
    }
    setPreparing(true); setError(null);
    try {
      await prepareImplementationFromSubscription({ subscriptionId: contextSubscriptionId, name: prepareName, slug: prepareSlug });
      setPrepareOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível preparar a implantação.");
    } finally { setPreparing(false); }
  };

  if (authorized === false) return <MasterLogin />;
  if (authorized === null || loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100"><Loader2 className="h-7 w-7 animate-spin" /></main>;

  const visibleInstances = instances.filter((instance) => instanceStatusFilter === "ALL" || instance.status === instanceStatusFilter);
  const visibleJobs = jobs.filter((job) => jobStatusFilter === "ALL" || job.status === jobStatusFilter);

  return <MasterShell><div className="mx-auto min-w-0 max-w-[1250px] space-y-5 overflow-x-hidden px-3 py-4 sm:px-6 sm:py-5">
    <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-xs font-medium tracking-wide text-muted-foreground/70">Operação · Implantação</p><h1 className="mt-1 font-display text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px] text-foreground">Central de implantação</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe instâncias e jobs de provisionamento.</p></div>
      <div className="flex flex-wrap gap-2">{contextSubscriptionId && <Button variant="outline" onClick={()=>setPrepareOpen(true)}>Preparar implantação</Button>}<Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4"/>Atualizar</Button></div>
    </section>

    {prepareOpen && contextSubscriptionId && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <Card className="w-full max-w-lg border-border bg-card p-5 shadow-2xl">
        <p className="text-xs font-medium tracking-wide text-muted-foreground/70">Assinatura ativa</p><h2 className="mt-1 text-xl font-semibold text-foreground">Preparar implantação</h2><p className="mt-1 text-sm text-muted-foreground">A instância será criada vinculada à assinatura e receberá automaticamente o primeiro job de provisionamento.</p>
        <div className="mt-5 space-y-4"><label className="block"><span className="text-xs font-medium text-foreground/80">Nome da instância</span><input className="mt-1.5 h-10 w-full rounded-md border border-input px-3 text-sm" value={prepareName} onChange={e=>setPrepareName(e.target.value)} placeholder="Ex.: Barbearia Silva"/></label><label className="block"><span className="text-xs font-medium text-foreground/80">Slug</span><input className="mt-1.5 h-10 w-full rounded-md border border-input px-3 text-sm" value={prepareSlug} onChange={e=>setPrepareSlug(e.target.value)} placeholder="ex.: barbearia-silva"/></label></div>
        <div className="mt-5 flex justify-end gap-2 border-t border-border/60 pt-4"><Button variant="outline" onClick={()=>setPrepareOpen(false)} disabled={preparing}>Cancelar</Button><Button onClick={()=>void prepareFromSubscription()} disabled={preparing}>{preparing?<Loader2 className="h-4 w-4 animate-spin"/>:"Preparar implantação"}</Button></div>
      </Card>
    </div>}

    {error && <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Pendentes",metrics.pending,Clock3],["Executando",metrics.running,Play],["Falhos",metrics.failed,XCircle],["Ativas",metrics.active,CheckCircle2]].map(([label,value,Icon]) => <Card key={String(label)} className="border-border bg-card p-4 shadow-soft"><Icon className="h-4 w-4 text-muted-foreground"/><p className="mt-2 text-xs text-muted-foreground">{label}</p><p className="mt-0.5 text-2xl font-semibold">{value}</p></Card>)}</div>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_430px]">
      <Card className="border-border bg-card shadow-soft"><div className="border-b border-border/60 p-5"><h2 className="font-semibold">Fila de provisionamento</h2><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="mt-1 text-xs text-muted-foreground">{visibleJobs.length} de {jobs.length} job(s) registrados</p><select aria-label="Filtrar jobs por status" value={jobStatusFilter} onChange={(event)=>setJobStatusFilter(event.target.value as ProvisioningStatus | "ALL")} className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs sm:w-auto"><option value="ALL">Todos os status</option>{Object.entries(statusLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div></div><div className="divide-y divide-border">{visibleJobs.length === 0 ? <div className="p-10 text-center"><FolderKanban className="mx-auto h-9 w-9 text-slate-300"/><p className="mt-3 text-sm font-medium">Nenhum job de implantação</p><p className="mt-1 text-xs text-muted-foreground">Os jobs aparecerão quando uma instância for preparada para provisionamento.</p></div> : visibleJobs.map(job => <div key={job.id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{job.action}</p><span className={`rounded-full px-2 py-1 text-[10px] font-medium ${statusClass[job.status]}`}>{statusLabel[job.status]}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">Job {job.id.slice(0,8)} · instância {job.system_instance_id?.slice(0,8) ?? "—"}</p>{job.error_message && <p className="mt-2 text-xs text-red-600">{job.error_message}</p>}</div><div className="flex flex-wrap items-center justify-start gap-1 sm:shrink-0 sm:justify-end">{canPerform(role,"manageSystems") && job.status === "PENDING" && <Button size="sm" variant="outline" disabled={working===job.id} onClick={() => void run(job)}><Play className="mr-1 h-3.5 w-3.5"/>Executar</Button>}{canPerform(role,"manageSystems") && job.status === "RUNNING" && <Button size="sm" variant="outline" disabled={working===job.id} onClick={() => void complete(job)}><CheckCircle2 className="mr-1 h-3.5 w-3.5"/>Concluir</Button>}{canPerform(role,"manageSystems") && ["FAILED","CANCELLED"].includes(job.status) && <Button size="sm" variant="outline" disabled={working===job.id} onClick={() => void retry(job)}><RotateCcw className="mr-1 h-3.5 w-3.5"/>Tentar novamente</Button>}{canPerform(role,"manageSystems") && ["PENDING","RUNNING"].includes(job.status) && <Button size="sm" variant="ghost" disabled={working===job.id} onClick={() => void cancel(job)}><XCircle className="h-4 w-4"/></Button>}</div></div><div className="mt-3 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2 text-muted-foreground"><span>Criado: {new Date(job.created_at).toLocaleString("pt-BR")}</span><span>Início: {job.started_at ? new Date(job.started_at).toLocaleString("pt-BR") : "—"}</span></div></div>)}</div></Card>

      <Card className="h-fit border-border bg-card p-5 shadow-soft"><div className="flex items-center gap-2"><Zap className="h-4 w-4 text-muted-foreground"/><div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><h2 className="font-semibold">Instâncias</h2><select aria-label="Filtrar instâncias por status" value={instanceStatusFilter} onChange={(event)=>setInstanceStatusFilter(event.target.value as InstanceStatus | "ALL")} className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs sm:w-auto"><option value="ALL">Todos os status</option>{INSTANCE_STATUSES.map((status)=><option key={status} value={status}>{status}</option>)}</select></div></div><div className="mt-4 space-y-3">{visibleInstances.length===0 ? <p className="text-sm text-muted-foreground">Nenhuma instância cadastrada.</p> : visibleInstances.map(instance => {
  const expanded=expandedInstance===instance.id || editingInstance?.id===instance.id;
  return <div key={instance.id} className="rounded-xl border border-border p-3">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{instance.name}</p><p className="truncate text-xs text-muted-foreground">{instance.slug} · {instance.system_type}</p></div><select value={instance.status} disabled={working===instance.id || !canPerform(role,"manageSystems")} onChange={(event)=>void changeInstanceStatus(instance,event.target.value as InstanceStatus)} className="rounded-md border border-border bg-card px-2 py-1 text-[10px] font-medium text-muted-foreground outline-none disabled:opacity-50" aria-label={`Status da instância ${instance.name}`}>{INSTANCE_STATUSES.map(status=><option key={status} value={status}>{status}</option>)}</select></div>
    <div className="mt-3 flex flex-wrap gap-2">{canPerform(role,"manageSystems")&&<><Button size="sm" variant="outline" onClick={()=>{setExpandedInstance(expanded?null:instance.id);if(editingInstance?.id===instance.id)setEditingInstance(null);}}>{expanded?"Recolher":"Detalhes"}</Button><Button size="sm" variant="outline" onClick={()=>openEdit(instance)} disabled={working===instance.id}><Pencil className="mr-1.5 h-3.5 w-3.5"/>Editar</Button><Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={()=>void removeInstance(instance)} disabled={working===instance.id || instance.status!=="ARCHIVED"}><Trash2 className="mr-1.5 h-3.5 w-3.5"/>Excluir</Button></>}</div>
    {expanded && <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
      <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-muted/50 p-2.5"><span className="text-muted-foreground">Cliente</span><p className="mt-1 font-medium">{clients.find(c=>c.organization_id===instance.organization_id)?.trade_name || clients.find(c=>c.organization_id===instance.organization_id)?.legal_name || instance.organization_id}</p></div><div className="rounded-lg bg-muted/50 p-2.5"><span className="text-muted-foreground">ID</span><p className="mt-1 font-medium">{instance.id.slice(0,8)}</p></div></div>
      <Link to="/master-dominios" search={{ organizationId: instance.organization_id }} className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-foreground/80 hover:bg-muted/50"><Globe2 className="mr-1.5 h-3.5 w-3.5"/>Domínios</Link>
      {editingInstance?.id===instance.id && <div className="rounded-xl border border-border bg-muted/30 p-4"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-medium text-muted-foreground">Editando instância</p><p className="font-semibold">Atualizar configuração</p></div><Button variant="ghost" size="sm" onClick={()=>setEditingInstance(null)}>Cancelar</Button></div><div className="space-y-3"><label className="block"><span className="text-xs font-medium text-foreground/80">Nome</span><input className="mt-1.5 h-10 w-full rounded-md border border-input px-3 text-sm" value={instanceName} onChange={e=>setInstanceName(e.target.value)}/></label><label className="block"><span className="text-xs font-medium text-foreground/80">Slug</span><input className="mt-1.5 h-10 w-full rounded-md border border-input px-3 text-sm" value={instanceSlug} onChange={e=>setInstanceSlug(e.target.value)}/></label><label className="block"><span className="text-xs font-medium text-foreground/80">Tipo de sistema</span><select className="mt-1.5 h-10 w-full rounded-md border border-input bg-card px-3 text-sm" value={instanceType} onChange={e=>setInstanceType(e.target.value)}>{SYSTEM_TYPES.map(type=><option key={type} value={type}>{type}</option>)}</select></label><Button className="w-full" onClick={()=>void saveInstance()} disabled={savingInstance}>{savingInstance ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar alterações"}</Button></div></div>}
    </div>}
  </div>;
})}</div></Card>
    </div>
  </div></MasterShell>;
}

import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock3, FolderKanban, Globe2, Loader2, Play, RefreshCw, RotateCcw, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getNeroxaPlatformAccess, type NeroxaPlatformRole } from "@/features/master/clients/services";
import { canPerform } from "@/features/master/permissions";
import { MasterLogin } from "@/features/master/shell/MasterLogin";
import { MasterShell } from "@/features/master/shell/MasterShell";
import { cancelProvisioningJob, createProvisioningJob, listImplementationInstances, listProvisioningJobs, prepareImplementationFromSubscription, retryProvisioningJob, updateProvisioningJob, type ImplementationInstance, type ProvisioningJob, type ProvisioningStatus } from "@/features/master/implementation/services";

export const Route = createFileRoute("/master-implantacao")({ component: MasterImplantacao });

const statusLabel: Record<ProvisioningStatus, string> = { PENDING: "Pendente", RUNNING: "Executando", COMPLETED: "Concluído", FAILED: "Falhou", CANCELLED: "Cancelado" };
const statusClass: Record<ProvisioningStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700", RUNNING: "bg-blue-50 text-blue-700", COMPLETED: "bg-emerald-50 text-emerald-700", FAILED: "bg-red-50 text-red-700", CANCELLED: "bg-slate-100 text-slate-500",
};

function MasterImplantacao() {
  const params=typeof window==="undefined"?null:new URLSearchParams(window.location.search);
  const contextClientId=params?.get("clientId") ?? null;
  const contextOrganizationId=params?.get("organizationId") ?? null;
  const contextSubscriptionId=params?.get("subscriptionId") ?? null;
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [role, setRole] = useState<NeroxaPlatformRole | null>(null);
  const [jobs, setJobs] = useState<ProvisioningJob[]>([]);
  const [instances, setInstances] = useState<ImplementationInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prepareOpen, setPrepareOpen] = useState(Boolean(contextSubscriptionId));
  const [prepareName, setPrepareName] = useState("");
  const [prepareSlug, setPrepareSlug] = useState("");
  const [preparing, setPreparing] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const access = await getNeroxaPlatformAccess();
      setAuthorized(Boolean(access?.active));
      setRole(access?.active ? access.role : null);
      if (!access?.active) return;
      const [jobData, instanceData] = await Promise.all([listProvisioningJobs(), listImplementationInstances()]);
      const scopedJobs = contextOrganizationId ? jobData.filter((job) => job.organization_id === contextOrganizationId) : contextClientId ? jobData.filter((job) => job.organization_id === contextClientId) : jobData;
      const scopedInstances = contextOrganizationId ? instanceData.filter((instance) => instance.organization_id === contextOrganizationId) : contextClientId ? instanceData.filter((instance) => instance.organization_id === contextClientId) : instanceData;
      setJobs(scopedJobs);
      setInstances(scopedInstances);
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

  const prepareFromSubscription = async () => {
    if (!contextSubscriptionId || !prepareName.trim() || !prepareSlug.trim()) {
      setError("Informe o nome e o slug da instância.");
      return;
    }
    setPreparing(true); setError(null);
    try {
      await prepareImplementationFromSubscription({
        subscriptionId: contextSubscriptionId,
        name: prepareName,
        slug: prepareSlug,
      });
      setPrepareOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível preparar a implantação.");
    } finally {
      setPreparing(false);
    }
  };

  const createForInstance = async (instance: ImplementationInstance) => {
    setWorking(instance.id); setError(null);
    try {
      await createProvisioningJob({
        organizationId: instance.organization_id,
        systemInstanceId: instance.id,
        action: "PROVISION_INSTANCE",
        payload: { instance_id: instance.id, slug: instance.slug, system_type: instance.system_type },
      });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o job."); }
    finally { setWorking(null); }
  };

  if (authorized === false) return <MasterLogin />;
  if (authorized === null || loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100"><Loader2 className="h-7 w-7 animate-spin" /></main>;

  return <MasterShell><div className="mx-auto max-w-[1250px] space-y-5 px-4 py-5 sm:px-6">
    <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Operação · Implantação</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Central de implantação</h1><p className="mt-1 text-sm text-slate-500">Acompanhe instâncias e jobs de provisionamento.</p></div><div className="flex gap-2">{contextSubscriptionId && <Button onClick={()=>setPrepareOpen(true)}>Preparar implantação</Button>}<Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4"/>Atualizar</Button></div></section>
    {prepareOpen && contextSubscriptionId && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <Card className="w-full max-w-lg border-slate-200 bg-white p-5 shadow-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Assinatura ativa</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">Preparar implantação</h2>
        <p className="mt-1 text-sm text-slate-500">A instância será criada vinculada à assinatura e receberá automaticamente o primeiro job de provisionamento.</p>
        <div className="mt-5 space-y-4">
          <label className="block"><span className="text-xs font-medium text-slate-700">Nome da instância</span><input className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={prepareName} onChange={e=>setPrepareName(e.target.value)} placeholder="Ex.: Barbearia Silva"/></label>
          <label className="block"><span className="text-xs font-medium text-slate-700">Slug</span><input className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={prepareSlug} onChange={e=>setPrepareSlug(e.target.value)} placeholder="ex.: barbearia-silva"/></label>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><Button variant="outline" onClick={()=>setPrepareOpen(false)} disabled={preparing}>Cancelar</Button><Button onClick={()=>void prepareFromSubscription()} disabled={preparing}>{preparing?<Loader2 className="h-4 w-4 animate-spin"/>:"Preparar implantação"}</Button></div>
      </Card>
    </div>}
    {error && <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Pendentes",metrics.pending,Clock3],["Executando",metrics.running,Play],["Falhos",metrics.failed,XCircle],["Ativas",metrics.active,CheckCircle2]].map(([label,value,Icon]) => <Card key={String(label)} className="border-slate-200 bg-white p-4 shadow-sm"><Icon className="h-4 w-4 text-slate-500"/><p className="mt-2 text-xs text-slate-500">{label}</p><p className="mt-0.5 text-2xl font-semibold">{value}</p></Card>)}</div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
      <Card className="border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-semibold">Fila de provisionamento</h2><p className="mt-1 text-xs text-slate-500">{jobs.length} job(s) registrados</p></div><div className="divide-y divide-slate-100">{jobs.length === 0 ? <div className="p-10 text-center"><FolderKanban className="mx-auto h-9 w-9 text-slate-300"/><p className="mt-3 text-sm font-medium">Nenhum job de implantação</p><p className="mt-1 text-xs text-slate-500">Os jobs aparecerão quando uma instância for preparada para provisionamento.</p></div> : jobs.map(job => <div key={job.id} className="p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{job.action}</p><span className={`rounded-full px-2 py-1 text-[10px] font-medium ${statusClass[job.status]}`}>{statusLabel[job.status]}</span></div><p className="mt-1 truncate text-xs text-slate-500">Job {job.id.slice(0,8)} · instância {job.system_instance_id?.slice(0,8) ?? "—"}</p>{job.error_message && <p className="mt-2 text-xs text-red-600">{job.error_message}</p>}</div><div className="flex shrink-0 gap-1">{canPerform(role,"manageSystems") && job.status === "PENDING" && <Button size="sm" variant="outline" disabled={working===job.id} onClick={() => void run(job)}><Play className="mr-1 h-3.5 w-3.5"/>Executar</Button>}{canPerform(role,"manageSystems") && job.status === "RUNNING" && <Button size="sm" variant="outline" disabled={working===job.id} onClick={() => void complete(job)}><CheckCircle2 className="mr-1 h-3.5 w-3.5"/>Concluir</Button>}{canPerform(role,"manageSystems") && ["FAILED","CANCELLED"].includes(job.status) && <Button size="sm" variant="outline" disabled={working===job.id} onClick={() => void retry(job)}><RotateCcw className="mr-1 h-3.5 w-3.5"/>Tentar novamente</Button>}{canPerform(role,"manageSystems") && ["PENDING","RUNNING"].includes(job.status) && <Button size="sm" variant="ghost" disabled={working===job.id} onClick={() => void cancel(job)}><XCircle className="h-4 w-4"/></Button>}</div></div><div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500"><span>Criado: {new Date(job.created_at).toLocaleString("pt-BR")}</span><span>Início: {job.started_at ? new Date(job.started_at).toLocaleString("pt-BR") : "—"}</span></div></div>)}</div></Card>
      <Card className="h-fit border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Zap className="h-4 w-4 text-slate-500"/><h2 className="font-semibold">Instâncias</h2></div><div className="mt-4 space-y-3">{instances.length===0 ? <p className="text-sm text-slate-500">Nenhuma instância cadastrada.</p> : instances.map(instance => { const hasPending=jobs.some(j=>j.system_instance_id===instance.id && ["PENDING","RUNNING"].includes(j.status)); return <div key={instance.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{instance.name}</p><p className="truncate text-xs text-slate-500">{instance.slug} · {instance.system_type}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{instance.status}</span></div>{canPerform(role,"manageSystems") && <div className="mt-3 grid gap-2 sm:grid-cols-2"><Link to="/master-dominios" search={{ organizationId: instance.organization_id }} className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"><Globe2 className="mr-1.5 h-3.5 w-3.5"/>Domínios</Link>{!hasPending && instance.status === "PROVISIONING" && <Button size="sm" variant="outline" disabled={working===instance.id} onClick={() => void createForInstance(instance)}><RocketIcon/>Criar job de implantação</Button>}</div>}</div> })}</div></Card>
    </div>
  </div></MasterShell>;
}

function RocketIcon(){ return <Zap className="mr-2 h-3.5 w-3.5"/>; }

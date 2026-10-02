import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Edit3, Loader2, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isNeroxaStaff } from "@/features/master/clients/services";
import { MasterLogin } from "@/features/master/shell/MasterLogin";
import { MasterShell } from "@/features/master/shell/MasterShell";
import { BILLING_INTERVAL_LABELS, type SubscriptionPlan } from "@/features/master/subscriptions/types";
import { createPlan, loadSubscriptionOverview, updatePlan } from "@/features/master/subscriptions/services";

export const Route = createFileRoute("/master-planos")({ component: MasterPlansPage });

type Form = { name: string; slug: string; description: string; priceMonthly: string; setupPrice: string; billingPeriod: "MONTHLY" | "YEARLY" | "ONE_TIME"; active: boolean };
const emptyForm: Form = { name: "", slug: "", description: "", priceMonthly: "0", setupPrice: "0", billingPeriod: "MONTHLY", active: true };

function MasterPlansPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const staff = await isNeroxaStaff();
      setAuthorized(staff);
      if (!staff) return;
      const overview = await loadSubscriptionOverview();
      setPlans(overview.plans);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os planos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const startEdit = (plan: SubscriptionPlan) => {
    setEditing(plan.id);
    setForm({ name: plan.name, slug: plan.slug, description: plan.description ?? "", priceMonthly: String(plan.base_price), setupPrice: String(plan.setup_price), billingPeriod: plan.billing_interval, active: plan.active });
  };

  const save = async () => {
    if (!form.name.trim() || !form.slug.trim()) { setError("Informe nome e slug do plano."); return; }
    const priceMonthly = Number(form.priceMonthly);
    const setupPrice = Number(form.setupPrice);
    if (!Number.isFinite(priceMonthly) || priceMonthly < 0 || !Number.isFinite(setupPrice) || setupPrice < 0) { setError("Informe valores válidos."); return; }
    setSaving(true); setError(null);
    try {
      if (editing) await updatePlan({ id: editing, name: form.name, slug: form.slug, description: form.description, priceMonthly, setupPrice, billingPeriod: form.billingPeriod, active: form.active });
      else await createPlan({ name: form.name, slug: form.slug, description: form.description, priceMonthly, setupPrice, billingPeriod: form.billingPeriod, active: form.active });
      setEditing(null); setForm(emptyForm); await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o plano.");
    } finally { setSaving(false); }
  };

  if (authorized === false) return <MasterLogin />;
  if (authorized === null || loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100"><Loader2 className="h-7 w-7 animate-spin" /></main>;

  return <MasterShell><div className="mx-auto max-w-[1200px] space-y-5 px-4 py-5 sm:px-6">
    <section><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Gestão · Planos</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Planos</h1><p className="mt-1 text-sm text-slate-500">Gerencie catálogo, preços e disponibilidade para novas contratações.</p></section>
    {error && <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">{plans.map(plan => <Card key={plan.id} className="border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="font-semibold">{plan.name}</h2><span className={plan.active ? "rounded-full bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700" : "rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500"}>{plan.active ? "Ativo" : "Inativo"}</span></div><p className="mt-1 text-xs text-slate-500">{plan.slug} · {BILLING_INTERVAL_LABELS[plan.billing_interval]}</p>{plan.description && <p className="mt-3 text-sm text-slate-600">{plan.description}</p>}</div><Button variant="outline" size="sm" onClick={() => startEdit(plan)}><Edit3 className="h-3.5 w-3.5" />Editar</Button></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Recorrência</p><p className="mt-1 font-semibold">R$ {plan.base_price.toFixed(2).replace(".", ",")}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Implantação</p><p className="mt-1 font-semibold">R$ {plan.setup_price.toFixed(2).replace(".", ",")}</p></div></div></Card>)}</div>
      <Card className="h-fit border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-medium uppercase tracking-wider text-slate-500">{editing ? "Editar plano" : "Novo plano"}</p><h2 className="mt-1 text-lg font-semibold">{editing ? "Atualizar catálogo" : "Cadastrar plano"}</h2></div>{editing && <Button variant="ghost" size="icon" onClick={() => { setEditing(null); setForm(emptyForm); }}><X className="h-4 w-4" /></Button>}</div><div className="mt-5 space-y-3">
        <Field label="Nome"><input value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="Ex.: Neroxa Essencial" /></Field>
        <Field label="Slug"><input value={form.slug} onChange={e => setForm({...form,slug:e.target.value})} placeholder="neroxa-essencial" /></Field>
        <Field label="Descrição"><textarea value={form.description} onChange={e => setForm({...form,description:e.target.value})} rows={3} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Recorrência"><input type="number" min="0" step="0.01" value={form.priceMonthly} onChange={e => setForm({...form,priceMonthly:e.target.value})} /></Field><Field label="Implantação"><input type="number" min="0" step="0.01" value={form.setupPrice} onChange={e => setForm({...form,setupPrice:e.target.value})} /></Field></div>
        <Field label="Periodicidade"><select value={form.billingPeriod} onChange={e => setForm({...form,billingPeriod:e.target.value as Form["billingPeriod"]})}><option value="MONTHLY">Mensal</option><option value="YEARLY">Anual</option><option value="ONE_TIME">Avulso</option></select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e => setForm({...form,active:e.target.checked})} /> Disponível para contratação</label>
        <Button className="w-full" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar plano"}</Button>
      </div></Card>
    </div>
  </div></MasterShell>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span><div className="[&_input]:h-10 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-slate-200 [&_input]:bg-slate-50 [&_input]:px-3 [&_input]:text-sm [&_textarea]:w-full [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-slate-200 [&_textarea]:bg-slate-50 [&_textarea]:px-3 [&_textarea]:py-2.5 [&_textarea]:text-sm [&_select]:h-10 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-slate-200 [&_select]:bg-white [&_select]:px-3 [&_select]:text-sm">{children}</div></label>; }

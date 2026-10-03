import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Edit3, Loader2, Package, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getNeroxaPlatformAccess, type NeroxaPlatformRole } from "@/features/master/clients/services";
import { canPerform } from "@/features/master/permissions";
import { MasterLogin } from "@/features/master/shell/MasterLogin";
import { MasterShell } from "@/features/master/shell/MasterShell";
import { listNeroxaSystems, type NeroxaSystem } from "@/features/master/systems/services";
import { createProduct, deleteProduct, listProducts, listProductPlans, removePlanProduct, setPlanProduct, updateProduct } from "@/features/master/products/services";
import type { NeroxaProduct } from "@/features/master/products/types";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/master-produtos")({ component: MasterProdutos });

type Plan = { id: string; name: string; active: boolean; system_id: string | null };
type Form = { name: string; slug: string; description: string; category: string; systemId: string; setupPrice: string; priceMonthly: string; active: boolean };
const emptyForm: Form = { name: "", slug: "", description: "", category: "SOLUTION", systemId: "", setupPrice: "0", priceMonthly: "0", active: true };

function MasterProdutos() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [role, setRole] = useState<NeroxaPlatformRole | null>(null);
  const [products, setProducts] = useState<NeroxaProduct[]>([]);
  const [systems, setSystems] = useState<NeroxaSystem[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlans, setSelectedPlans] = useState<string[]>([]);
  const [productPlans, setProductPlans] = useState<Record<string, string[]>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const access = await getNeroxaPlatformAccess();
      setAuthorized(Boolean(access?.active));
      setRole(access?.active ? access.role : null);
      if (!access?.active) return;
      const [{ data: planData, error: planError }, productData, systemData] = await Promise.all([
        supabase.from("neroxa_plans" as never).select("id,name,active,system_id").order("name", { ascending: true }),
        listProducts(),
        listNeroxaSystems(),
      ]);
      if (planError) throw new Error(planError.message);
      const nextPlans = (planData ?? []) as unknown as Plan[];
      setPlans(nextPlans);
      setProducts(productData);
      setSystems(systemData);
      const links = await Promise.all(productData.map(async (product) => [product.id, await listProductPlans(product.id)] as const));
      setProductPlans(Object.fromEntries(links.map(([productId, productLinks]) => [productId, productLinks.filter(link => link.included).map(link => nextPlans.find(plan => plan.id === link.plan_id)?.name).filter((name): name is string => Boolean(name))])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os produtos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const startEdit = async (product: NeroxaProduct) => {
    setEditing(product.id);
    setForm({
      name: product.name,
      slug: product.slug,
      description: product.description ?? "",
      category: product.category,
      systemId: product.system_id ?? "",
      setupPrice: String(product.setup_price),
      priceMonthly: String(product.price_monthly),
      active: product.active,
    });
    try {
      const links = await listProductPlans(product.id);
      setSelectedPlans(links.filter(link => link.included).map(link => link.plan_id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os planos do produto.");
    }
  };

  const availablePlans = plans.filter((plan) => !form.systemId || !plan.system_id || plan.system_id === form.systemId);

  const reset = () => {
    setEditing(null);
    setForm(emptyForm);
    setSelectedPlans([]);
  };

  const save = async () => {
    const setupPrice = Number(form.setupPrice);
    const priceMonthly = Number(form.priceMonthly);
    if (!form.name.trim() || !form.slug.trim()) return setError("Informe nome e slug do produto.");
    if (!Number.isFinite(setupPrice) || setupPrice < 0 || !Number.isFinite(priceMonthly) || priceMonthly < 0) return setError("Informe valores válidos.");
    setSaving(true); setError(null);
    try {
      const input = { name: form.name, slug: form.slug, description: form.description, category: form.category, systemId: form.systemId || null, setupPrice, priceMonthly, active: form.active };
      const id = editing ? (await updateProduct({ id: editing, ...input }), editing) : await createProduct(input);
      const current = await listProductPlans(id);
      const desired = new Set(selectedPlans);
      await Promise.all(current.map(link => desired.has(link.plan_id) ? Promise.resolve() : removePlanProduct(link.plan_id, id)));
      await Promise.all(selectedPlans.filter(planId => !current.some(link => link.plan_id === planId)).map(planId => setPlanProduct({ planId, productId: id, included: true })));
      reset(); await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o produto.");
    } finally { setSaving(false); }
  };

  const remove = async (product: NeroxaProduct) => {
    if (!window.confirm(`Excluir o produto "${product.name}"?`)) return;
    setError(null);
    try { await deleteProduct(product.id); if (editing === product.id) reset(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível excluir o produto."); }
  };

  if (authorized === false) return <MasterLogin />;
  if (authorized === null || loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100"><Loader2 className="h-7 w-7 animate-spin" /></main>;

  return <MasterShell><div className="mx-auto max-w-[1250px] space-y-5 px-4 py-5 sm:px-6">
    <section><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Gestão · Produtos</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Produtos</h1><p className="mt-1 text-sm text-slate-500">Catálogo de soluções que a Neroxa comercializa e implanta.</p></section>
    {error && <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
      <div className="space-y-3">
        {products.length === 0 ? <Card className="border-slate-200 bg-white p-10 text-center shadow-sm"><Package className="mx-auto h-9 w-9 text-slate-300"/><h2 className="mt-3 font-semibold">Nenhum produto cadastrado</h2><p className="mt-1 text-sm text-slate-500">Cadastre a primeira solução comercial da Neroxa.</p></Card> : products.map(product => <Card key={product.id} className="border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{product.name}</h2><span className={product.active ? "rounded-full bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700" : "rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500"}>{product.active ? "Ativo" : "Inativo"}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">{product.category}</span></div><p className="mt-1 text-xs text-slate-500">{product.slug}{product.system_id ? ` · ${systems.find(system => system.id === product.system_id)?.name ?? "Sistema-base vinculado"}` : " · Compartilhável"}</p>{product.description && <ProductDescription description={product.description} />}<div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Disponível nos planos</p><p className="mt-1 text-sm text-slate-600">{productPlans[product.id]?.length ? productPlans[product.id].join(" · ") : "Ainda não vinculado a nenhum plano"}</p></div></div><div className="flex shrink-0 gap-2">{canPerform(role, "manageProducts") && <><Button variant="outline" size="sm" onClick={() => void startEdit(product)}><Edit3 className="h-3.5 w-3.5"/>Editar</Button><Button variant="ghost" size="icon" onClick={() => void remove(product)} aria-label="Excluir produto"><Trash2 className="h-4 w-4"/></Button></>}</div></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Recorrência</p><p className="mt-1 font-semibold">R$ {product.price_monthly.toFixed(2).replace(".", ",")}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Implantação</p><p className="mt-1 font-semibold">R$ {product.setup_price.toFixed(2).replace(".", ",")}</p></div></div></Card>)}
      </div>
      <Card className="h-fit border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-medium uppercase tracking-wider text-slate-500">{editing ? "Editar produto" : "Novo produto"}</p><h2 className="mt-1 text-lg font-semibold">{editing ? "Atualizar catálogo" : "Cadastrar produto"}</h2></div>{editing && <Button variant="ghost" size="icon" onClick={reset}><X className="h-4 w-4"/></Button>}</div><div className="mt-5 space-y-3">
        <Field label="Nome"><input value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="Ex.: Cardápio Delivery" /></Field>
        <Field label="Slug"><input value={form.slug} onChange={e => setForm({...form,slug:e.target.value})} placeholder="cardapio-delivery" /></Field>
        <Field label="Categoria"><input value={form.category} onChange={e => setForm({...form,category:e.target.value})} placeholder="SOLUTION" /></Field>
        <Field label="Sistema-base / segmento"><select value={form.systemId} onChange={e => { const next = e.target.value; setForm({...form,systemId:next}); const allowedPlans = new Set(plans.filter(plan => !next || !plan.system_id || plan.system_id === next).map(plan => plan.id)); setSelectedPlans(current => current.filter(id => allowedPlans.has(id))); }}><option value="">Produto compartilhável</option>{systems.filter(system => system.active).map(system => <option key={system.id} value={system.id}>{system.name} · {system.version}</option>)}</select></Field>
        <Field label="Descrição comercial e principais recursos"><textarea value={form.description} onChange={e => setForm({...form,description:e.target.value})} rows={3} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Recorrência"><input type="number" min="0" step="0.01" value={form.priceMonthly} onChange={e => setForm({...form,priceMonthly:e.target.value})} /></Field><Field label="Implantação"><input type="number" min="0" step="0.01" value={form.setupPrice} onChange={e => setForm({...form,setupPrice:e.target.value})} /></Field></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e => setForm({...form,active:e.target.checked})}/> Disponível para comercialização</label>
        <div><p className="mb-1 text-xs font-medium text-slate-600">Planos que incluem este produto</p><p className="mb-2 text-[11px] leading-4 text-slate-500">O produto é a solução. Aqui você define em quais planos comerciais ele estará disponível.</p><div className="max-h-36 space-y-2 overflow-auto rounded-lg border border-slate-200 p-3">{plans.length === 0 ? <p className="text-xs text-slate-500">Nenhum plano cadastrado.</p> : availablePlans.map(plan => <label key={plan.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedPlans.includes(plan.id)} onChange={e => setSelectedPlans(current => e.target.checked ? [...current, plan.id] : current.filter(id => id !== plan.id))}/><span className="min-w-0 truncate">{plan.name}{plan.system_id ? ` · ${systems.find(system => system.id === plan.system_id)?.name ?? "Sistema-base"}` : ""}</span>{!plan.active && <span className="text-[10px] text-slate-400">inativo</span>}</label>)}</div></div>
        {canPerform(role, "manageProducts") && <Button className="w-full" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : editing ? <Save className="h-4 w-4"/> : <Plus className="h-4 w-4"/>}{saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar produto"}</Button>}
      </div></Card>
    </div>
  </div></MasterShell>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span><div className="[&_input]:h-10 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-slate-200 [&_input]:bg-slate-50 [&_input]:px-3 [&_input]:text-sm [&_textarea]:w-full [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-slate-200 [&_textarea]:bg-slate-50 [&_textarea]:px-3 [&_textarea]:py-2.5 [&_select]:h-10 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-slate-200 [&_select]:bg-white [&_select]:px-3 [&_select]:text-sm">{children}</div></label>;
}

function ProductDescription({ description }: { description: string }) {
  const lines = description.split(/\r?\n|•/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return <p className="mt-3 text-sm leading-5 text-slate-600">{description}</p>;
  const [intro, ...resources] = lines;
  return <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"><p className="text-xs font-semibold text-slate-700">Recursos do produto</p><p className="mt-1.5 text-sm leading-5 text-slate-600">{intro}</p><ul className="mt-3 grid gap-2 sm:grid-cols-2">{resources.map((resource, index) => <li key={resource + index} className="flex min-w-0 items-start gap-2 text-sm leading-5 text-slate-600"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span className="break-words">{resource}</span></li>)}</ul></div>;
}

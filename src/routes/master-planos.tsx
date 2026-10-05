import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Edit3, Loader2, Package, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getNeroxaPlatformAccess } from "@/features/master/clients/services";
import { canPerform } from "@/features/master/permissions";
import { MasterLogin } from "@/features/master/shell/MasterLogin";
import { MasterShell } from "@/features/master/shell/MasterShell";
import { BILLING_INTERVAL_LABELS, COMMERCIAL_MODEL_LABELS, type SubscriptionPlan } from "@/features/master/subscriptions/types";
import { listNeroxaSystems, type NeroxaSystem } from "@/features/master/systems/services";
import { createPlan, deletePlan, loadSubscriptionOverview, listPlanFeatures, removePlanFeature, setPlanFeature, updatePlan } from "@/features/master/subscriptions/services";
import { listProducts, listProductPlans, removePlanProduct, setPlanProduct } from "@/features/master/products/services";
import type { NeroxaProduct } from "@/features/master/products/types";

export const Route = createFileRoute("/master-planos")({ component: MasterPlansPage });

type Form = { name: string; slug: string; description: string; systemId: string; priceMonthly: string; setupPrice: string; billingPeriod: "MONTHLY" | "YEARLY" | "ONE_TIME"; commercialModel: "SUBSCRIPTION" | "PERMANENT"; maintenancePrice: string; active: boolean };
const FEATURE_OPTIONS = [
  ["digital_presence", "Presença digital"],
  ["custom_domain", "Domínio personalizado"],
  ["admin_panel", "Painel administrativo"],
  ["catalog_management", "Cadastro de produtos/serviços"],
  ["customer_management", "Gestão de clientes"],
  ["coupons_promotions", "Cupons e promoções"],
  ["reports_history", "Relatórios e histórico"],
  ["basic_integrations", "Integrações básicas"],
  ["advanced_segment_resources", "Recursos avançados do segmento"],
  ["automations", "Automações"],
  ["integrations", "Integrações avançadas"],
  ["advanced_customization", "Maior personalização"],
  ["priority_support", "Suporte prioritário"],
  ["platform_updates", "Atualizações da plataforma"],
  ["central_support", "Central Neroxa"],
  ["custom_project", "Projeto personalizado"],
  ["business_defined_resources", "Recursos definidos pelo negócio"],
  ["specific_integrations", "Integrações específicas"],
  ["custom_architecture", "Arquitetura sob medida"],
] as const;
const emptyForm: Form = { name: "", slug: "", description: "", systemId: "", priceMonthly: "0", setupPrice: "0", billingPeriod: "MONTHLY", commercialModel: "SUBSCRIPTION", maintenancePrice: "", active: true };

function formatPlanPrice(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? `R$ ${amount.toFixed(2).replace(".", ",")}` : "—";
}

function MasterPlansPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [role, setRole] = useState<import("@/features/master/clients/services").NeroxaPlatformRole | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [products, setProducts] = useState<NeroxaProduct[]>([]);
  const [systems, setSystems] = useState<NeroxaSystem[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [planProducts, setPlanProducts] = useState<Record<string, string[]>>({});
  const [planFeatures, setPlanFeatures] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState<Form>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const access = await getNeroxaPlatformAccess();
      const staff = Boolean(access?.active);
      setAuthorized(staff);
      setRole(access?.active ? access.role : null);
      if (!staff) return;

      // The plan catalog is the primary payload for this screen. Render it first
      // instead of blocking the whole page on the secondary product/feature joins.
      const overview = await loadSubscriptionOverview();
      setPlans(overview.plans);
      setLoading(false);

      try {
        const [productData, systemData] = await Promise.all([listProducts(), listNeroxaSystems()]);
        setProducts(productData);
        setSystems(systemData);

        const productLinks = await Promise.all(productData.map(async (product) => [product.id, await listProductPlans(product.id)] as const));
        const productMap: Record<string, string[]> = {};
        for (const [productId, links] of productLinks) {
          for (const link of links.filter((item) => item.included)) {
            const plan = overview.plans.find((item) => item.id === link.plan_id);
            if (plan) {
              productMap[plan.id] = [
                ...(productMap[plan.id] ?? []),
                productData.find((item) => item.id === productId)?.name ?? "",
              ].filter(Boolean);
            }
          }
        }
        setPlanProducts(productMap);

        const featureRows = await Promise.all(
          overview.plans.map(async (plan) => [plan.id, await listPlanFeatures(plan.id)] as const),
        );
        setPlanFeatures(
          Object.fromEntries(featureRows.map(([planId, rows]) => [planId, rows.map((row) => row.feature_key)])),
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível carregar todos os detalhes dos planos.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os planos.");
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const startEdit = (plan: SubscriptionPlan) => {
    setError(null);
    setEditing(plan.id);
    setForm({
      name: plan.name,
      slug: plan.slug,
      description: plan.description ?? "",
      systemId: plan.system_id ?? "",
      priceMonthly: String(plan.base_price),
      setupPrice: String(plan.setup_price),
      billingPeriod: plan.billing_interval,
      commercialModel: plan.commercial_model,
      maintenancePrice: plan.maintenance_price == null ? "" : String(plan.maintenance_price),
      active: plan.active,
    });
    setSelectedProducts([]);
    setSelectedFeatures([]);
    void (async () => {
      try {
        const links = await Promise.all(products.map((product) => listProductPlans(product.id)));
        setSelectedProducts(
          products
            .filter((product, index) => links[index].some((link) => link.plan_id === plan.id && link.included))
            .map((product) => product.id),
        );
        const features = await listPlanFeatures(plan.id);
        setSelectedFeatures(features.filter((feature) => feature.enabled).map((feature) => feature.feature_key));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível carregar os produtos/recursos do plano.");
      }
    })();
  };

  const compatibleProducts = products.filter((product) => {
    if (!form.systemId || !product.system_id) return true;
    return product.system_id === form.systemId;
  });

  const handleDelete = async (plan: SubscriptionPlan) => {
    if (!window.confirm(`Excluir o plano "${plan.name}"? Esta ação não poderá ser desfeita.`)) return;
    setDeleting(plan.id);
    setError(null);
    try {
      await deletePlan(plan.id);
      if (editing === plan.id) {
        setEditing(null);
        setForm(emptyForm);
        setSelectedProducts([]);
        setSelectedFeatures([]);
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir o plano.");
    } finally {
      setDeleting(null);
    }
  };

  const save = async () => {
    if (!form.name.trim() || !form.slug.trim()) { setError("Informe nome e slug do plano."); return; }
    const priceMonthly = Number(form.priceMonthly);
    const setupPrice = Number(form.setupPrice);
    const maintenancePrice = form.commercialModel === "PERMANENT" ? Number(form.maintenancePrice) : null;
    if (!Number.isFinite(priceMonthly) || priceMonthly < 0 || !Number.isFinite(setupPrice) || setupPrice < 0 || (maintenancePrice !== null && (!Number.isFinite(maintenancePrice) || maintenancePrice < 0))) { setError("Informe valores válidos."); return; }
    const billingPeriod = form.commercialModel === "PERMANENT" ? "ONE_TIME" : form.billingPeriod;

    if (!window.confirm(editing ? `Salvar alterações no plano "${form.name}"?` : `Criar o plano "${form.name}"?`)) return;

    setSaving(true); setError(null);
    try {
      const planId = editing
        ? (await updatePlan({ id: editing, name: form.name, slug: form.slug, description: form.description, systemId: form.systemId || null, priceMonthly, setupPrice, billingPeriod, commercialModel: form.commercialModel, maintenancePrice, active: form.active }), editing)
        : (await createPlan({ name: form.name, slug: form.slug, description: form.description, systemId: form.systemId || null, priceMonthly, setupPrice, billingPeriod, commercialModel: form.commercialModel, maintenancePrice, active: form.active })).id;

      const currentLinks = await Promise.all(products.map((product) => listProductPlans(product.id)));
      await Promise.all(products.map((product, index) => {
        const linked = currentLinks[index].some((link) => link.plan_id === planId);
        const wanted = selectedProducts.includes(product.id);
        if (wanted) return setPlanProduct({ planId, productId: product.id, included: true });
        if (linked) return removePlanProduct(planId, product.id);
        return Promise.resolve();
      }));

      const currentFeatures = await listPlanFeatures(planId);
      const wantedFeatures = new Set(selectedFeatures);
      await Promise.all(FEATURE_OPTIONS.map(([featureKey]) =>
        wantedFeatures.has(featureKey)
          ? setPlanFeature({ planId, featureKey, enabled: true })
          : currentFeatures.some((feature) => feature.feature_key === featureKey)
            ? removePlanFeature(planId, featureKey)
            : Promise.resolve(),
      ));

      setEditing(null); setForm(emptyForm); setSelectedProducts([]); setSelectedFeatures([]); await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o plano.");
    } finally { setSaving(false); }
  };

  if (authorized === false) return <MasterLogin />;
  if (authorized === null || loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100"><Loader2 className="h-7 w-7 animate-spin" /></main>;

  return <MasterShell><div className="mx-auto w-full max-w-[1200px] space-y-5 px-3 py-4 sm:px-6 sm:py-5">
    <section className="min-w-0"><p className="text-xs font-medium tracking-wide text-muted-foreground/70">Gestão · Planos</p><h1 className="mt-1 font-display text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px] text-foreground">Planos</h1><p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">Gerencie catálogo, preços e disponibilidade para novas contratações.</p></section>
    {error && <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">{plans.map(plan => <Card key={plan.id} className="min-w-0 border-border bg-card p-4 shadow-soft sm:p-5"><div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2"><h2 className="min-w-0 break-words font-semibold">{plan.name}</h2><span className={plan.active ? "rounded-full bg-success/10 px-2 py-1 text-[10px] text-success" : "rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground"}>{plan.active ? "Ativo" : "Inativo"}</span></div><p className="mt-1 text-xs text-muted-foreground">{plan.slug} · {COMMERCIAL_MODEL_LABELS[plan.commercial_model]} · {BILLING_INTERVAL_LABELS[plan.billing_interval]}</p>{plan.description && <p className="mt-2 max-w-2xl whitespace-pre-line break-words text-sm leading-5 text-muted-foreground">{plan.description}</p>}</div>{canPerform(role,"managePlans") && <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto"><Button className="w-full sm:w-auto" variant="outline" size="sm" onClick={() => startEdit(plan)} disabled={deleting === plan.id}><Edit3 className="h-3.5 w-3.5" />Editar</Button><Button className="w-full sm:w-auto text-red-600 hover:text-red-700" onClick={() => void handleDelete(plan)} disabled={deleting === plan.id}>{deleting === plan.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Excluir</Button></div>}</div><div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3"><div className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{plan.commercial_model === "PERMANENT" ? "Aquisição" : plan.slug === "custom" ? "A partir de" : "Recorrência"}</p><p className="mt-1 font-semibold">{plan.commercial_model === "PERMANENT" ? formatPlanPrice(plan.base_price) : plan.slug === "custom" ? `A partir de ${formatPlanPrice(plan.base_price)}` : `R$ ${plan.base_price.toFixed(2).replace(".", ",")}`}</p></div><div className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{plan.commercial_model === "PERMANENT" ? "Manutenção" : plan.slug === "custom" ? "Implantação" : "Implantação"}</p><p className="mt-1 font-semibold">{plan.commercial_model === "PERMANENT" && plan.maintenance_price != null ? formatPlanPrice(plan.maintenance_price) : plan.slug === "custom" ? "Sob orçamento" : formatPlanPrice(plan.setup_price)}</p></div></div><div className="mt-4 rounded-xl border border-border/60 bg-muted/50/70 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Produtos incluídos</p><div className="mt-2 flex flex-wrap gap-1.5">{(planProducts[plan.id] ?? []).length ? (planProducts[plan.id] ?? []).map((product) => <span key={product} className="rounded-full bg-card px-2 py-1 text-xs text-muted-foreground ring-1 ring-border">{product}</span>) : <span className="text-xs text-muted-foreground/70">Nenhum produto vinculado</span>}</div><p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recursos</p><div className="mt-2 grid gap-1.5 sm:grid-cols-2">{(planFeatures[plan.id] ?? []).map((key) => <span key={key} className="text-xs text-muted-foreground">✓ {FEATURE_OPTIONS.find(([featureKey]) => featureKey === key)?.[1] ?? key}</span>)}</div></div></Card>)}</div>
      <Card className="h-fit min-w-0 border-border bg-card p-4 shadow-soft sm:p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-medium tracking-wide text-muted-foreground">{editing ? "Editar plano" : "Novo plano"}</p><h2 className="mt-1 text-lg font-semibold">{editing ? "Atualizar catálogo" : "Cadastrar plano"}</h2></div>{editing && <Button variant="ghost" size="icon" onClick={() => { setEditing(null); setForm(emptyForm); setSelectedProducts([]); setSelectedFeatures([]); }}><X className="h-4 w-4" /></Button>}</div><div className="mt-5 space-y-3">
        <Field label="Nome"><input value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="Ex.: Neroxa Essencial" /></Field>
        <Field label="Slug"><input value={form.slug} onChange={e => setForm({...form,slug:e.target.value})} placeholder="neroxa-essencial" /></Field>
        <Field label="Sistema-base / segmento">
          <select value={form.systemId} onChange={(e) => {
            const next = e.target.value;
            setForm({ ...form, systemId: next });
            const allowed = new Set(products.filter((product) => !next || !product.system_id || product.system_id === next).map((product) => product.id));
            setSelectedProducts((current) => current.filter((id) => allowed.has(id)));
          }}>
            <option value="">Sem sistema fixo (plano global)</option>
            {systems.filter((system) => system.active).map((system) => (
              <option key={system.id} value={system.id}>{system.name} · {system.system_type}</option>
            ))}
          </select>
        </Field>
        <Field label="Descrição"><textarea value={form.description} onChange={e => setForm({...form,description:e.target.value})} rows={3} /></Field>
        <Field label="Modelo comercial"><select value={form.commercialModel} onChange={e => { const commercialModel = e.target.value as Form["commercialModel"]; setForm({...form,commercialModel,billingPeriod: commercialModel === "PERMANENT" ? "ONE_TIME" : form.billingPeriod}); }}><option value="SUBSCRIPTION">Assinatura recorrente</option><option value="PERMANENT">Compra permanente</option></select></Field><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label={form.commercialModel === "PERMANENT" ? "Valor de aquisição" : "Recorrência"}><input type="number" min="0" step="0.01" value={form.priceMonthly} onChange={e => setForm({...form,priceMonthly:e.target.value})} /></Field><Field label="Implantação"><input type="number" min="0" step="0.01" value={form.setupPrice} onChange={e => setForm({...form,setupPrice:e.target.value})} /></Field></div>{form.commercialModel === "PERMANENT" && <Field label="Manutenção recorrente (opcional)"><input type="number" min="0" step="0.01" value={form.maintenancePrice} onChange={e => setForm({...form,maintenancePrice:e.target.value})} placeholder="Definir quando houver valor comercial" /></Field>}
        <div><p className="mb-1 text-xs font-medium text-muted-foreground">Produtos incluídos</p><p className="mb-2 text-[11px] leading-4 text-muted-foreground">O produto é a solução comercial. Aqui você define quais soluções entram neste plano.</p><div className="max-h-40 space-y-2 overflow-x-hidden overflow-y-auto rounded-lg border border-border p-3">{products.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum produto cadastrado.</p> : compatibleProducts.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum produto compatível com este sistema-base.</p> : compatibleProducts.map(product => <label key={product.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedProducts.includes(product.id)} onChange={e => setSelectedProducts(current => e.target.checked ? [...current, product.id] : current.filter(id => id !== product.id))}/><span className="min-w-0 truncate">{product.name}</span>{product.system_id && <Package className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/70"/>}</label>)}</div></div>
        <div className="mt-3"><p className="mb-1 text-xs font-medium text-muted-foreground">Recursos do plano</p><p className="mb-2 text-[11px] leading-4 text-muted-foreground">Recursos são capacidades da solução; eles não substituem o produto.</p><div className="max-h-56 space-y-2 overflow-x-hidden overflow-y-auto rounded-lg border border-border p-3">{FEATURE_OPTIONS.map(([key, label]) => <label key={key} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={selectedFeatures.includes(key)} onChange={(e) => setSelectedFeatures((current) => e.target.checked ? [...current, key] : current.filter((item) => item !== key))} /><span>{label}</span></label>)}</div></div>
        <Field label="Periodicidade"><select value={form.billingPeriod} disabled={form.commercialModel === "PERMANENT"} onChange={e => setForm({...form,billingPeriod:e.target.value as Form["billingPeriod"]})}><option value="MONTHLY">Mensal</option><option value="YEARLY">Anual</option><option value="ONE_TIME">Avulso</option></select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e => setForm({...form,active:e.target.checked})} /> Disponível para contratação</label>
        {canPerform(role,"managePlans") && <Button className="w-full" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar plano"}</Button>}
      </div></Card>
    </div>
  </div></MasterShell>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span><div className="[&_input]:h-10 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-border [&_input]:bg-muted/50 [&_input]:px-3 [&_input]:text-sm [&_textarea]:w-full [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-border [&_textarea]:bg-muted/50 [&_textarea]:px-3 [&_textarea]:py-2.5 [&_textarea]:text-sm [&_select]:h-10 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-border [&_select]:bg-card [&_select]:px-3 [&_select]:text-sm">{children}</div></label>; }

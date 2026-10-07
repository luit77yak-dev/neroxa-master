import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, ChevronDown, Edit3, Image as ImageIcon, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MasterShell } from "@/features/master/shell/MasterShell";
import { canPerform } from "@/features/master/permissions";
import { getNeroxaPlatformAccess, recordNeroxaAudit, type NeroxaPlatformRole } from "@/features/master/clients/services";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/master-catalogo")({ component: MasterCatalogo });

type Instance = {
  id: string;
  name: string;
  slug: string;
  status: string;
  organization_id: string;
};

type Category = {
  id: string;
  instance_id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  active: boolean;
};

type Product = {
  id: string;
  instance_id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  price: number | null;
  active: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
};

type ProductForm = {
  name: string;
  slug: string;
  categoryId: string;
  description: string;
  imageUrl: string;
  price: string;
  sortOrder: string;
  active: boolean;
  kind: "PIZZA" | "SIMPLE";
  featured: boolean;
  available: boolean;
  allowHalf: boolean;
};

const emptyProduct: ProductForm = {
  name: "", slug: "", categoryId: "", description: "", imageUrl: "", price: "0",
  sortOrder: "0", active: true, kind: "PIZZA", featured: false, available: true, allowHalf: false,
};

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function MasterCatalogo() {
  const [role, setRole] = useState<NeroxaPlatformRole | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [instanceId, setInstanceId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [categoryImage, setCategoryImage] = useState("");
  const [categoryOrder, setCategoryOrder] = useState("0");
  const [categoryActive, setCategoryActive] = useState(true);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const loadInstances = async () => {
    const { data, error } = await supabase.from("neroxa_system_instances" as never)
      .select("id,name,slug,status,organization_id").order("name", { ascending: true });
    if (error) throw new Error(error.message);
    const next = (data ?? []) as unknown as Instance[];
    setInstances(next.filter((item) => item.status !== "ARCHIVED"));
    if (!instanceId && next.length) setInstanceId(next.find((item) => item.status === "ACTIVE")?.id ?? next[0].id);
  };

  const loadCatalog = async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: categoryData, error: categoryError }, { data: productData, error: productError }] = await Promise.all([
        supabase.from("neroxa_storefront_categories" as never).select("*").eq("instance_id", id).order("sort_order").order("name"),
        supabase.from("neroxa_storefront_products" as never).select("*").eq("instance_id", id).order("sort_order").order("name"),
      ]);
      if (categoryError) throw new Error(categoryError.message);
      if (productError) throw new Error(productError.message);
      setCategories((categoryData ?? []) as unknown as Category[]);
      setProducts((productData ?? []) as unknown as Product[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o catálogo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void getNeroxaPlatformAccess().then((access) => setRole(access?.active ? access.role : null))
      .catch(() => setRole(null));
    void loadInstances().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as instâncias.");
      setLoading(false);
    });
  }, []);

  useEffect(() => { if (instanceId) void loadCatalog(instanceId); }, [instanceId]);

  const instance = instances.find((item) => item.id === instanceId);
  const productCounts = useMemo(() => new Map(categories.map((c) => [c.id, products.filter((p) => p.category_id === c.id).length])), [categories, products]);

  const resetCategory = () => {
    setEditingCategory(null); setCategoryName(""); setCategorySlug(""); setCategoryDescription("");
    setCategoryImage(""); setCategoryOrder("0"); setCategoryActive(true);
  };

  const saveCategory = async () => {
    if (!canPerform(role, "manageCatalog") || !instanceId) return;
    if (!categoryName.trim()) return setError("Informe o nome da categoria.");
    setSaving(true); setError(null);
    try {
      const payload = {
        instance_id: instanceId, name: categoryName.trim(), slug: slugify(categorySlug || categoryName),
        description: categoryDescription.trim() || null, image_url: categoryImage.trim() || null,
        sort_order: Number(categoryOrder) || 0, active: categoryActive, updated_at: new Date().toISOString(),
      };
      if (editingCategory) {
        const { error } = await supabase.from("neroxa_storefront_categories" as never).update(payload as never).eq("id", editingCategory);
        if (error) throw new Error(error.message);
        await recordNeroxaAudit({ action: "UPDATE", resourceType: "STOREFRONT_CATEGORY", resourceId: editingCategory, details: { instance_id: instanceId, name: payload.name } });
      } else {
        const { data, error } = await supabase.from("neroxa_storefront_categories" as never).insert(payload as never).select("id").single();
        if (error) throw new Error(error.message);
        await recordNeroxaAudit({ action: "CREATE", resourceType: "STOREFRONT_CATEGORY", resourceId: String((data as { id: string }).id), details: { instance_id: instanceId, name: payload.name } });
      }
      resetCategory(); await loadCatalog(instanceId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a categoria.");
    } finally { setSaving(false); }
  };

  const editCategory = (category: Category) => {
    setEditingCategory(category.id); setCategoryName(category.name); setCategorySlug(category.slug);
    setCategoryDescription(category.description ?? ""); setCategoryImage(category.image_url ?? "");
    setCategoryOrder(String(category.sort_order)); setCategoryActive(category.active);
  };

  const removeCategory = async (category: Category) => {
    if (!canPerform(role, "manageCatalog") || !window.confirm(`Excluir a categoria "${category.name}"? Os produtos ficarão sem categoria.`)) return;
    setError(null);
    try {
      const { error } = await supabase.from("neroxa_storefront_categories" as never).delete().eq("id", category.id);
      if (error) throw new Error(error.message);
      await recordNeroxaAudit({ action: "DELETE", resourceType: "STOREFRONT_CATEGORY", resourceId: category.id, details: { instance_id: instanceId, name: category.name } });
      if (editingCategory === category.id) resetCategory();
      await loadCatalog(instanceId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível excluir a categoria."); }
  };

  const resetProduct = () => { setEditingProduct(null); setProductForm(emptyProduct); };

  const saveProduct = async () => {
    if (!canPerform(role, "manageCatalog") || !instanceId) return;
    if (!productForm.name.trim()) return setError("Informe o nome do produto.");
    const price = Number(productForm.price);
    if (!Number.isFinite(price) || price < 0) return setError("Informe um preço válido.");
    setSaving(true); setError(null);
    try {
      const metadata = {
        kind: productForm.kind, featured: productForm.featured, available: productForm.available,
        allow_half: productForm.allowHalf,
      };
      const payload = {
        instance_id: instanceId, category_id: productForm.categoryId || null, name: productForm.name.trim(),
        slug: slugify(productForm.slug || productForm.name), description: productForm.description.trim() || null,
        image_url: productForm.imageUrl.trim() || null, price, sort_order: Number(productForm.sortOrder) || 0,
        active: productForm.active, metadata, updated_at: new Date().toISOString(),
      };
      if (editingProduct) {
        const { error } = await supabase.from("neroxa_storefront_products" as never).update(payload as never).eq("id", editingProduct);
        if (error) throw new Error(error.message);
        await recordNeroxaAudit({ action: "UPDATE", resourceType: "STOREFRONT_PRODUCT", resourceId: editingProduct, details: { instance_id: instanceId, name: payload.name } });
      } else {
        const { data, error } = await supabase.from("neroxa_storefront_products" as never).insert(payload as never).select("id").single();
        if (error) throw new Error(error.message);
        await recordNeroxaAudit({ action: "CREATE", resourceType: "STOREFRONT_PRODUCT", resourceId: String((data as { id: string }).id), details: { instance_id: instanceId, name: payload.name } });
      }
      resetProduct(); await loadCatalog(instanceId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o produto.");
    } finally { setSaving(false); }
  };

  const editProduct = (product: Product) => {
    const meta = product.metadata ?? {};
    setEditingProduct(product.id);
    setProductForm({
      name: product.name, slug: product.slug, categoryId: product.category_id ?? "", description: product.description ?? "",
      imageUrl: product.image_url ?? "", price: String(product.price ?? 0), sortOrder: String(product.sort_order),
      active: product.active, kind: meta.kind === "SIMPLE" ? "SIMPLE" : "PIZZA", featured: meta.featured === true,
      available: meta.available !== false, allowHalf: meta.allow_half === true,
    });
  };

  const removeProduct = async (product: Product) => {
    if (!canPerform(role, "manageCatalog") || !window.confirm(`Excluir o produto "${product.name}"?`)) return;
    setError(null);
    try {
      const { error } = await supabase.from("neroxa_storefront_products" as never).delete().eq("id", product.id);
      if (error) throw new Error(error.message);
      await recordNeroxaAudit({ action: "DELETE", resourceType: "STOREFRONT_PRODUCT", resourceId: product.id, details: { instance_id: instanceId, name: product.name } });
      if (editingProduct === product.id) resetProduct();
      await loadCatalog(instanceId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível excluir o produto."); }
  };

  if (!instance && !loading) {
    return <MasterShell><div className="mx-auto max-w-5xl px-3 py-6 sm:px-6"><Card className="p-8 text-center"><h1 className="text-xl font-semibold">Nenhuma instância disponível</h1><p className="mt-2 text-sm text-muted-foreground">Crie uma instância antes de cadastrar um catálogo.</p></Card></div></MasterShell>;
  }

  return <MasterShell><div className="mx-auto min-w-0 max-w-[1280px] space-y-5 overflow-x-hidden px-3 py-4 sm:px-6 sm:py-6">
    <section>
      <p className="text-xs font-medium tracking-wide text-muted-foreground/70">Gestão · Catálogo</p>
      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="font-display text-[28px] font-semibold tracking-tight sm:text-[34px]">Catálogo</h1><p className="mt-1 text-sm text-muted-foreground">Cadastre categorias e produtos de cada instância sem misturar os dados entre lojas.</p></div>
        <select value={instanceId} onChange={(e) => { resetCategory(); resetProduct(); setInstanceId(e.target.value); }} className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm font-medium sm:w-[360px]">
          {instances.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.slug}</option>)}
        </select>
      </div>
    </section>
    {error && <Card className="flex items-start justify-between gap-3 border-red-200 bg-red-50 p-4 text-sm text-red-700"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Fechar erro"><X className="h-4 w-4" /></button></Card>}
    {instance && <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
      <div className="min-w-0 space-y-4">
        <Card className="border-border bg-card p-4 shadow-soft sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Instância selecionada</p><h2 className="mt-1 text-lg font-semibold">{instance.name}</h2><p className="text-xs text-muted-foreground">{instance.slug} · {products.length} produtos · {categories.length} categorias</p></div><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">{instance.status}</span></div>
        </Card>

        {loading ? <Card className="grid min-h-40 place-items-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></Card> : categories.map((category) => {
          const open = expandedCategory === category.id;
          const categoryProducts = products.filter((p) => p.category_id === category.id);
          return <Card key={category.id} className="overflow-hidden border-border bg-card shadow-soft">
            <button type="button" onClick={() => setExpandedCategory(open ? null : category.id)} className="flex w-full items-center gap-3 p-4 text-left sm:p-5">
              {category.image_url ? <img src={category.image_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>}
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{category.name}</h3><span className={category.active ? "rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-700" : "rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground"}>{category.active ? "Ativa" : "Inativa"}</span></div><p className="mt-1 text-xs text-muted-foreground">{productCounts.get(category.id) ?? 0} produtos · ordem {category.sort_order}</p></div>
              <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && <div className="border-t border-border/60 p-3 sm:p-4">
              {category.description && <p className="mb-4 rounded-xl bg-muted/40 p-3 text-sm leading-5 text-muted-foreground">{category.description}</p>}
              <div className="space-y-2">{categoryProducts.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Nenhum produto nesta categoria.</p> : categoryProducts.map((product) => <div key={product.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-border/70 p-3">
                {product.image_url ? <img src={product.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">{product.name.charAt(0)}</div>}
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{product.name}</p>{product.metadata?.featured === true && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[9px] font-bold text-amber-700">Mais pedido</span>}</div><p className="mt-1 truncate text-xs text-muted-foreground">{money(product.price)} · {product.active ? "Ativo" : "Inativo"}</p></div>
                {canPerform(role, "manageCatalog") && <div className="flex shrink-0 gap-1"><button type="button" onClick={() => editProduct(product)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Editar ${product.name}`}><Edit3 className="h-4 w-4" /></button><button type="button" onClick={() => void removeProduct(product)} className="rounded-lg p-2 text-red-500 hover:bg-red-50" aria-label={`Excluir ${product.name}`}><Trash2 className="h-4 w-4" /></button></div>}
              </div>)}</div>
              {canPerform(role, "manageCatalog") && <button type="button" onClick={() => { resetProduct(); setProductForm((current) => ({ ...current, categoryId: category.id })); }} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground hover:bg-muted/40"><Plus className="h-4 w-4" />Adicionar produto nesta categoria</button>}
            </div>}
          </Card>;
        })}
        {categories.length === 0 && !loading && <Card className="p-8 text-center"><p className="font-medium">Comece criando a primeira categoria.</p><p className="mt-1 text-sm text-muted-foreground">Ex.: Pizzas, Burgers, Batatas, Bebidas.</p></Card>}
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        {canPerform(role, "manageCatalog") ? <Card className="border-border bg-card p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">{editingCategory ? "Editar categoria" : "Nova categoria"}</p><h2 className="mt-1 text-lg font-semibold">{editingCategory ? "Atualizar categoria" : "Cadastrar categoria"}</h2></div>{editingCategory && <Button variant="ghost" size="sm" onClick={resetCategory}>Cancelar</Button>}</div>
          <div className="mt-5 space-y-3">
            <Field label="Nome"><input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Ex.: Batatas" /></Field>
            <Field label="Slug"><input value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} placeholder="batatas" /></Field>
            <Field label="Descrição curta"><textarea rows={3} value={categoryDescription} onChange={(e) => setCategoryDescription(e.target.value)} placeholder="Acompanhamentos crocantes..." /></Field>
            <Field label="Imagem da categoria (URL)"><input value={categoryImage} onChange={(e) => setCategoryImage(e.target.value)} placeholder="https://..." /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Ordem"><input type="number" value={categoryOrder} onChange={(e) => setCategoryOrder(e.target.value)} /></Field><label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={categoryActive} onChange={(e) => setCategoryActive(e.target.checked)} /> Ativa</label></div>
            <Button className="min-h-11 w-full" onClick={() => void saveCategory()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingCategory ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{editingCategory ? "Salvar categoria" : "Cadastrar categoria"}</Button>
            <div className="border-t border-border/60 pt-3 space-y-2">{categories.map((category) => <div key={category.id} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-xs">{category.name}</span><button type="button" onClick={() => editCategory(category)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><Edit3 className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void removeCategory(category)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>
          </div>
        </Card> : <Card className="p-5"><p className="font-semibold">Modo consulta</p><p className="mt-1 text-sm text-muted-foreground">Seu perfil pode visualizar o catálogo, mas não alterá-lo.</p></Card>}

        {canPerform(role, "manageCatalog") && (editingProduct || productForm.name || productForm.categoryId) && <Card className="border-border bg-card p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">{editingProduct ? "Editar produto" : "Novo produto"}</p><h2 className="mt-1 text-lg font-semibold">{editingProduct ? "Atualizar item" : "Cadastrar item"}</h2></div><Button variant="ghost" size="sm" onClick={resetProduct}>Cancelar</Button></div>
          <div className="mt-5 space-y-3">
            <Field label="Nome"><input value={productForm.name} onChange={(e) => setProductForm((c) => ({ ...c, name: e.target.value }))} placeholder="Ex.: Batata da Casa" /></Field>
            <Field label="Slug"><input value={productForm.slug} onChange={(e) => setProductForm((c) => ({ ...c, slug: e.target.value }))} placeholder="batata-da-casa" /></Field>
            <Field label="Categoria"><select value={productForm.categoryId} onChange={(e) => setProductForm((c) => ({ ...c, categoryId: e.target.value }))}><option value="">Sem categoria</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Descrição"><textarea rows={3} value={productForm.description} onChange={(e) => setProductForm((c) => ({ ...c, description: e.target.value }))} placeholder="Descrição que aparecerá no cardápio." /></Field>
            <Field label="Imagem do produto (URL)"><input value={productForm.imageUrl} onChange={(e) => setProductForm((c) => ({ ...c, imageUrl: e.target.value }))} placeholder="https://..." /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Preço"><input type="number" min="0" step="0.01" value={productForm.price} onChange={(e) => setProductForm((c) => ({ ...c, price: e.target.value }))} /></Field><Field label="Ordem"><input type="number" value={productForm.sortOrder} onChange={(e) => setProductForm((c) => ({ ...c, sortOrder: e.target.value }))} /></Field></div>
            <div className="grid grid-cols-2 gap-2 text-xs"><label className="flex items-center gap-2 rounded-lg bg-muted/40 p-2"><input type="radio" checked={productForm.kind === "PIZZA"} onChange={() => setProductForm((c) => ({ ...c, kind: "PIZZA" }))} /> Pizza</label><label className="flex items-center gap-2 rounded-lg bg-muted/40 p-2"><input type="radio" checked={productForm.kind === "SIMPLE"} onChange={() => setProductForm((c) => ({ ...c, kind: "SIMPLE" }))} /> Item simples</label></div>
            <div className="grid grid-cols-2 gap-2 text-xs"><CheckField label="Ativo" checked={productForm.active} onChange={(v) => setProductForm((c) => ({ ...c, active: v }))} /><CheckField label="Disponível" checked={productForm.available} onChange={(v) => setProductForm((c) => ({ ...c, available: v }))} /><CheckField label="Mais pedido" checked={productForm.featured} onChange={(v) => setProductForm((c) => ({ ...c, featured: v }))} /><CheckField label="Permite meia" checked={productForm.allowHalf} onChange={(v) => setProductForm((c) => ({ ...c, allowHalf: v }))} /></div>
            <Button className="min-h-11 w-full" onClick={() => void saveProduct()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{editingProduct ? "Salvar produto" : "Cadastrar produto"}</Button>
          </div>
        </Card>}
      </div>
    </div>}
  </div></MasterShell>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span><div className="[&_input]:h-10 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-border [&_input]:bg-muted/50 [&_input]:px-3 [&_input]:text-sm [&_textarea]:w-full [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-border [&_textarea]:bg-muted/50 [&_textarea]:px-3 [&_textarea]:py-2.5 [&_select]:h-10 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-border [&_select]:bg-card [&_select]:px-3 [&_select]:text-sm">{children}</div></label>;
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2 rounded-lg bg-muted/40 p-2"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>;
}

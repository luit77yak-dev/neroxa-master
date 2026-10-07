import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Edit3, Loader2, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import {
  createNeroxaSystem,
  listNeroxaSystems,
  SYSTEM_TYPE_LABELS,
  SYSTEM_TYPES,
  type NeroxaSystem,
  type SystemType,
  updateNeroxaSystem,
  deleteNeroxaSystem,
} from "@/features/master/systems/services";
import { isNeroxaStaff } from "@/features/master/clients/services";
import { MasterShell } from "@/features/master/shell/MasterShell";

export const Route = createFileRoute("/master-sistemas")({
  component: MasterSistemas,
});

type FormState = {
  name: string;
  slug: string;
  systemType: SystemType;
  description: string;
  version: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  systemType: "CUSTOM",
  description: "",
  version: "1.0.0",
  active: true,
};

function MasterSistemas() {
  const [systems, setSystems] = useState<NeroxaSystem[]>([]);\n  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState<NeroxaSystem | null>(null);
  const [expandedSystem, setExpandedSystem] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const newSystemRef = useRef<HTMLElement | null>(null);
  const [showNewSystemMobile, setShowNewSystemMobile] = useState(false);

  async function load() {
    setLoading(true);
    setError("");

    try {
      if (!(await isNeroxaStaff())) {
        throw new Error("Acesso restrito à equipe Neroxa.");
      }
      setSystems(await listNeroxaSystems());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os sistemas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startEdit(system: NeroxaSystem) {
    setExpandedSystem(system.id);
    setEditing(system);
    setForm({
      name: system.name,
      slug: system.slug,
      systemType: system.system_type,
      description: system.description ?? "",
      version: system.version,
      active: system.active,
    });
  }

  function resetForm() {
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  async function handleDelete(system: NeroxaSystem) {
    if (!window.confirm(`Excluir o sistema "${system.name}"? Esta ação não poderá ser desfeita.`)) return;
    setDeleting(system.id);
    setError("");
    try {
      await deleteNeroxaSystem(system.id);
      if (editing?.id === system.id) resetForm();
      if (expandedSystem === system.id) setExpandedSystem(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir o sistema.");
    } finally {
      setDeleting(null);
    }
  }

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (editing) {
        await updateNeroxaSystem({ id: editing.id, ...form });
      } else {
        await createNeroxaSystem(form);
      }

      resetForm();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o sistema.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MasterShell>
      <div className="mx-auto min-w-0 max-w-7xl space-y-5 overflow-x-hidden p-3 sm:space-y-6 sm:p-6 lg:p-8">
        <header className="master-page-header flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground/70">Catálogo</p>
            <h1 className="mt-1 font-display text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px] text-foreground">Sistemas</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Sistemas-base da Neroxa. Cada produto pode usar um sistema-base, e cada cliente terá uma instância própria do sistema contratado.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { resetForm(); setShowNewSystemMobile((current) => !current); setTimeout(() => newSystemRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sidebar px-4 py-3 text-sm font-semibold text-white hover:bg-sidebar-accent sm:w-auto sm:min-h-10 sm:py-2.5"
          >
            <Plus className="h-4 w-4" />
            Novo sistema
          </button>
        </header>

        {showNewSystemMobile && (
          <section className="scroll-mt-20 rounded-xl border border-border bg-card p-4 shadow-soft lg:hidden"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium tracking-wide text-muted-foreground">Novo sistema</p><h2 className="mt-1 text-lg font-semibold text-foreground">Cadastrar sistema</h2></div><button type="button" onClick={() => { setShowNewSystemMobile(false); resetForm(); }} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Fechar novo sistema"><X className="h-4 w-4" /></button></div><form onSubmit={handleSubmit} className="mt-5 space-y-4"><SystemFormFields form={form} setForm={setForm} /><button type="submit" disabled={saving} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sidebar px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Salvando…" : "Cadastrar sistema"}</button></form></section>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-3">
            {loading ? (
              <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
                Carregando catálogo…
              </div>
            ) : systems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-input bg-card p-8 text-center">
                <p className="font-medium text-foreground">Nenhum sistema cadastrado.</p>
                <p className="mt-1 text-sm text-muted-foreground">Cadastre o primeiro produto-base da Neroxa.</p>
              </div>
            ) : (
              systems.map((system) => {
                const expanded = expandedSystem === system.id || editing?.id === system.id;
                return (
                  <article key={system.id} className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <button type="button" onClick={() => setExpandedSystem(expanded ? null : system.id)} className="min-w-0 flex-1 text-left">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <h2 className="break-words font-semibold text-foreground">{system.name}</h2>
                          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{SYSTEM_TYPE_LABELS[system.system_type]}</span>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${system.active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{system.active ? "Ativo" : "Inativo"}</span>
                        </div>
                        <p className="mt-1 break-all text-xs text-muted-foreground">/{system.slug} · v{system.version}</p>
                      </button>
                      <button type="button" onClick={() => setExpandedSystem(expanded ? null : system.id)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                        {expanded ? "Recolher" : "Detalhes"}
                      </button>
                    </div>
                    {expanded && (
                      <div className="mt-4 space-y-4 border-t border-border/60 pt-4">
                        <p className="text-sm leading-5 text-muted-foreground">{system.description || "Sem descrição."}</p>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => startEdit(system)} disabled={deleting === system.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"><Edit3 className="h-3.5 w-3.5" />Editar</button>
                          <button type="button" onClick={() => void handleDelete(system)} disabled={deleting === system.id} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">{deleting === system.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Excluir</button>
                        </div>
                        {editing?.id === system.id && (
                          <div className="rounded-xl border border-border bg-muted/30 p-4">
                            <div className="mb-4 flex items-center justify-between gap-3">
                              <div><p className="text-xs font-medium text-muted-foreground">Editando sistema</p><p className="font-semibold text-foreground">{system.name}</p></div>
                              <button type="button" onClick={resetForm} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Cancelar edição"><X className="h-4 w-4" /></button>
                            </div>
                            <SystemFormFields form={form} setForm={setForm} />
                            <label className="mt-4 flex items-center gap-2 text-sm text-foreground/80"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Sistema ativo</label>
                            <button type="button" onClick={() => void handleSubmit()} disabled={saving} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sidebar px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Salvando…" : "Salvar alterações"}</button>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            )}

            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar catálogo
            </button>
          </section>

          <aside ref={newSystemRef} className="hidden h-fit scroll-mt-24 rounded-xl border border-border bg-card p-5 shadow-soft lg:block">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground">Novo sistema</p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">Cadastrar sistema</h2>
              <p className="mt-1 text-xs text-muted-foreground">Cadastre somente o sistema-base técnico.</p>
            </div>
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <SystemFormFields form={form} setForm={setForm} />
              <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sidebar px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                <Save className="h-4 w-4" />{saving ? "Salvando…" : "Cadastrar sistema"}
              </button>
            </form>
          </aside>
        </div>
      </div>
    </MasterShell>
  );
}

function SystemFormFields({ form, setForm }: any) {
  return (
    <>
      <Field label="Nome"><input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} required className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none" placeholder="Neroxa Delivery" /></Field>
      <Field label="Slug"><input value={form.slug} onChange={(e: any) => setForm({ ...form, slug: e.target.value })} required className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none" placeholder="neroxa-delivery" /></Field>
      <Field label="Tipo"><select value={form.systemType} onChange={(e: any) => setForm({ ...form, systemType: e.target.value as SystemType })} className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground">{SYSTEM_TYPES.map((type) => <option key={type} value={type}>{SYSTEM_TYPE_LABELS[type]}</option>)}</select></Field>
      <Field label="Versão"><input value={form.version} onChange={(e: any) => setForm({ ...form, version: e.target.value })} className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none" placeholder="1.0.0" /></Field>
      <Field label="Descrição"><textarea value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} className="w-full min-h-24 resize-y rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none" /></Field>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-medium text-foreground/80"><span>{label}</span>{children}</label>;
}

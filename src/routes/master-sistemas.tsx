import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Plus, RefreshCw, Save, X } from "lucide-react";
import {
  createNeroxaSystem,
  isNeroxaStaff,
  listNeroxaSystems,
  SYSTEM_TYPE_LABELS,
  SYSTEM_TYPES,
  type NeroxaSystem,
  type SystemType,
  updateNeroxaSystem,
} from "@/features/master/systems/services";
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
  const [systems, setSystems] = useState<NeroxaSystem[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState<NeroxaSystem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Catálogo</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Sistemas</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Produtos-base da Neroxa. Cada cliente terá uma instância própria do sistema contratado.
            </p>
          </div>
          <button
            type="button"
            onClick={() => resetForm()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#102a2e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#16383d]"
          >
            <Plus className="h-4 w-4" />
            Novo sistema
          </button>
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-3">
            {loading ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
                Carregando catálogo…
              </div>
            ) : systems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <p className="font-medium text-slate-800">Nenhum sistema cadastrado.</p>
                <p className="mt-1 text-sm text-slate-500">Cadastre o primeiro produto-base da Neroxa.</p>
              </div>
            ) : (
              systems.map((system) => (
                <article
                  key={system.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-slate-900">{system.name}</h2>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                          {SYSTEM_TYPE_LABELS[system.system_type]}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${system.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                        >
                          {system.active ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">{system.description || "Sem descrição."}</p>
                      <p className="mt-2 text-xs text-slate-400">
                        slug: {system.slug} · versão {system.version}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startEdit(system)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Editar
                    </button>
                  </div>
                </article>
              ))
            )}

            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar catálogo
            </button>
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">{editing ? "Editar sistema" : "Novo sistema"}</h2>
                <p className="mt-1 text-xs text-slate-500">Cadastre somente o produto-base.</p>
              </div>
              {editing && (
                <button type="button" onClick={resetForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Cancelar edição">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <Field label="Nome">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-slate-400" placeholder="Neroxa Delivery" />
              </Field>
              <Field label="Slug">
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required className="field" placeholder="neroxa-delivery" />
              </Field>
              <Field label="Tipo">
                <select value={form.systemType} onChange={(e) => setForm({ ...form, systemType: e.target.value as SystemType })} className="field">
                  {SYSTEM_TYPES.map((type) => <option key={type} value={type}>{SYSTEM_TYPE_LABELS[type]}</option>)}
                </select>
              </Field>
              <Field label="Versão">
                <input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} className="field" placeholder="1.0.0" />
              </Field>
              <Field label="Descrição">
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full min-h-24 resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-slate-400" />
              </Field>
              {editing && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                  Sistema ativo
                </label>
              )}
              <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#102a2e] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                <Save className="h-4 w-4" />
                {saving ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar sistema"}
              </button>
            </form>
          </aside>
        </div>
      </div>
    </MasterShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

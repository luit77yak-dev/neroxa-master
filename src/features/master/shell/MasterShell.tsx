import { Link, useLocation } from "@tanstack/react-router";
import {
  BarChart3,
  BriefcaseBusiness,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Database,
  FolderKanban,
  Globe2,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getNeroxaPlatformAccess } from "@/features/master/clients/services";
import { supabase } from "@/integrations/supabase/client";
import { canAccessModule, moduleForPath, ROLE_LABELS } from "@/features/master/permissions";

type MasterShellProps = {
  children: ReactNode;
};

type NavItem = {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  active?: (pathname: string) => boolean;
  enabled?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Visão geral", to: "/master", icon: LayoutDashboard },
  { label: "Clientes", to: "/master-clientes", icon: Users },
  { label: "Sistemas", to: "/master-sistemas", icon: Package },
  { label: "Comercial", to: "/master-comercial", icon: BriefcaseBusiness },
  { label: "Planos", to: "/master-planos", icon: Package },
  { label: "Assinaturas", to: "/master-assinaturas", icon: CreditCard },
  { label: "Financeiro", to: "/master-financeiro", icon: BarChart3 },
  { label: "Produtos", to: "/master-produtos", icon: Package },
  { label: "Implantação", to: "/master-implantacao", icon: FolderKanban },
  { label: "Domínios", to: "/master-dominios", icon: Globe2 },
  { label: "Suporte", to: "/master-suporte", icon: CircleHelp },
  { label: "Configurações", to: "/master-configuracoes", icon: Settings },
];

export function MasterShell({ children }: MasterShellProps) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [role, setRole] = useState<import("@/features/master/clients/services").NeroxaPlatformRole | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void getNeroxaPlatformAccess().then((access) => {
      if (!mounted) return;
      setRole(access?.active ? access.role : null);
    }).catch(() => {
      if (mounted) setRole(null);
    }).finally(() => {
      if (mounted) setAccessLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const currentModule = moduleForPath(location.pathname);
  const allowed = canAccessModule(role, currentModule);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.assign("/master");
  };

  const isActive = (item: NavItem) =>
    item.active?.(location.pathname) ??
    (item.to === "/master" ? location.pathname === "/master" : location.pathname === item.to);

  if (accessLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-white" aria-label="Carregando permissões" />
      </main>
    );
  }

  if (!role || !allowed) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-slate-100">
        <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-center shadow-xl">
          <ShieldCheck className="mx-auto h-8 w-8 text-slate-300" />
          <h1 className="mt-4 text-lg font-semibold">Acesso restrito</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Seu perfil não possui permissão para acessar este módulo do Neroxa Master.
          </p>
          <Link
            to="/master"
            className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg bg-white px-4 text-sm font-medium text-[#102a2e] transition hover:bg-slate-100"
          >
            Voltar para a visão geral
          </Link>
        </section>
      </main>
    );
  }

  const currentItem = NAV_ITEMS.find((item) => item.enabled !== false && isActive(item));
  const sections: Array<{ title: string; items: NavItem[] }> = [
    { title: "Operação", items: NAV_ITEMS.slice(0, 3) },
    { title: "Gestão", items: NAV_ITEMS.slice(3, 9) },
    { title: "Sistema", items: NAV_ITEMS.slice(9) },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          <Link to="/master" onClick={() => setMobileOpen(false)} className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg border border-sidebar-primary/60 bg-sidebar-accent font-display text-base font-semibold text-sidebar-primary">
              N
            </span>
            <span className="leading-tight">
              <span className="block font-display text-[17px] font-semibold tracking-tight text-white">Neroxa</span>
              <span className="block text-[11px] tracking-wide text-sidebar-foreground/55">Master</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-2 text-sidebar-foreground/70 hover:bg-white/10 lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Navegação do Neroxa Master">
          {sections.map((section) => {
            const visible = section.items.filter((item) => canAccessModule(role, moduleForPath(item.to)));
            if (visible.length === 0) return null;
            return (
              <div key={section.title} className="mb-6 last:mb-0">
                <p className="px-3 pb-2 text-[11px] font-medium tracking-wide text-sidebar-foreground/45">
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {visible.map((item) => (
                    <MasterNavItem key={item.to} item={item} active={isActive(item)} onNavigate={() => setMobileOpen(false)} />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-primary ring-1 ring-sidebar-border">
              EN
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-white">Equipe Neroxa</p>
              <p className="truncate text-[11px] text-sidebar-foreground/55">{role ? ROLE_LABELS[role] : "Acesso interno"}</p>
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[1px] lg:hidden"
        />
      )}

      <div className="min-h-screen lg:pl-[264px]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:text-foreground lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <nav aria-label="Localização" className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-muted-foreground sm:inline">Neroxa Master</span>
              <ChevronRight className="hidden h-3.5 w-3.5 text-muted-foreground/60 sm:inline" />
              <span className="truncate font-medium text-foreground">{currentItem?.label ?? "Visão geral"}</span>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              <Database className="h-3.5 w-3.5" />
              Plataforma operacional
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition hover:border-foreground/20 hover:text-foreground"
              aria-label="Sair do Neroxa Master"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>

        <main className="min-h-[calc(100vh-64px)]">{children}</main>
      </div>
    </div>
  );
}

function MasterNavItem({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;

  if (item.enabled === false) {
    return (
      <div className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/40" title="Módulo em construção">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <span className="rounded-full border border-sidebar-border px-2 py-0.5 text-[10px]">Em breve</span>
      </div>
    );
  }

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className={`relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition ${
        active
          ? "bg-sidebar-accent font-medium text-white"
          : "text-sidebar-foreground/75 hover:bg-white/5 hover:text-white"
      }`}
    >
      {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sidebar-primary" />}
      <Icon className={`h-4 w-4 shrink-0 ${active ? "text-sidebar-primary" : ""}`} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </Link>
  );
}

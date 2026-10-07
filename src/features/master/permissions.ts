import type { NeroxaPlatformRole } from "@/features/master/clients/services";

export type MasterModule =
  | "overview"
  | "clients"
  | "systems"
  | "commercial"
  | "plans"
  | "subscriptions"
  | "finance"
  | "products"
  | "catalog"
  | "implementation"
  | "domains"
  | "support"
  | "settings";

const MODULE_ROLES: Record<MasterModule, NeroxaPlatformRole[]> = {
  overview: ["SUPER_ADMIN", "ADMIN", "FINANCE", "SUPPORT"],
  clients: ["SUPER_ADMIN", "ADMIN", "FINANCE", "SUPPORT"],
  systems: ["SUPER_ADMIN", "ADMIN", "SUPPORT"],
  commercial: ["SUPER_ADMIN", "ADMIN"],
  plans: ["SUPER_ADMIN", "ADMIN"],
  subscriptions: ["SUPER_ADMIN", "ADMIN", "FINANCE"],
  finance: ["SUPER_ADMIN", "FINANCE"],
  products: ["SUPER_ADMIN", "ADMIN"],
  catalog: ["SUPER_ADMIN", "ADMIN"],
  implementation: ["SUPER_ADMIN", "ADMIN", "SUPPORT"],
  domains: ["SUPER_ADMIN", "ADMIN", "SUPPORT"],
  support: ["SUPER_ADMIN", "ADMIN", "SUPPORT"],
  settings: ["SUPER_ADMIN", "ADMIN"],
};

export function canAccessModule(role: NeroxaPlatformRole | null | undefined, module: MasterModule) {
  return Boolean(role && MODULE_ROLES[module].includes(role));
}

export function canPerform(
  role: NeroxaPlatformRole | null | undefined,
  action:
    | "manageClients"
    | "manageCommercial"
    | "managePlans"
    | "manageProducts"
    | "manageCatalog"
    | "manageSubscriptions"
    | "manageFinance"
    | "manageSystems"
    | "manageSupport"
    | "manageSettings"
    | "viewAudit",
) {
  if (!role) return false;
  if (role === "SUPER_ADMIN") return true;
  const map = {
    manageClients: ["ADMIN"],
    manageCommercial: ["ADMIN"],
    managePlans: ["ADMIN"],
    manageProducts: ["ADMIN"],
    manageCatalog: ["ADMIN"],
    manageSubscriptions: ["ADMIN", "FINANCE"],
    manageFinance: ["FINANCE"],
    manageSystems: ["ADMIN", "SUPPORT"],
    manageSupport: ["ADMIN", "SUPPORT"],
    manageSettings: ["ADMIN"],
    viewAudit: ["ADMIN"],
  } as const;
  return (map[action] as readonly string[]).includes(role);
}

export const ROLE_LABELS: Record<NeroxaPlatformRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Administrador",
  FINANCE: "Financeiro",
  SUPPORT: "Suporte",
};

export function moduleForPath(pathname: string): MasterModule {
  if (pathname === "/master") return "overview";
  if (pathname === "/master-clientes") return "clients";
  if (pathname === "/master-sistemas") return "systems";
  if (pathname === "/master-comercial" || pathname === "/master-contratos") return "commercial";
  if (pathname === "/master-planos") return "plans";
  if (pathname === "/master-assinaturas") return "subscriptions";
  if (pathname === "/master-financeiro") return "finance";
  if (pathname === "/master-produtos") return "products";
  if (pathname === "/master-catalogo") return "catalog";
  if (pathname === "/master-implantacao") return "implementation";
  if (pathname === "/master-dominios") return "domains";
  if (pathname === "/master-suporte") return "support";
  return "settings";
}

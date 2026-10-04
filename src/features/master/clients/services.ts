import { supabase } from "@/integrations/supabase/client";
import type { ClientStatus, NeroxaClient, NeroxaClientContact } from "./types";

export type NeroxaPlatformRole = "SUPER_ADMIN" | "ADMIN" | "FINANCE" | "SUPPORT";

export type NeroxaPlatformAccess = {
  role: NeroxaPlatformRole;
  active: boolean;
};

export async function getNeroxaPlatformAccess(): Promise<NeroxaPlatformAccess | null> {
  const { data, error } = await supabase.rpc("get_neroxa_platform_access" as never);
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    role: String((row as { role: string }).role) as NeroxaPlatformRole,
    active: Boolean((row as { active: boolean }).active),
  };
}

export async function recordNeroxaAudit(input: {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  organizationId?: string | null;
  details?: Record<string, unknown>;
}) {
  const { data, error } = await supabase.rpc("record_neroxa_audit" as never, {
    p_action: input.action,
    p_resource_type: input.resourceType,
    p_resource_id: input.resourceId ?? null,
    p_organization_id: input.organizationId ?? null,
    p_details: input.details ?? {},
  } as never);
  if (error) throw new Error(error.message);
  return String(data);
}

export type NeroxaAuditLog = {
  id: string;
  actor_id: string | null;
  organization_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export async function listNeroxaAuditLogs(limit = 50): Promise<NeroxaAuditLog[]> {
  const { data, error } = await supabase
    .from("neroxa_audit_logs" as never)
    .select("id,actor_id,organization_id,action,resource_type,resource_id,details,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as NeroxaAuditLog[];
}

export async function isNeroxaStaff() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw new Error(userError.message);
  if (!user) return false;

  const { data, error } = await supabase
    .from("neroxa_platform_members" as never)
    .select("active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean((data as { active?: boolean } | null)?.active);
}

export async function listNeroxaClients() {
  const { data, error } = await supabase
    .from("neroxa_clients" as never)
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as NeroxaClient[];
}

export async function listNeroxaClientContacts(clientId: string) {
  const { data, error } = await supabase
    .from("neroxa_client_contacts" as never)
    .select("*")
    .eq("client_id", clientId)
    .eq("active", true)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as NeroxaClientContact[];
}

export async function createNeroxaClient(input: {
  legalName?: string;
  tradeName?: string;
  taxId?: string;
  notes?: string;
}) {
  const { data, error } = await supabase.rpc("create_neroxa_client" as never, {
    p_legal_name: input.legalName || null,
    p_trade_name: input.tradeName || null,
    p_tax_id: input.taxId || null,
    p_notes: input.notes || null,
  } as never);

  if (error) throw new Error(error.message);
  return data as unknown as string;
}

export async function updateNeroxaClient(input: {
  clientId: string;
  legalName?: string;
  tradeName?: string;
  taxId?: string;
  notes?: string;
}) {
  const { data, error } = await supabase.rpc("update_neroxa_client" as never, {
    p_client_id: input.clientId,
    p_legal_name: input.legalName || null,
    p_trade_name: input.tradeName || null,
    p_tax_id: input.taxId || null,
    p_notes: input.notes || null,
  } as never);

  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function transitionNeroxaClient(clientId: string, status: ClientStatus) {
  const { data, error } = await supabase.rpc("transition_neroxa_client_status" as never, {
    p_client_id: clientId,
    p_new_status: status,
  } as never);

  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function createNeroxaClientContact(input: {
  clientId: string;
  name: string;
  roleTitle?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  isPrimary?: boolean;
  notes?: string;
}) {
  const { data, error } = await supabase.rpc("create_neroxa_client_contact" as never, {
    p_client_id: input.clientId,
    p_name: input.name,
    p_role_title: input.roleTitle || null,
    p_email: input.email || null,
    p_phone: input.phone || null,
    p_whatsapp: input.whatsapp || null,
    p_is_primary: Boolean(input.isPrimary),
    p_notes: input.notes || null,
  } as never);

  if (error) throw new Error(error.message);
  return data as unknown as string;
}


export type NeroxaSystemInstance = {
  id: string;
  organization_id: string;
  plan_id: string | null;
  subscription_id: string | null;
  name: string;
  system_type: string;
  slug: string;
  status: "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
};

export type NeroxaSystemDomain = {
  id: string;
  system_instance_id: string;
  domain: string;
  is_primary: boolean;
  status: "PENDING" | "VERIFYING" | "VERIFIED" | "FAILED" | "DISABLED";
  verified_at: string | null;
};

export async function listNeroxaClientInstances(organizationId: string) {
  const { data, error } = await supabase
    .from("neroxa_system_instances" as never)
    .select("id, organization_id, plan_id, subscription_id, name, system_type, slug, status")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as NeroxaSystemInstance[];
}

export async function listNeroxaInstanceDomains(instanceId: string) {
  const { data, error } = await supabase
    .from("neroxa_system_domains" as never)
    .select("id, system_instance_id, domain, is_primary, status, verified_at")
    .eq("system_instance_id", instanceId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as NeroxaSystemDomain[];
}


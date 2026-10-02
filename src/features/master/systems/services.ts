import { supabase } from "@/integrations/supabase/client";

export const SYSTEM_TYPES = [
  "DELIVERY",
  "FOOD",
  "CLINIC",
  "BEAUTY",
  "BARBER",
  "FITNESS",
  "CUSTOM",
] as const;

export type SystemType = (typeof SYSTEM_TYPES)[number];

export type NeroxaSystem = {
  id: string;
  name: string;
  slug: string;
  system_type: SystemType;
  description: string | null;
  version: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type NeroxaSystemInstance = {
  id: string;
  organization_id: string;
  system_id: string | null;
  name: string;
  slug: string;
  status: "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
};

export const SYSTEM_TYPE_LABELS: Record<SystemType, string> = {
  DELIVERY: "Delivery",
  FOOD: "Food",
  CLINIC: "Clínica",
  BEAUTY: "Beleza",
  BARBER: "Barbearia",
  FITNESS: "Academia",
  CUSTOM: "Personalizado",
};

export async function listNeroxaSystems() {
  const { data, error } = await supabase
    .from("neroxa_systems" as never)
    .select("*")
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as NeroxaSystem[];
}

export async function createNeroxaSystem(input: {
  name: string;
  slug: string;
  systemType: SystemType;
  description?: string;
  version?: string;
}) {
  const normalizedSlug = input.slug.trim().toLowerCase();

  if (!input.name.trim() || !normalizedSlug) {
    throw new Error("Informe nome e slug do sistema.");
  }

  const { data, error } = await supabase
    .from("neroxa_systems" as never)
    .insert({
      name: input.name.trim(),
      slug: normalizedSlug,
      system_type: input.systemType,
      description: input.description?.trim() || null,
      version: input.version?.trim() || "1.0.0",
      active: true,
    } as never)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as NeroxaSystem;
}

export async function updateNeroxaSystem(input: {
  id: string;
  name: string;
  slug: string;
  systemType: SystemType;
  description?: string;
  version?: string;
  active: boolean;
}) {
  const { data, error } = await supabase
    .from("neroxa_systems" as never)
    .update({
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      system_type: input.systemType,
      description: input.description?.trim() || null,
      version: input.version?.trim() || "1.0.0",
      active: input.active,
    } as never)
    .eq("id", input.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as NeroxaSystem;
}

export async function listSystemInstances(systemId?: string) {
  let query = supabase
    .from("neroxa_system_instances" as never)
    .select("id, organization_id, system_id, name, slug, status")
    .order("created_at", { ascending: false });

  if (systemId) query = query.eq("system_id", systemId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as NeroxaSystemInstance[];
}

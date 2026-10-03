import { supabase } from "@/integrations/supabase/client";
import { recordNeroxaAudit } from "@/features/master/clients/services";

export type PlatformSettings = {
  name: string;
  timezone: string;
  currency: string;
  maintenance_mode: boolean;
};

export type SecuritySettings = {
  session_timeout_minutes: number;
  require_reauthentication_for_sensitive_actions: boolean;
};

const DEFAULT_PLATFORM: PlatformSettings = {
  name: "Neroxa",
  timezone: "America/Sao_Paulo",
  currency: "BRL",
  maintenance_mode: false,
};

const DEFAULT_SECURITY: SecuritySettings = {
  session_timeout_minutes: 480,
  require_reauthentication_for_sensitive_actions: true,
};

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await supabase
    .from("neroxa_platform_settings" as never)
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return ((data as { value?: T } | null)?.value ?? fallback) as T;
}

export async function getPlatformSettings() {
  return getSetting<PlatformSettings>("platform", DEFAULT_PLATFORM);
}

export async function getSecuritySettings() {
  return getSetting<SecuritySettings>("security", DEFAULT_SECURITY);
}

export async function updatePlatformSettings(settings: PlatformSettings) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!userData.user) throw new Error("Sessão expirada. Entre novamente.");

  const { error } = await supabase
    .from("neroxa_platform_settings" as never)
    .upsert({
      key: "platform",
      value: settings,
      updated_by_user_id: userData.user.id,
      updated_at: new Date().toISOString(),
    } as never);

  if (error) throw new Error(error.message);

  await recordNeroxaAudit({
    action: "PLATFORM_SETTINGS_UPDATED",
    resourceType: "platform_settings",
    resourceId: "platform",
    details: { keys: Object.keys(settings) },
  });
}

export async function updateSecuritySettings(settings: SecuritySettings) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!userData.user) throw new Error("Sessão expirada. Entre novamente.");

  const { error } = await supabase
    .from("neroxa_platform_settings" as never)
    .upsert({
      key: "security",
      value: settings,
      updated_by_user_id: userData.user.id,
      updated_at: new Date().toISOString(),
    } as never);

  if (error) throw new Error(error.message);

  await recordNeroxaAudit({
    action: "SECURITY_SETTINGS_UPDATED",
    resourceType: "platform_settings",
    resourceId: "security",
    details: { keys: Object.keys(settings) },
  });
}

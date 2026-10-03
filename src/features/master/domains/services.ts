import { supabase } from "@/integrations/supabase/client";

export type DomainStatus = "PENDING" | "VERIFYING" | "VERIFIED" | "FAILED" | "DISABLED";

export async function transitionDomainStatus(domainId: string, status: DomainStatus) {
  const { data, error } = await supabase.rpc("transition_neroxa_domain_status" as never, {
    p_domain_id: domainId,
    p_new_status: status,
  } as never);

  if (error) throw new Error(error.message);
  return String(data) as DomainStatus;
}

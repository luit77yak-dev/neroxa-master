import { supabase } from "@/integrations/supabase/client";

export type DomainStatus = "PENDING" | "VERIFYING" | "VERIFIED" | "FAILED" | "DISABLED";

export type DomainDnsValidation = {
  ok: boolean;
  domain: string;
  status?: string;
  reason?: string;
  message?: string;
  records?: {
    a: string[];
    cname: string[];
    nameservers: string[];
  };
  recommended?: {
    apexA: string;
    cname: string;
    nameservers: string[];
  };
};

export async function transitionDomainStatus(domainId: string, status: DomainStatus) {
  const { data, error } = await supabase.rpc("transition_neroxa_domain_status" as never, {
    p_domain_id: domainId,
    p_new_status: status,
  } as never);

  if (error) throw new Error(error.message);
  return String(data) as DomainStatus;
}

export async function validateDomainDns(domain: string): Promise<DomainDnsValidation> {
  const normalized = domain.trim().toLowerCase().replace(/^https?:\\/\\//, "").replace(/\\/$/, "");
  if (!normalized || normalized.includes("/") || normalized.includes(" ")) {
    throw new Error("Domínio inválido para validação DNS.");
  }

  const { data, error } = await supabase.functions.invoke("neroxa-verify-domain-dns", {
    body: { domain: normalized },
  });

  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") {
    throw new Error("A validação DNS retornou uma resposta inválida.");
  }

  return data as DomainDnsValidation;
}

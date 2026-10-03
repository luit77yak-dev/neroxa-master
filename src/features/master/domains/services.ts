import { supabase } from "@/integrations/supabase/client";

export type DomainStatus = "PENDING" | "VERIFYING" | "VERIFIED" | "FAILED" | "DISABLED";

export type DomainDnsVerification = {
  ok: boolean;
  domain: string;
  status: "VERCEL_DNS_VALID" | "INVALID_CONFIGURATION";
  records: { a: string[]; cname: string[]; nameservers: string[] };
  recommended: { apexA: string; cname: string; nameservers: string[] };
  message: string;
};

export async function transitionDomainStatus(domainId: string, status: DomainStatus) {
  const { data, error } = await supabase.rpc("transition_neroxa_domain_status" as never, {
    p_domain_id: domainId,
    p_new_status: status,
  } as never);

  if (error) throw new Error(error.message);
  return String(data) as DomainStatus;
}

export async function verifyDomainDns(domain: string) {
  const { data, error } = await supabase.functions.invoke<DomainDnsVerification>("neroxa-verify-domain-dns", {
    body: { domain },
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error("A verificação DNS não retornou dados.");
  return data;
}

export async function validateDomainDns(domainId: string, domain: string) {
  await transitionDomainStatus(domainId, "VERIFYING");
  try {
    const result = await verifyDomainDns(domain);
    await transitionDomainStatus(domainId, result.ok ? "VERIFIED" : "FAILED");
    return result;
  } catch (error) {
    try {
      await transitionDomainStatus(domainId, "FAILED");
    } catch {
      // Preserve the original verification error if the fallback transition also fails.
    }
    throw error;
  }
}

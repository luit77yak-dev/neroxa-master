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

export type DomainDnsCheck = {
  ok: boolean;
  hostname: string;
  recordType: "A" | "CNAME";
  expected: string;
  observed: string[];
  message: string;
};

function getExpectedDns(domain: string) {
  const hostname = domain.trim().toLowerCase().replace(/\.$/, "");
  const labels = hostname.split(".");
  const isApex = labels.length <= 2;
  return {
    hostname,
    recordType: isApex ? ("A" as const) : ("CNAME" as const),
    expected: isApex ? "76.76.21.21" : "cname.vercel-dns.com",
  };
}

export async function checkDomainDns(domain: string): Promise<DomainDnsCheck> {
  const target = getExpectedDns(domain);
  const type = target.recordType;
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(target.hostname)}&type=${type}`,
    { headers: { Accept: "application/dns-json" } },
  );

  if (!response.ok) {
    throw new Error("Não foi possível consultar o DNS público do domínio.");
  }

  const payload = (await response.json()) as {
    Answer?: Array<{ data?: string }>;
  };
  const observed = (payload.Answer ?? [])
    .map((answer) => answer.data?.trim().replace(/\.$/, ""))
    .filter((value): value is string => Boolean(value));

  const ok =
    type === "A"
      ? observed.includes(target.expected)
      : observed.some((value) => value.toLowerCase() === target.expected);

  return {
    ...target,
    observed,
    ok,
    message: ok
      ? "DNS compatível com a configuração recomendada pela Vercel."
      : `DNS ainda não aponta para ${target.expected}.`,
  };
}

export async function transitionDomainStatus(domainId: string, status: DomainStatus) {
  const { data, error } = await supabase.rpc("transition_neroxa_domain_status" as never, {
    p_domain_id: domainId,
    p_new_status: status,
  } as never);

  if (error) throw new Error(error.message);
  return String(data) as DomainStatus;
}

export async function validateDomainDns(domainId: string, domain: string): Promise<DomainDnsValidation> {
  const normalized = domain.trim().toLowerCase().replace(new RegExp("^https?://"), "").replace(new RegExp("/$"), "");
  if (!normalized || normalized.includes("/") || normalized.includes(" ")) {
    throw new Error("Domínio inválido para validação DNS.");
  }

  const { data, error } = await supabase.functions.invoke("neroxa-verify-domain-dns", {
    body: { domainId, domain: normalized },
  });

  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") {
    throw new Error("A validação DNS retornou uma resposta inválida.");
  }

  return data as DomainDnsValidation;
}


export function normalizeDomain(input: string) {
  const normalized = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!normalized || normalized.includes("/") || normalized.includes(" ")) {
    throw new Error("Informe um domínio válido, sem https:// ou caminhos.");
  }
  return normalized;
}

export async function createDomain(input: { instanceId: string; domain: string; isPrimary?: boolean }) {
  const normalized = normalizeDomain(input.domain);
  const { data, error } = await supabase
    .from("neroxa_system_domains" as never)
    .insert({ system_instance_id: input.instanceId, domain: normalized, is_primary: Boolean(input.isPrimary), status: "PENDING" } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function updateDomain(input: { domainId: string; domain: string; isPrimary?: boolean }) {
  const normalized = normalizeDomain(input.domain);
  const { error } = await supabase
    .from("neroxa_system_domains" as never)
    .update({ domain: normalized, is_primary: Boolean(input.isPrimary) } as never)
    .eq("id", input.domainId);
  if (error) throw new Error(error.message);
}

export async function deleteDomain(domainId: string) {
  const { error } = await supabase
    .from("neroxa_system_domains" as never)
    .delete()
    .eq("id", domainId);
  if (error) throw new Error(error.message);
}

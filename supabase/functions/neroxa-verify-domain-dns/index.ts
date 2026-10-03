import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type DnsAnswer = { data?: string; type?: number };
type DnsResponse = { Answer?: DnsAnswer[] };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const json = (body: unknown, status = 200, origin = "*") =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });

function normalizeDomain(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\.$/, "")
    .replace(/\/$/, "");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "*";

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, reason: "method_not_allowed", message: "Método não permitido." }, 405, origin);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, reason: "server_configuration", message: "Serviço de validação não configurado." }, 500, origin);
  }

  const authorization = req.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return json({ ok: false, reason: "unauthorized", message: "Autenticação obrigatória." }, 401, origin);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ ok: false, reason: "unauthorized", message: "Sessão inválida ou expirada." }, 401, origin);
  }

  const { data: hasRole, error: roleError } = await userClient.rpc("neroxa_has_platform_role", {
    p_roles: ["SUPER_ADMIN", "ADMIN", "SUPPORT"],
  });

  if (roleError || !hasRole) {
    return json({ ok: false, reason: "forbidden", message: "Sem permissão para validar domínios." }, 403, origin);
  }

  try {
    const body = await req.json();
    const domainId = String(body?.domainId ?? "").trim();
    const normalized = normalizeDomain(body?.domain);

    if (!domainId) {
      return json({ ok: false, reason: "invalid_domain_id", message: "Identificador do domínio é obrigatório." }, 400, origin);
    }

    if (!normalized || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalized)) {
      return json({ ok: false, reason: "invalid_domain", message: "Domínio inválido." }, 400, origin);
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: domainRow, error: domainError } = await serviceClient
      .from("neroxa_system_domains")
      .select("id,domain,status")
      .eq("id", domainId)
      .maybeSingle();

    if (domainError) throw new Error(domainError.message);
    if (!domainRow) {
      return json({ ok: false, reason: "domain_not_found", message: "Domínio não encontrado." }, 404, origin);
    }

    if (String(domainRow.domain).trim().toLowerCase().replace(/\.$/, "") !== normalized) {
      return json({ ok: false, reason: "domain_mismatch", message: "O domínio informado não corresponde ao cadastro." }, 400, origin);
    }

    if (domainRow.status !== "VERIFYING") {
      return json({ ok: false, reason: "invalid_status", message: "O domínio precisa estar em validação antes da consulta DNS." }, 409, origin);
    }

    const query = async (type: "A" | "CNAME" | "NS") => {
      const response = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(normalized)}&type=${type}`,
        { headers: { accept: "application/dns-json" } },
      );
      if (!response.ok) throw new Error(`Falha no resolvedor DNS (${response.status})`);
      return (await response.json()) as DnsResponse;
    };

    const [a, cname, ns] = await Promise.all([query("A"), query("CNAME"), query("NS")]);

    const aRecords = (a.Answer ?? [])
      .filter((x) => x.type === 1)
      .map((x) => x.data)
      .filter(Boolean) as string[];

    const cnameRecords = (cname.Answer ?? [])
      .filter((x) => x.type === 5)
      .map((x) => String(x.data).replace(/\.$/, "").toLowerCase())
      .filter(Boolean);

    const nsRecords = (ns.Answer ?? [])
      .filter((x) => x.type === 2)
      .map((x) => String(x.data).replace(/\.$/, "").toLowerCase())
      .filter(Boolean);

    const valid =
      aRecords.includes("76.76.21.21") ||
      cnameRecords.some((value) => value === "cname.vercel-dns.com" || value.endsWith(".vercel-dns.com")) ||
      nsRecords.some((value) => value.endsWith(".vercel-dns.com"));

    const { data: newStatus, error: resultError } = await serviceClient.rpc(
      "apply_neroxa_domain_validation_result",
      { p_domain_id: domainId, p_valid: valid },
    );

    if (resultError) throw new Error(resultError.message);

    return json({
      ok: valid,
      domain: normalized,
      domainId,
      status: newStatus,
      validationStatus: valid ? "VERCEL_DNS_VALID" : "INVALID_CONFIGURATION",
      records: { a: aRecords, cname: cnameRecords, nameservers: nsRecords },
      recommended: {
        apexA: "76.76.21.21",
        cname: "cname.vercel-dns.com",
        nameservers: ["ns1.vercel-dns.com", "ns2.vercel-dns.com"],
      },
      message: valid
        ? "O DNS do domínio aponta para a infraestrutura da Vercel."
        : "O DNS do domínio não aponta para a infraestrutura esperada da Vercel.",
    }, 200, origin);
  } catch (error) {
    return json({
      ok: false,
      reason: "dns_check_failed",
      message: error instanceof Error ? error.message : "Falha ao consultar DNS.",
    }, 502, origin);
  }
});

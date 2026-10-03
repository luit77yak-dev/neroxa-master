import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type DnsAnswer = { data?: string; type?: number };
type DnsResponse = { Answer?: DnsAnswer[] };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
    },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type" } });

  try {
    const { domain } = await req.json();
    const normalized = String(domain ?? "").trim().toLowerCase().replace(/\.$/, "");
    if (!normalized || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalized)) {
      return json({ ok: false, reason: "invalid_domain", message: "Domínio inválido." }, 400);
    }

    const query = async (type: "A" | "CNAME" | "NS") => {
      const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(normalized)}&type=${type}`, {
        headers: { accept: "application/dns-json" },
      });
      if (!response.ok) throw new Error(`Falha no resolvedor DNS (${response.status})`);
      return (await response.json()) as DnsResponse;
    };

    const [a, cname, ns] = await Promise.all([query("A"), query("CNAME"), query("NS")]);
    const aRecords = (a.Answer ?? []).filter((x) => x.type === 1).map((x) => x.data).filter(Boolean) as string[];
    const cnameRecords = (cname.Answer ?? []).filter((x) => x.type === 5).map((x) => String(x.data).replace(/\.$/, "").toLowerCase()).filter(Boolean);
    const nsRecords = (ns.Answer ?? []).filter((x) => x.type === 2).map((x) => String(x.data).replace(/\.$/, "").toLowerCase()).filter(Boolean);
    const valid = aRecords.includes("76.76.21.21") || cnameRecords.some((value) => value === "cname.vercel-dns.com" || value.endsWith(".vercel-dns.com")) || nsRecords.some((value) => value.endsWith(".vercel-dns.com"));

    return json({
      ok: valid,
      domain: normalized,
      status: valid ? "VERCEL_DNS_VALID" : "INVALID_CONFIGURATION",
      records: { a: aRecords, cname: cnameRecords, nameservers: nsRecords },
      recommended: { apexA: "76.76.21.21", cname: "cname.vercel-dns.com", nameservers: ["ns1.vercel-dns.com", "ns2.vercel-dns.com"] },
      message: valid ? "O DNS do domínio aponta para a infraestrutura da Vercel." : "O DNS do domínio não aponta para a infraestrutura esperada da Vercel.",
    });
  } catch (error) {
    return json({ ok: false, reason: "dns_check_failed", message: error instanceof Error ? error.message : "Falha ao consultar DNS." }, 502);
  }
});
import { supabase } from "@/integrations/supabase/client";
import { recordNeroxaAudit } from "@/features/master/clients/services";
import type { FinanceOverview, Invoice, InvoiceStatus, Payment } from "./types";

type BillingRow = {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  reference_month: string;
  amount: number | null;
  due_date: string;
  paid_at: string | null;
  status: string;
  payment_method: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
  gateway_provider: string | null;
  gateway_payment_id: string | null;
  gateway_status: string | null;
  gateway_event_id: string | null;
};

export async function loadFinanceOverview(): Promise<FinanceOverview> {
  const [billingResult, clientsResult] = await Promise.all([
    supabase.from("neroxa_billing_records" as never)
      .select("id,organization_id,subscription_id,reference_month,amount,due_date,paid_at,status,payment_method,external_id,created_at,updated_at,gateway_provider,gateway_payment_id,gateway_status,gateway_event_id")
      .order("due_date", { ascending: true }),
    supabase.from("neroxa_clients" as never)
      .select("id,legal_name,trade_name")
      .order("updated_at", { ascending: false }),
  ]);
  if (billingResult.error) throw new Error(billingResult.error.message);
  if (clientsResult.error) throw new Error(clientsResult.error.message);

  const rows = (billingResult.data ?? []) as unknown as BillingRow[];
  const subscriptionIds = [...new Set(rows.map((r) => r.subscription_id).filter(Boolean))] as string[];
  const [subscriptionsResult, auditsResult] = await Promise.all([
    subscriptionIds.length
      ? supabase.from("neroxa_subscriptions" as never)
          .select("id,plan_id,contract_id")
          .in("id", subscriptionIds)
      : Promise.resolve({ data: [], error: null }),
    rows.length
      ? supabase.from("neroxa_audit_logs" as never)
          .select("id,action,resource_type,resource_id,details,created_at")
          .eq("resource_type", "BILLING_RECORD")
          .in("resource_id", rows.map((r) => r.id))
          .order("created_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (subscriptionsResult.error) throw new Error(subscriptionsResult.error.message);
  if (auditsResult.error) throw new Error(auditsResult.error.message);

  const subscriptions = (subscriptionsResult.data ?? []) as unknown as { id:string; plan_id:string; contract_id:string|null }[];
  const planIds = [...new Set(subscriptions.map((s) => s.plan_id).filter(Boolean))];
  const contractIds = [...new Set(subscriptions.map((s) => s.contract_id).filter(Boolean))] as string[];
  const [plansResult, contractsResult] = await Promise.all([
    planIds.length ? supabase.from("neroxa_plans" as never).select("id,name,description,billing_period,commercial_model").in("id", planIds) : Promise.resolve({data:[],error:null}),
    contractIds.length ? supabase.from("neroxa_contracts" as never).select("id,contract_number,title,status,plan_id").in("id", contractIds) : Promise.resolve({data:[],error:null}),
  ]);
  if (plansResult.error) throw new Error(plansResult.error.message);
  if (contractsResult.error) throw new Error(contractsResult.error.message);

  const subscriptionMap = new Map(subscriptions.map((s) => [s.id, s]));
  const planMap = new Map((plansResult.data ?? []).map((p) => [String((p as {id:string}).id), p as unknown as Invoice["plan"]]));
  const contractMap = new Map((contractsResult.data ?? []).map((c) => [String((c as {id:string}).id), c as unknown as Invoice["contract"]]));
  const auditMap = new Map<string, Invoice["audits"]>();
  for (const audit of (auditsResult.data ?? []) as unknown as Invoice["audits"]) {
    if (!audit.resource_id) continue;
    auditMap.set(audit.resource_id, [...(auditMap.get(audit.resource_id) ?? []), audit]);
  }

  const statusMap: Record<string, InvoiceStatus> = { PENDING:"PENDING", PAID:"PAID", OVERDUE:"OVERDUE", CANCELLED:"CANCELLED", REFUNDED:"REFUNDED" };
  const invoices = rows.map((item) => {
    const subscription = item.subscription_id ? subscriptionMap.get(item.subscription_id) : undefined;
    return {
      id: String(item.id),
      client_id: String(item.organization_id),
      subscription_id: item.subscription_id ? String(item.subscription_id) : null,
      invoice_number: `NRX-${String(item.reference_month).slice(0, 7).replace("-", "")}-${String(item.id).slice(0, 6).toUpperCase()}`,
      status: statusMap[item.status] ?? "PENDING",
      issue_date: String(item.reference_month),
      due_date: String(item.due_date),
      paid_at: item.paid_at ?? null,
      subtotal: Number(item.amount ?? 0),
      discount_amount: 0,
      total_amount: Number(item.amount ?? 0),
      notes: item.external_id ? `Ref. ${item.external_id}` : null,
      updated_at: item.updated_at,
      payment_method: item.payment_method ?? null,
      external_id: item.external_id ?? null,
      gateway_provider: item.gateway_provider ?? null,
      gateway_payment_id: item.gateway_payment_id ?? null,
      gateway_status: item.gateway_status ?? null,
      gateway_event_id: item.gateway_event_id ?? null,
      contract: subscription?.contract_id ? contractMap.get(subscription.contract_id) ?? null : null,
      plan: subscription ? planMap.get(subscription.plan_id) ?? null : null,
      audits: auditMap.get(String(item.id)) ?? [],
    };
  });

  const payments: Payment[] = rows.filter((row) => row.status === "PAID" && row.paid_at).map((row) => ({
    id:String(row.id), invoice_id:String(row.id), client_id:String(row.organization_id), status:"CONFIRMED",
    method:row.payment_method ?? "Não informado", amount:Number(row.amount ?? 0), paid_at:row.paid_at,
    external_reference:row.external_id ?? null, notes:"Pagamento conciliado a partir do registro financeiro.",
    created_at:row.created_at, gateway_provider:row.gateway_provider ?? null,
    gateway_payment_id:row.gateway_payment_id ?? null, gateway_status:row.gateway_status ?? null,
  }));

  return { invoices, payments, clients:(clientsResult.data ?? []) as unknown as FinanceOverview["clients"] };
}

export async function registerBillingPayment(id: string, paymentMethod: string, externalId?: string | null) {
  const method = paymentMethod.trim();
  if (!method) throw new Error("Informe o método de pagamento.");
  const patch: Record<string, unknown> = {
    status: "PAID",
    paid_at: new Date().toISOString(),
    payment_method: method,
    external_id: externalId?.trim() || null,
  };
  const { data, error } = await supabase.from("neroxa_billing_records" as never)
    .update(patch as never)
    .eq("id", id)
    .in("status", ["PENDING", "OVERDUE"])
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Cobrança não encontrada, já liquidada ou sem permissão para registrar o pagamento.");
  await recordNeroxaAudit({
    action: "BILLING_PAYMENT_REGISTERED",
    resourceType: "BILLING_RECORD",
    resourceId: id,
    details: { status: "PAID", payment_method: method, external_id: externalId?.trim() || null, source: "FINANCE_ADMIN" },
  });
  return true;
}

export async function updateBillingStatus(id: string, status: "CANCELLED" | "REFUNDED") {
  if (status === "REFUNDED") {
    throw new Error("Estorno só pode ser realizado após a integração com o gateway de pagamentos.");
  }

  const patch: Record<string, unknown> = { status: "CANCELLED", paid_at: null };
  const { data, error } = await supabase.from("neroxa_billing_records" as never)
    .update(patch as never)
    .eq("id", id)
    .in("status", ["PENDING", "OVERDUE"])
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Cobrança não encontrada, já liquidada/cancelada ou sem permissão para cancelar.");

  await recordNeroxaAudit({
    action: "BILLING_STATUS_CHANGED",
    resourceType: "BILLING_RECORD",
    resourceId: id,
    details: { status: "CANCELLED", source: "FINANCE_ADMIN" },
  });
  return true;
}

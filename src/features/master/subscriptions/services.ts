import { supabase } from "@/integrations/supabase/client";
import { recordNeroxaAudit } from "@/features/master/clients/services";
import type { BillingInterval, SubscriptionOverview, SubscriptionStatus } from "./types";

type PlanRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
  system_id: string | null;
  billing_period: BillingInterval;
  price_monthly: number | null;
  setup_price: number | null;
  commercial_model: "SUBSCRIPTION" | "PERMANENT" | null;
  maintenance_price: number | null;
  gateway_provider: string | null;
  gateway_plan_id: string | null;
  gateway_status: string | null;
  gateway_synced_at: string | null;
};

type SubscriptionRow = {
  id: string;
  organization_id: string;
  plan_id: string;
  status: string;
  price: number | null;
  started_at: string | null;
  current_period_end: string | null;
  updated_at: string;
  gateway_provider: string | null;
  gateway_subscription_id: string | null;
  gateway_status: string | null;
  checkout_url: string | null;
  gateway_synced_at: string | null;
};

export async function loadSubscriptionOverview(): Promise<SubscriptionOverview> {
  const [plansResult, subscriptionsResult, clientsResult] = await Promise.all([
    supabase
      .from("neroxa_plans" as never)
      .select(
        "id,name,slug,description,active,system_id,billing_period,price_monthly,setup_price,commercial_model,maintenance_price,gateway_provider,gateway_plan_id,gateway_status,gateway_synced_at",
      )
      .order("active", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("neroxa_subscriptions" as never)
      .select(
        "id,organization_id,plan_id,status,price,started_at,current_period_end,updated_at,gateway_provider,gateway_subscription_id,gateway_status,checkout_url,gateway_synced_at",
      )
      .order("updated_at", { ascending: false }),
    supabase
      .from("neroxa_clients" as never)
      .select("id,legal_name,trade_name,status,active")
      .order("updated_at", { ascending: false }),
  ]);

  if (plansResult.error) throw new Error(plansResult.error.message);
  if (subscriptionsResult.error) throw new Error(subscriptionsResult.error.message);
  if (clientsResult.error) throw new Error(clientsResult.error.message);

  const plans = ((plansResult.data ?? []) as unknown as PlanRow[]).map((p) => ({
    id: String(p.id),
    name: String(p.name),
    slug: String(p.slug),
    description: p.description ?? null,
    active: Boolean(p.active),
    system_id: p.system_id ?? null,
    billing_interval: (p.billing_period === "ONE_TIME" ? "ONE_TIME" : p.billing_period) as BillingInterval,
    base_price: Number(p.price_monthly ?? 0),
    setup_price: Number(p.setup_price ?? 0),
    commercial_model: p.commercial_model === "PERMANENT" ? "PERMANENT" : "SUBSCRIPTION",
    maintenance_price: p.maintenance_price == null ? null : Number(p.maintenance_price),
    gateway_provider: p.gateway_provider ?? null,
    gateway_plan_id: p.gateway_plan_id ?? null,
    gateway_status: String(p.gateway_status ?? "NOT_CONFIGURED"),
    gateway_synced_at: p.gateway_synced_at ?? null,
  }));

  const planMap = new Map(plans.map((plan) => [plan.id, plan]));
  const statusMap: Record<string, SubscriptionStatus> = {
    TRIAL: "PENDING",
    ACTIVE: "ACTIVE",
    PAST_DUE: "DELINQUENT",
    PAUSED: "PAUSED",
    CANCELLED: "CANCELLED",
    EXPIRED: "EXPIRED",
  };

  const subscriptions = ((subscriptionsResult.data ?? []) as unknown as SubscriptionRow[]).map((s) => {
    const plan = planMap.get(String(s.plan_id));
    return {
      id: String(s.id),
      client_id: String(s.organization_id),
      contract_id: null,
      contract_version_id: null,
      plan_id: String(s.plan_id),
      status: statusMap[s.status] ?? "PENDING",
      billing_interval: plan?.billing_interval ?? "MONTHLY",
      contracted_recurring_value: Number(s.price ?? 0),
      contracted_setup_value: Number(plan?.setup_price ?? 0),
      started_at: s.started_at ?? null,
      next_billing_date: s.current_period_end ?? null,
      updated_at: s.updated_at,
      gateway_provider: s.gateway_provider ?? plan?.gateway_provider ?? null,
      gateway_subscription_id: s.gateway_subscription_id ?? null,
      gateway_status: s.gateway_status ?? null,
      checkout_url: s.checkout_url ?? null,
      gateway_synced_at: s.gateway_synced_at ?? null,
    };
  });

  return {
    plans,
    subscriptions,
    clients: (clientsResult.data ?? []) as unknown as SubscriptionOverview["clients"],
  };
}


export async function createSubscription(input: { organizationId: string; planId: string }) {
  const { data: client, error: clientError } = await supabase
    .from("neroxa_organizations" as never)
    .select("id,status,active")
    .eq("id", input.organizationId)
    .maybeSingle();

  if (clientError) throw new Error(clientError.message);
  if (!client) throw new Error("Cliente não encontrado ou sem permissão.");
  const clientRow = client as { id: string; status: string; active: boolean };
  if (!clientRow.active || clientRow.status === "CANCELLED") {
    throw new Error("Não é possível criar uma assinatura para um cliente inativo ou cancelado.");
  }
  if (["LEAD", "PROPOSAL", "NEGOTIATION"].includes(clientRow.status)) {
    throw new Error("O cliente ainda não está contratado. Avance o cliente até Contratado antes de criar a assinatura.");
  }

  const { data: plan, error: planError } = await supabase
    .from("neroxa_plans" as never)
    .select("id,name,active,commercial_model,price_monthly,setup_price,billing_period,system_id")
    .eq("id", input.planId)
    .maybeSingle();

  if (planError) throw new Error(planError.message);
  if (!plan) throw new Error("Plano não encontrado ou sem permissão.");
  const planRow = plan as {
    id: string; name: string; active: boolean; commercial_model: string;
    price_monthly: number; setup_price: number; billing_period: BillingInterval; system_id: string | null;
  };
  if (!planRow.active) throw new Error("O plano selecionado está inativo.");
  if (planRow.commercial_model !== "SUBSCRIPTION") {
    throw new Error("Este plano é de compra permanente e não pode gerar uma assinatura recorrente.");
  }
  if (planRow.billing_period === "ONE_TIME") {
    throw new Error("Planos avulsos não podem gerar uma assinatura recorrente.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("neroxa_subscriptions" as never)
    .select("id,status")
    .eq("organization_id", input.organizationId)
    .eq("plan_id", input.planId)
    .in("status", ["TRIAL", "ACTIVE", "PAUSED", "PAST_DUE"])
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing) {
    throw new Error("Este cliente já possui uma assinatura não encerrada para este plano.");
  }

  const now = new Date();
  const periodStart = now.toISOString();
  const periodEnd = new Date(now);
  if (planRow.billing_period === "YEARLY") {
    periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
  } else {
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  }

  const { data, error } = await supabase
    .from("neroxa_subscriptions" as never)
    .insert({
      organization_id: input.organizationId,
      plan_id: input.planId,
      status: "TRIAL",
      price: Number(planRow.price_monthly ?? 0),
      started_at: periodStart,
      current_period_start: periodStart,
      current_period_end: periodEnd.toISOString(),
      gateway_provider: null,
      gateway_status: "NOT_CONFIGURED",
    } as never)
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  const subscriptionId = (data as { id: string }).id;

  await recordNeroxaAudit({
    action: "SUBSCRIPTION_CREATED",
    resourceType: "SUBSCRIPTION",
    resourceId: subscriptionId,
    organizationId: input.organizationId,
    details: {
      planId: input.planId,
      planName: planRow.name,
      price: Number(planRow.price_monthly ?? 0),
      setupPrice: Number(planRow.setup_price ?? 0),
      billingPeriod: planRow.billing_period,
      periodStart: periodStart,
      periodEnd: periodEnd.toISOString(),
      firstChargeTiming: "NOW_WITH_EXTERNAL_PAYMENT_CONFIRMATION",
      systemId: planRow.system_id,
      status: "TRIAL",
    },
  });

  return subscriptionId;
}

export async function updateSubscriptionStatus(subscriptionId: string, status: "ACTIVE" | "PAUSED" | "CANCELLED") {
  const { data: subscription, error: subscriptionError } = await supabase
    .from("neroxa_subscriptions" as never)
    .select("id,plan_id,status")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (subscriptionError) throw new Error(subscriptionError.message);
  if (!subscription) throw new Error("Assinatura não encontrada ou sem permissão para alterar.");

  const row = subscription as { id: string; plan_id: string; status: string };
  const { data: plan, error: planError } = await supabase
    .from("neroxa_plans" as never)
    .select("id,name,active,commercial_model")
    .eq("id", row.plan_id)
    .maybeSingle();

  if (planError) throw new Error(planError.message);
  if (!plan) throw new Error("O plano da assinatura não foi encontrado.");

  const planRow = plan as { id: string; name: string; active: boolean; commercial_model: string };

  if (!planRow.active && status !== "CANCELLED") {
    throw new Error("Não é possível ativar ou reativar uma assinatura vinculada a um plano inativo. Reative o plano antes.");
  }

  if (planRow.commercial_model === "PERMANENT" && status !== "CANCELLED") {
    throw new Error("Planos de compra permanente não devem operar como assinatura recorrente. Use o fluxo de compra permanente.");
  }

  const { data, error } = await supabase
    .from("neroxa_subscriptions" as never)
    .update({ status } as never)
    .eq("id", subscriptionId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Assinatura não encontrada ou sem permissão para alterar.");

  await recordNeroxaAudit({
    action: "SUBSCRIPTION_STATUS_CHANGED",
    resourceType: "SUBSCRIPTION",
    resourceId: subscriptionId,
    details: { status, planId: row.plan_id },
  });
  return true;
}


export async function createPlan(input: { name: string; slug: string; description?: string; systemId?: string | null; priceMonthly: number; setupPrice: number; billingPeriod: "MONTHLY" | "YEARLY" | "ONE_TIME"; commercialModel: "SUBSCRIPTION" | "PERMANENT"; maintenancePrice?: number | null; active?: boolean }) {
  const { data, error } = await supabase
    .from("neroxa_plans" as never)
    .insert({
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      description: input.description?.trim() || null,
      system_id: input.systemId || null,
      price_monthly: input.priceMonthly,
      setup_price: input.setupPrice,
      billing_period: input.billingPeriod,
      commercial_model: input.commercialModel,
      maintenance_price: input.maintenancePrice ?? null,
      active: input.active ?? true,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const planId = (data as { id: string }).id;
  await recordNeroxaAudit({
    action: "PLAN_CREATED",
    resourceType: "PLAN",
    resourceId: planId,
    details: { name: input.name, slug: input.slug, commercialModel: input.commercialModel, active: input.active ?? true },
  });
  return data;
}

export async function updatePlan(input: { id: string; name: string; slug: string; description?: string; systemId?: string | null; priceMonthly: number; setupPrice: number; billingPeriod: "MONTHLY" | "YEARLY" | "ONE_TIME"; commercialModel: "SUBSCRIPTION" | "PERMANENT"; maintenancePrice?: number | null; active: boolean }) {
  const { data, error } = await supabase
    .from("neroxa_plans" as never)
    .update({
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      description: input.description?.trim() || null,
      system_id: input.systemId || null,
      price_monthly: input.priceMonthly,
      setup_price: input.setupPrice,
      billing_period: input.billingPeriod,
      commercial_model: input.commercialModel,
      maintenance_price: input.maintenancePrice ?? null,
      active: input.active,
    } as never)
    .eq("id", input.id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Plano não encontrado ou sem permissão para alterar.");
  await recordNeroxaAudit({
    action: "PLAN_UPDATED",
    resourceType: "PLAN",
    resourceId: input.id,
    details: { name: input.name, slug: input.slug, commercialModel: input.commercialModel, active: input.active },
  });
  return true;
}


export async function deletePlan(planId: string) {
  const { error } = await supabase
    .from("neroxa_plans" as never)
    .delete()
    .eq("id", planId);

  if (error) {
    if (error.code === "23503") {
      throw new Error("Este plano já está sendo usado por assinaturas, instâncias ou outros registros e não pode ser excluído. Desative-o para impedir novas contratações.");
    }
    throw new Error(error.message);
  }

  await recordNeroxaAudit({
    action: "PLAN_DELETED",
    resourceType: "PLAN",
    resourceId: planId,
    details: {},
  });

  return true;
}


export type NeroxaPlanFeature = {
  id: string;
  plan_id: string;
  feature_key: string;
  enabled: boolean;
  limit_value: number | null;
};

export async function listPlanFeatures(planId: string): Promise<NeroxaPlanFeature[]> {
  const { data, error } = await supabase
    .from("neroxa_plan_features" as never)
    .select("id,plan_id,feature_key,enabled,limit_value")
    .eq("plan_id", planId)
    .eq("enabled", true)
    .order("feature_key", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as NeroxaPlanFeature[];
}

export async function setPlanFeature(input: { planId: string; featureKey: string; enabled?: boolean }) {
  await removePlanFeature(input.planId, input.featureKey);
  const { error } = await supabase
    .from("neroxa_plan_features" as never)
    .insert({ plan_id: input.planId, feature_key: input.featureKey, enabled: input.enabled ?? true } as never);
  if (error) throw new Error(error.message);
}

export async function removePlanFeature(planId: string, featureKey: string) {
  const { error } = await supabase
    .from("neroxa_plan_features" as never)
    .delete()
    .eq("plan_id", planId)
    .eq("feature_key", featureKey);
  if (error) throw new Error(error.message);
}

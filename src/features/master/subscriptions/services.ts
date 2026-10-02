import { supabase } from "@/integrations/supabase/client";
import type { BillingInterval, SubscriptionOverview, SubscriptionStatus } from "./types";

type PlanRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
  billing_period: BillingInterval;
  price_monthly: number | null;
  setup_price: number | null;
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
        "id,name,slug,description,active,billing_period,price_monthly,setup_price,gateway_provider,gateway_plan_id,gateway_status,gateway_synced_at",
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
      .select("id,legal_name,trade_name")
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
    billing_interval: (p.billing_period === "ONE_TIME" ? "ONE_TIME" : p.billing_period) as BillingInterval,
    base_price: Number(p.price_monthly ?? 0),
    setup_price: Number(p.setup_price ?? 0),
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


export async function updateSubscriptionStatus(subscriptionId: string, status: "ACTIVE" | "PAUSED" | "CANCELLED") {
  const { data, error } = await supabase
    .from("neroxa_subscriptions" as never)
    .update({ status } as never)
    .eq("id", subscriptionId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Assinatura não encontrada ou sem permissão para alterar.");
  return true;
}


export async function createPlan(input: { name: string; slug: string; description?: string; priceMonthly: number; setupPrice: number; billingPeriod: "MONTHLY" | "YEARLY" | "ONE_TIME"; active?: boolean }) {
  const { data, error } = await supabase
    .from("neroxa_plans" as never)
    .insert({
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      description: input.description?.trim() || null,
      price_monthly: input.priceMonthly,
      setup_price: input.setupPrice,
      billing_period: input.billingPeriod,
      active: input.active ?? true,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updatePlan(input: { id: string; name: string; slug: string; description?: string; priceMonthly: number; setupPrice: number; billingPeriod: "MONTHLY" | "YEARLY" | "ONE_TIME"; active: boolean }) {
  const { data, error } = await supabase
    .from("neroxa_plans" as never)
    .update({
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      description: input.description?.trim() || null,
      price_monthly: input.priceMonthly,
      setup_price: input.setupPrice,
      billing_period: input.billingPeriod,
      active: input.active,
    } as never)
    .eq("id", input.id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Plano não encontrado ou sem permissão para alterar.");
  return true;
}

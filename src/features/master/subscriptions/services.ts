import { supabase } from "@/integrations/supabase/client";
import type { SubscriptionOverview } from "./types";

export async function loadSubscriptionOverview(): Promise<SubscriptionOverview> {
  const [plansResult, subscriptionsResult, clientsResult] = await Promise.all([
    supabase.from("neroxa_plans" as never).select("id,name,slug,description,active,billing_period,price_monthly,setup_price").order("active", { ascending: false }).order("name", { ascending: true }),
    supabase.from("neroxa_subscriptions" as never).select("id,organization_id,plan_id,status,price,started_at,current_period_end,updated_at").order("updated_at", { ascending: false }),
    supabase.from("neroxa_clients" as never).select("id,legal_name,trade_name").order("updated_at", { ascending: false }),
  ]);

  if (plansResult.error) throw new Error(plansResult.error.message);
  if (subscriptionsResult.error) throw new Error(subscriptionsResult.error.message);
  if (clientsResult.error) throw new Error(clientsResult.error.message);

  const plans = (plansResult.data ?? []).map((row) => {
    const p = row as any;
    return {
      id: String(p.id),
      name: String(p.name),
      slug: String(p.slug),
      description: p.description ?? null,
      active: Boolean(p.active),
      billing_interval: (p.billing_period === "ONE_TIME" ? "ONE_TIME" : p.billing_period) as any,
      base_price: Number(p.price_monthly ?? 0),
      setup_price: Number(p.setup_price ?? 0),
    };
  });

  const planMap = new Map(plans.map((plan) => [plan.id, plan]));
  const statusMap: Record<string, any> = {
    TRIAL: "PENDING",
    ACTIVE: "ACTIVE",
    PAST_DUE: "DELINQUENT",
    PAUSED: "PAUSED",
    CANCELLED: "CANCELLED",
    EXPIRED: "EXPIRED",
  };

  const subscriptions = (subscriptionsResult.data ?? []).map((row) => {
    const s = row as any;
    const plan = planMap.get(String(s.plan_id));
    return {
      id: String(s.id),
      client_id: String(s.organization_id),
      contract_id: null,
      contract_version_id: null,
      plan_id: String(s.plan_id),
      status: statusMap[s.status] ?? "PENDING",
      billing_interval: (plan?.billing_interval ?? "MONTHLY") as any,
      contracted_recurring_value: Number(s.price ?? 0),
      contracted_setup_value: Number(plan?.setup_price ?? 0),
      started_at: s.started_at ?? null,
      next_billing_date: s.current_period_end ?? null,
      updated_at: s.updated_at,
    };
  });

  return {
    plans: plans as any,
    subscriptions: subscriptions as any,
    clients: (clientsResult.data ?? []) as any,
  };
}

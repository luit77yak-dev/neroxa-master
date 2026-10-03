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
  const periodStartTimestamp = now.toISOString();
  const periodStartDate = periodStartTimestamp.slice(0, 10);
  const periodEnd = calculateNextPeriodEnd(periodStartDate, planRow.billing_period);
  const recurringPrice = Number(planRow.price_monthly ?? 0);
  const referenceMonth = `${periodStartDate.slice(0, 7)}-01`;

  const { data, error } = await supabase
    .from("neroxa_subscriptions" as never)
    .insert({
      organization_id: input.organizationId,
      plan_id: input.planId,
      status: "TRIAL",
      price: recurringPrice,
      started_at: periodStartTimestamp,
      current_period_start: periodStartDate,
      current_period_end: periodEnd,
      gateway_provider: null,
      gateway_status: "NOT_CONFIGURED",
    } as never)
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  const subscriptionId = (data as { id: string }).id;

  const { error: billingError } = await supabase
    .from("neroxa_billing_records" as never)
    .insert({
      organization_id: input.organizationId,
      subscription_id: subscriptionId,
      reference_month: referenceMonth,
      amount: recurringPrice,
      due_date: periodStartDate,
      status: "PENDING",
      payment_method: null,
      external_id: null,
      gateway_provider: null,
      gateway_payment_id: null,
      gateway_status: "PENDING",
      gateway_event_id: null,
    } as never);

  if (billingError) {
    await supabase
      .from("neroxa_subscriptions" as never)
      .delete()
      .eq("id", subscriptionId);
    throw new Error(`A assinatura não foi criada porque a primeira cobrança não pôde ser registrada: ${billingError.message}`);
  }

  await recordNeroxaAudit({
    action: "SUBSCRIPTION_CREATED",
    resourceType: "SUBSCRIPTION",
    resourceId: subscriptionId,
    organizationId: input.organizationId,
    details: {
      planId: input.planId,
      planName: planRow.name,
      price: recurringPrice,
      setupPrice: Number(planRow.setup_price ?? 0),
      billingPeriod: planRow.billing_period,
      periodStart: periodStartDate,
      periodEnd,
      firstChargeTiming: "CREATED_AS_PENDING_DUE_ON_PERIOD_START",
      firstBillingReferenceMonth: referenceMonth,
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
  const currentStatus = row.status;

  if (currentStatus === "CANCELLED" || currentStatus === "EXPIRED") {
    throw new Error("Esta assinatura já foi encerrada e não pode receber novas transições.");
  }

  if (currentStatus === "TRIAL" && status !== "ACTIVE" && status !== "CANCELLED") {
    throw new Error("Uma assinatura pendente só pode ser ativada após o primeiro pagamento ou cancelada.");
  }

  if (currentStatus === "ACTIVE" && status !== "PAUSED" && status !== "CANCELLED") {
    throw new Error("Uma assinatura ativa só pode ser pausada ou cancelada.");
  }

  if (currentStatus === "PAUSED" && status !== "ACTIVE" && status !== "CANCELLED") {
    throw new Error("Uma assinatura pausada só pode ser reativada ou cancelada.");
  }

  if (currentStatus === "PAST_DUE" && status !== "CANCELLED" && status !== "ACTIVE") {
    throw new Error("Uma assinatura inadimplente só pode ser regularizada após pagamento ou cancelada.");
  }

  if (currentStatus === "TRIAL" && status === "ACTIVE") {
    const { data: firstBilling, error: billingError } = await supabase
      .from("neroxa_billing_records" as never)
      .select("id,status,paid_at,due_date")
      .eq("subscription_id", subscriptionId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (billingError) throw new Error(billingError.message);
    if (!firstBilling || (firstBilling as { status: string }).status !== "PAID" || !(firstBilling as { paid_at: string | null }).paid_at) {
      throw new Error("A primeira cobrança precisa estar paga antes de ativar a assinatura.");
    }
  }

  if (currentStatus === "PAST_DUE" && status === "ACTIVE") {
    const { data: billing, error: billingError } = await supabase
      .from("neroxa_billing_records" as never)
      .select("id,status,paid_at")
      .eq("subscription_id", subscriptionId)
      .order("due_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (billingError) throw new Error(billingError.message);
    if (!billing || (billing as { status: string }).status !== "PAID" || !(billing as { paid_at: string | null }).paid_at) {
      throw new Error("A cobrança em atraso precisa estar paga antes de regularizar a assinatura.");
    }
  }

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

  if (currentStatus === status) {
    return true;
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
    details: {
      previousStatus: currentStatus,
      status,
      planId: row.plan_id,
    },
  });

  return true;
}


type BillingRecordRow = {
  id: string;
  subscription_id: string;
  organization_id: string;
  reference_month: string;
  amount: number;
  due_date: string;
  status: string;
  paid_at: string | null;
};

export function calculateNextPeriodEnd(periodStart: string, billingPeriod: BillingInterval) {
  const start = new Date(`${periodStart}T00:00:00.000Z`);
  const originalDay = start.getUTCDate();

  if (billingPeriod === "YEARLY") {
    start.setUTCFullYear(start.getUTCFullYear() + 1);
    return start.toISOString().slice(0, 10);
  }

  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() + 1);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  ).getUTCDate();
  start.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));

  return start.toISOString().slice(0, 10);
}

export function shouldMarkBillingOverdue(status: string, dueDate: string, today: string) {
  return status === "PENDING" && dueDate <= today;
}

export function shouldMarkSubscriptionPastDue(subscriptionStatus: string, billingDueDate: string, today: string) {
  return subscriptionStatus === "ACTIVE" && billingDueDate <= today;
}

export function canCreateRenewalBilling(subscriptionStatus: string, periodEnd: string | null, today: string) {
  return subscriptionStatus === "ACTIVE" && !!periodEnd && periodEnd <= today;
}

export function isFinalSubscriptionStatus(status: string) {
  return status === "CANCELLED" || status === "EXPIRED";
}

export async function confirmBillingPayment(billingId: string) {
  const { data: billing, error: billingError } = await supabase
    .from("neroxa_billing_records" as never)
    .select("id,subscription_id,organization_id,reference_month,amount,due_date,status,paid_at")
    .eq("id", billingId)
    .maybeSingle();

  if (billingError) throw new Error(billingError.message);
  if (!billing) throw new Error("Cobrança não encontrada ou sem permissão para alterar.");

  const row = billing as BillingRecordRow;
  if (row.status === "PAID") return true;
  if (row.status === "CANCELLED" || row.status === "REFUNDED") {
    throw new Error("Esta cobrança já foi encerrada e não pode ser paga.");
  }

  const paidAt = new Date().toISOString();
  const { data: updatedBilling, error: updateError } = await supabase
    .from("neroxa_billing_records" as never)
    .update({
      status: "PAID",
      paid_at: paidAt,
      gateway_status: "PAID",
    } as never)
    .eq("id", billingId)
    .select("id")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!updatedBilling) throw new Error("A cobrança não pôde ser marcada como paga.");

  const { data: subscription, error: subscriptionError } = await supabase
    .from("neroxa_subscriptions" as never)
    .select("id,plan_id,status,current_period_start,current_period_end,price")
    .eq("id", row.subscription_id)
    .maybeSingle();

  if (subscriptionError) throw new Error(subscriptionError.message);
  if (!subscription) throw new Error("A assinatura vinculada à cobrança não foi encontrada.");

  const subscriptionRow = subscription as {
    id: string;
    plan_id: string;
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
    price: number | null;
  };

  const { data: plan, error: planError } = await supabase
    .from("neroxa_plans" as never)
    .select("id,billing_period,commercial_model,active")
    .eq("id", subscriptionRow.plan_id)
    .maybeSingle();

  if (planError) throw new Error(planError.message);
  if (!plan) throw new Error("O plano da assinatura não foi encontrado.");

  const planRow = plan as {
    id: string;
    billing_period: BillingInterval;
    commercial_model: string;
    active: boolean;
  };

  if (planRow.commercial_model !== "SUBSCRIPTION") {
    throw new Error("A cobrança pertence a um plano que não opera como assinatura recorrente.");
  }

  if (subscriptionRow.status === "TRIAL") {
    const { error } = await supabase
      .from("neroxa_subscriptions" as never)
      .update({ status: "ACTIVE" } as never)
      .eq("id", subscriptionRow.id);
    if (error) throw new Error(error.message);

    await recordNeroxaAudit({
      action: "SUBSCRIPTION_ACTIVATED_BY_PAYMENT",
      resourceType: "SUBSCRIPTION",
      resourceId: subscriptionRow.id,
      organizationId: row.organization_id,
      details: { billingId, billingStatus: "PAID" },
    });
  } else if (subscriptionRow.status === "PAST_DUE") {
    const currentEnd = subscriptionRow.current_period_end;
    if (!currentEnd) throw new Error("A assinatura inadimplente não possui fim de período para regularização.");

    const nextEnd = calculateNextPeriodEnd(currentEnd, planRow.billing_period);
    const { error } = await supabase
      .from("neroxa_subscriptions" as never)
      .update({
        status: "ACTIVE",
        current_period_start: currentEnd,
        current_period_end: nextEnd,
      } as never)
      .eq("id", subscriptionRow.id);
    if (error) throw new Error(error.message);

    await recordNeroxaAudit({
      action: "SUBSCRIPTION_RENEWED_BY_PAYMENT",
      resourceType: "SUBSCRIPTION",
      resourceId: subscriptionRow.id,
      organizationId: row.organization_id,
      details: {
        billingId,
        periodStart: currentEnd,
        periodEnd: nextEnd,
        billingStatus: "PAID",
      },
    });
  }

  return true;
}

export async function createRenewalBilling(subscriptionId: string) {
  const { data: subscription, error: subscriptionError } = await supabase
    .from("neroxa_subscriptions" as never)
    .select("id,organization_id,plan_id,status,price,current_period_end")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (subscriptionError) throw new Error(subscriptionError.message);
  if (!subscription) throw new Error("Assinatura não encontrada.");

  const row = subscription as {
    id: string;
    organization_id: string;
    plan_id: string;
    status: string;
    price: number | null;
    current_period_end: string | null;
  };

  if (row.status !== "ACTIVE") {
    throw new Error("Somente assinaturas ativas podem gerar uma cobrança de renovação.");
  }
  if (!row.current_period_end) {
    throw new Error("A assinatura não possui uma data de término de período.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("neroxa_billing_records" as never)
    .select("id,status")
    .eq("subscription_id", subscriptionId)
    .eq("due_date", row.current_period_end)
    .in("status", ["PENDING", "PAID", "OVERDUE"])
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing) return existing.id as string;

  const referenceMonth = `${row.current_period_end.slice(0, 7)}-01`;
  const { data, error } = await supabase
    .from("neroxa_billing_records" as never)
    .insert({
      organization_id: row.organization_id,
      subscription_id: subscriptionId,
      reference_month: referenceMonth,
      amount: Number(row.price ?? 0),
      due_date: row.current_period_end,
      status: "PENDING",
      payment_method: null,
      external_id: null,
      gateway_provider: null,
      gateway_payment_id: null,
      gateway_status: "PENDING",
      gateway_event_id: null,
    } as never)
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await recordNeroxaAudit({
    action: "RENEWAL_BILLING_CREATED",
    resourceType: "BILLING_RECORD",
    resourceId: (data as { id: string }).id,
    organizationId: row.organization_id,
    details: {
      subscriptionId,
      dueDate: row.current_period_end,
      amount: Number(row.price ?? 0),
      referenceMonth,
    },
  });

  return (data as { id: string }).id;
}

export async function processSubscriptionBilling(subscriptionId: string, today = new Date().toISOString().slice(0, 10)) {
  const { data: subscription, error: subscriptionError } = await supabase
    .from("neroxa_subscriptions" as never)
    .select("id,organization_id,plan_id,status,current_period_end")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (subscriptionError) throw new Error(subscriptionError.message);
  if (!subscription) throw new Error("Assinatura não encontrada.");

  const row = subscription as {
    id: string;
    organization_id: string;
    plan_id: string;
    status: string;
    current_period_end: string | null;
  };

  if (isFinalSubscriptionStatus(row.status) || row.status === "PAUSED") {
    return { status: row.status, changed: false };
  }

  const { data: dueBilling, error: billingError } = await supabase
    .from("neroxa_billing_records" as never)
    .select("id,status,due_date,paid_at")
    .eq("subscription_id", subscriptionId)
    .in("status", ["PENDING", "OVERDUE"])
    .order("due_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (billingError) throw new Error(billingError.message);

  if (dueBilling) {
    const billingRow = dueBilling as { id: string; status: string; due_date: string; paid_at: string | null };
    if (billingRow.status === "PENDING" && billingRow.due_date <= today) {
      const { error: overdueError } = await supabase
        .from("neroxa_billing_records" as never)
        .update({ status: "OVERDUE", gateway_status: "OVERDUE" } as never)
        .eq("id", billingRow.id);
      if (overdueError) throw new Error(overdueError.message);
    }

    if (row.status === "ACTIVE" && billingRow.due_date <= today) {
      const { error: subscriptionError } = await supabase
        .from("neroxa_subscriptions" as never)
        .update({ status: "PAST_DUE" } as never)
        .eq("id", subscriptionId);
      if (subscriptionError) throw new Error(subscriptionError.message);

      await recordNeroxaAudit({
        action: "SUBSCRIPTION_MARKED_PAST_DUE",
        resourceType: "SUBSCRIPTION",
        resourceId: subscriptionId,
        organizationId: row.organization_id,
        details: { billingId: billingRow.id, dueDate: billingRow.due_date },
      });

      return { status: "PAST_DUE", changed: true, billingId: billingRow.id };
    }

    return { status: row.status, changed: false, billingId: billingRow.id };
  }

  if (row.status === "ACTIVE" && row.current_period_end && row.current_period_end <= today) {
    const billingId = await createRenewalBilling(subscriptionId);
    const { error: overdueError } = await supabase
      .from("neroxa_billing_records" as never)
      .update({ status: "OVERDUE", gateway_status: "OVERDUE" } as never)
      .eq("id", billingId)
      .eq("status", "PENDING");
    if (overdueError) throw new Error(overdueError.message);

    const { error: subscriptionError } = await supabase
      .from("neroxa_subscriptions" as never)
      .update({ status: "PAST_DUE" } as never)
      .eq("id", subscriptionId);
    if (subscriptionError) throw new Error(subscriptionError.message);

    await recordNeroxaAudit({
      action: "SUBSCRIPTION_MARKED_PAST_DUE",
      resourceType: "SUBSCRIPTION",
      resourceId: subscriptionId,
      organizationId: row.organization_id,
      details: { billingId, dueDate: row.current_period_end },
    });

    return { status: "PAST_DUE", changed: true, billingId };
  }

  return { status: row.status, changed: false };
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

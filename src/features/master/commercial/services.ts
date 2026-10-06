import { supabase } from "@/integrations/supabase/client";
import { recordNeroxaAudit } from "@/features/master/clients/services";
import type { CommercialContract, CommercialOverview, ProposalStatus, ContractStatus } from "./types";

const PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["NEGOTIATION", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"],
  NEGOTIATION: ["SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

const CONTRACT_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["SUSPENDED", "TERMINATED", "EXPIRED"],
  SUSPENDED: ["ACTIVE", "TERMINATED", "EXPIRED"],
  TERMINATED: [],
  EXPIRED: [],
};

export function isAllowedProposalTransition(current: ProposalStatus, next: ProposalStatus) {
  return current === next || PROPOSAL_TRANSITIONS[current].includes(next);
}

export function isAllowedContractTransition(current: ContractStatus, next: ContractStatus) {
  return current === next || CONTRACT_TRANSITIONS[current].includes(next);
}

function assertTransition<T extends string>(transitions: Record<T, T[]>, current: T, next: T, entity: string) {
  if (current === next) return;
  if (!transitions[current].includes(next)) {
    throw new Error(`Transição inválida para ${entity}: ${current} → ${next}.`);
  }
}

export async function loadCommercialOverview(): Promise<CommercialOverview> {
  const [proposalsResult, contractsResult, clientsResult] = await Promise.all([
    supabase.from("neroxa_proposals" as never).select("*").order("updated_at", { ascending: false }),
    supabase.from("neroxa_contracts" as never).select("*").order("updated_at", { ascending: false }),
    supabase.from("neroxa_clients" as never).select("organization_id,legal_name,trade_name,tax_id").order("updated_at", { ascending: false }),
  ]);

  if (proposalsResult.error) throw new Error(proposalsResult.error.message);
  if (contractsResult.error) throw new Error(contractsResult.error.message);
  if (clientsResult.error) throw new Error(clientsResult.error.message);

  return {
    proposals: (proposalsResult.data ?? []) as unknown as CommercialOverview["proposals"],
    contracts: (contractsResult.data ?? []) as unknown as CommercialOverview["contracts"],
    clients: (clientsResult.data ?? []).map((client) => ({ id: String((client as { organization_id: string }).organization_id), legal_name: (client as { legal_name: string | null }).legal_name, trade_name: (client as { trade_name: string | null }).trade_name, tax_id: (client as { tax_id: string | null }).tax_id })),
  };
}

export async function createProposal(input: { clientId: string; planId: string; title: string; notes?: string | null; validUntil?: string | null }) {
  const { data: client, error: clientError } = await supabase.from("neroxa_organizations" as never).select("id,status,active").eq("id", input.clientId).maybeSingle();
  if (clientError) throw new Error(clientError.message);
  if (!client) throw new Error("Cliente não encontrado ou sem permissão.");
  const clientRow = client as { id: string; status: string; active: boolean };
  if (!clientRow.active || clientRow.status === "CANCELLED") throw new Error("Não é possível criar uma proposta para um cliente inativo ou cancelado.");

  const { data: plan, error: planError } = await supabase.from("neroxa_plans" as never).select("id,name,active,system_id,commercial_model,billing_period,price_monthly,setup_price,maintenance_price").eq("id", input.planId).maybeSingle();
  if (planError) throw new Error(planError.message);
  if (!plan) throw new Error("Plano não encontrado ou sem permissão.");
  const planRow = plan as { id: string; name: string; active: boolean; system_id: string | null; commercial_model: "SUBSCRIPTION" | "PERMANENT"; billing_period: "MONTHLY" | "YEARLY" | "ONE_TIME"; price_monthly: number | null; setup_price: number | null; maintenance_price: number | null };
  if (!planRow.active) throw new Error("O plano selecionado está inativo.");

  const recurringValue = planRow.commercial_model === "SUBSCRIPTION" ? Number(planRow.price_monthly ?? 0) : null;
  const { data, error } = await supabase.from("neroxa_proposals" as never).insert({
    client_id: input.clientId,
    plan_id: planRow.id,
    system_id: planRow.system_id,
    commercial_model: planRow.commercial_model,
    billing_period: planRow.billing_period,
    recurring_value: recurringValue,
    setup_value: Number(planRow.setup_price ?? 0),
    maintenance_value: planRow.maintenance_price == null ? null : Number(planRow.maintenance_price),
    currency: "BRL",
    status: "DRAFT",
    title: input.title.trim() || planRow.name,
    notes: input.notes?.trim() || null,
    valid_until: input.validUntil || null,
  } as never).select("id").single();

  if (error) throw new Error(error.message);
  const proposalId = (data as { id: string }).id;
  await recordNeroxaAudit({ action: "PROPOSAL_CREATED", resourceType: "PROPOSAL", resourceId: proposalId, organizationId: input.clientId, details: { planId: planRow.id, planName: planRow.name, commercialModel: planRow.commercial_model, billingPeriod: planRow.billing_period, recurringValue, setupValue: Number(planRow.setup_price ?? 0), maintenanceValue: planRow.maintenance_price } });
  return proposalId;
}

export async function updateProposalStatus(id: string, status: ProposalStatus) {
  const { data: proposal, error: proposalError } = await supabase.from("neroxa_proposals" as never).select("id,client_id,status").eq("id", id).maybeSingle();
  if (proposalError) throw new Error(proposalError.message);
  if (!proposal) throw new Error("Proposta não encontrada ou sem permissão para alterar.");
  const row = proposal as { id: string; client_id: string; status: ProposalStatus };
  assertTransition(PROPOSAL_TRANSITIONS, row.status, status, "proposta");

  const patch: Record<string, unknown> = { status };
  if (status === "SENT") patch.sent_at = new Date().toISOString();
  if (status === "ACCEPTED") patch.accepted_at = new Date().toISOString();
  if (status === "REJECTED") patch.rejected_at = new Date().toISOString();

  const { data, error } = await supabase.from("neroxa_proposals" as never).update(patch as never).eq("id", id).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Proposta não encontrada ou sem permissão para alterar.");
  await recordNeroxaAudit({ action: "PROPOSAL_STATUS_CHANGED", resourceType: "PROPOSAL", resourceId: id, organizationId: row.client_id, details: { previousStatus: row.status, status } });
  return true;
}

export async function createContractFromProposal(proposalId: string) {
  const { data: proposal, error: proposalError } = await supabase.from("neroxa_proposals" as never).select("id,client_id,status,title,plan_id,system_id,commercial_model,billing_period,recurring_value,setup_value,maintenance_value,currency").eq("id", proposalId).maybeSingle();
  if (proposalError) throw new Error(proposalError.message);
  if (!proposal) throw new Error("Proposta não encontrada ou sem permissão.");
  const row = proposal as { id: string; client_id: string; status: ProposalStatus; title: string; plan_id: string | null; system_id: string | null; commercial_model: "SUBSCRIPTION" | "PERMANENT"; billing_period: "MONTHLY" | "YEARLY" | "ONE_TIME" | null; recurring_value: number | null; setup_value: number; maintenance_value: number | null; currency: string };
  if (row.status !== "ACCEPTED") throw new Error("Somente propostas aceitas podem gerar contrato.");

  const { data: existing, error: existingError } = await supabase.from("neroxa_contracts" as never).select("id,status").eq("proposal_id", proposalId).limit(1).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return (existing as { id: string }).id;

  const { data, error } = await supabase.from("neroxa_contracts" as never).insert({
    client_id: row.client_id,
    proposal_id: row.id,
    status: "DRAFT",
    title: row.title,
    plan_id: row.plan_id,
    system_id: row.system_id,
    commercial_model: row.commercial_model,
    billing_period: row.billing_period,
    recurring_value: row.recurring_value,
    setup_value: row.setup_value,
    maintenance_value: row.maintenance_value,
    currency: row.currency,
    version: 1,
  } as never).select("id").single();

  if (error) {
    // The database enforces one contract per proposal. If two requests race,
    // preserve the service's idempotent behavior by returning the winner.
    if (error.code === "23505") {
      const { data: racedContract, error: racedError } = await supabase
        .from("neroxa_contracts" as never)
        .select("id")
        .eq("proposal_id", proposalId)
        .maybeSingle();
      if (!racedError && racedContract) return (racedContract as { id: string }).id;
    }
    throw new Error(error.message);
  }
  const contractId = (data as { id: string }).id;
  await recordNeroxaAudit({ action: "CONTRACT_CREATED_FROM_PROPOSAL", resourceType: "CONTRACT", resourceId: contractId, organizationId: row.client_id, details: { proposalId, version: 1 } });
  return contractId;
}

export async function updateContractDraft(input: { id: string; title: string; contractNumber: string | null }) {
  const title = input.title.trim();
  const contractNumber = input.contractNumber?.trim() || null;
  if (!title) throw new Error("Informe o título do contrato.");

  const { data: contract, error: contractError } = await supabase
    .from("neroxa_contracts" as never)
    .select("id,client_id,status")
    .eq("id", input.id)
    .maybeSingle();

  if (contractError) throw new Error(contractError.message);
  if (!contract) throw new Error("Contrato não encontrado ou sem permissão.");
  const row = contract as { id: string; client_id: string; status: ContractStatus };
  if (row.status !== "DRAFT") {
    throw new Error("Somente contratos em rascunho podem ser editados.");
  }

  const { data, error } = await supabase
    .from("neroxa_contracts" as never)
    .update({ title, contract_number: contractNumber } as never)
    .eq("id", input.id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Contrato não encontrado ou sem permissão para alterar.");

  await recordNeroxaAudit({
    action: "CONTRACT_DRAFT_UPDATED",
    resourceType: "CONTRACT",
    resourceId: input.id,
    organizationId: row.client_id,
    details: { title, contractNumber },
  });

  return true;
}

export async function sendContractForSignature(id: string) {
  const { data, error } = await supabase.rpc("send_neroxa_contract_for_signature" as never, { p_contract_id: id } as never);
  if (error) throw new Error(error.message);
  await recordNeroxaAudit({ action: "CONTRACT_SENT_FOR_SIGNATURE", resourceType: "CONTRACT", resourceId: id, details: { contractId: id } });
  return String(data);
}

export async function signContractAsNeroxa(input: { id: string; name: string; role: string }) {
  const name = input.name.trim();
  const role = input.role.trim();
  if (!name) throw new Error("Informe o nome do responsável pela Neroxa.");
  if (!role) throw new Error("Informe o cargo do responsável pela Neroxa.");
  const { error } = await supabase.rpc("sign_neroxa_contract" as never, { p_contract_id: input.id, p_signer_name: name, p_signer_role: role } as never);
  if (error) throw new Error(error.message);
  await recordNeroxaAudit({ action: "CONTRACT_SIGNED_BY_NEROXA", resourceType: "CONTRACT", resourceId: input.id, details: { signerName: name, signerRole: role } });
  return true;
}

export async function updateContractStatus(id: string, status: ContractStatus) {
  const { data: contract, error: contractError } = await supabase
    .from("neroxa_contracts" as never)
    .select("id,client_id,status,proposal_id,commercial_model")
    .eq("id", id)
    .maybeSingle();

  if (contractError) throw new Error(contractError.message);
  if (!contract) throw new Error("Contrato não encontrado ou sem permissão para alterar.");

  const row = contract as {
    id: string;
    client_id: string;
    status: ContractStatus;
    proposal_id: string | null;
    commercial_model: "SUBSCRIPTION" | "PERMANENT";
  };

  assertTransition(CONTRACT_TRANSITIONS, row.status, status, "contrato");

  if (row.status === "DRAFT" && status === "ACTIVE") {
    const { data: subscriptionId, error: activationError } = await supabase.rpc(
      "activate_neroxa_contract_and_subscription",
      { p_contract_id: id },
    );

    if (activationError) throw new Error(activationError.message);

    await recordNeroxaAudit({
      action: "CONTRACT_STATUS_CHANGED",
      resourceType: "CONTRACT",
      resourceId: id,
      organizationId: row.client_id,
      details: {
        previousStatus: row.status,
        status,
        commercialModel: row.commercial_model,
        subscriptionId: subscriptionId ?? null,
      },
    });

    return true;
  }

  const patch: Record<string, unknown> = { status };
  if (status === "ACTIVE") {
    patch.started_at = new Date().toISOString().slice(0, 10);
    patch.signed_at = new Date().toISOString();
  }
  if (status === "TERMINATED" || status === "EXPIRED") {
    patch.ended_at = new Date().toISOString().slice(0, 10);
  }

  const { data, error } = await supabase
    .from("neroxa_contracts" as never)
    .update(patch as never)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Contrato não encontrado ou sem permissão para alterar.");

  await recordNeroxaAudit({
    action: "CONTRACT_STATUS_CHANGED",
    resourceType: "CONTRACT",
    resourceId: id,
    organizationId: row.client_id,
    details: { previousStatus: row.status, status },
  });

  return true;
}
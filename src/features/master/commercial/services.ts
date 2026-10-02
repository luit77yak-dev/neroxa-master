import { supabase } from "@/integrations/supabase/client";
import { recordNeroxaAudit } from "@/features/master/clients/services";
import type { CommercialContract, CommercialOverview, CommercialProposal } from "./types";

export async function loadCommercialOverview(): Promise<CommercialOverview> {
  const [proposalsResult, contractsResult, clientsResult] = await Promise.all([
    supabase
      .from("neroxa_proposals" as never)
      .select("*")
      .order("updated_at", { ascending: false }),
    supabase
      .from("neroxa_contracts" as never)
      .select("*")
      .order("updated_at", { ascending: false }),
    supabase
      .from("neroxa_clients" as never)
      .select("id,legal_name,trade_name")
      .order("updated_at", { ascending: false }),
  ]);

  if (proposalsResult.error) throw new Error(proposalsResult.error.message);
  if (contractsResult.error) throw new Error(contractsResult.error.message);
  if (clientsResult.error) throw new Error(clientsResult.error.message);

  return {
    proposals: (proposalsResult.data ?? []) as unknown as CommercialProposal[],
    contracts: (contractsResult.data ?? []) as unknown as CommercialContract[],
    clients: (clientsResult.data ?? []) as unknown as CommercialOverview["clients"],
  };
}


export async function updateProposalStatus(id: string, status: "DRAFT" | "SENT" | "NEGOTIATION" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CANCELLED") {
  const patch: Record<string, unknown> = { status };
  if (status === "SENT") patch.sent_at = new Date().toISOString();
  if (status === "ACCEPTED") patch.accepted_at = new Date().toISOString();
  if (status === "REJECTED") patch.rejected_at = new Date().toISOString();
  const { data, error } = await supabase.from("neroxa_proposals" as never).update(patch as never).eq("id", id).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Proposta não encontrada ou sem permissão para alterar.");
  await recordNeroxaAudit({ action: "PROPOSAL_STATUS_CHANGED", resourceType: "PROPOSAL", resourceId: id, details: { status } });
  return true;
}

export async function updateContractStatus(id: string, status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "TERMINATED" | "EXPIRED") {
  const patch: Record<string, unknown> = { status };
  if (status === "ACTIVE") patch.signed_at = new Date().toISOString();
  if (status === "TERMINATED" || status === "EXPIRED") patch.ended_at = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from("neroxa_contracts" as never).update(patch as never).eq("id", id).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Contrato não encontrado ou sem permissão para alterar.");
  await recordNeroxaAudit({ action: "CONTRACT_STATUS_CHANGED", resourceType: "CONTRACT", resourceId: id, details: { status } });
  return true;
}

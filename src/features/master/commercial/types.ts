export const PROPOSAL_STATUS_LABELS = {
  DRAFT: "Rascunho",
  SENT: "Enviada",
  NEGOTIATION: "Negociação",
  ACCEPTED: "Aceita",
  REJECTED: "Rejeitada",
  EXPIRED: "Expirada",
  CANCELLED: "Cancelada",
} as const;

export const CONTRACT_STATUS_LABELS = {
  DRAFT: "Rascunho",
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  TERMINATED: "Encerrado",
  EXPIRED: "Expirado",
} as const;

export type ProposalStatus = keyof typeof PROPOSAL_STATUS_LABELS;
export type ContractStatus = keyof typeof CONTRACT_STATUS_LABELS;
export type ContractSignatureStatus = "NOT_SENT" | "PENDING_CUSTOMER" | "PENDING_NEROXA" | "SIGNED" | "DECLINED" | "CANCELLED";

export type CommercialProposal = {
  id: string;
  public_token: string;
  client_id: string;
  status: ProposalStatus;
  title: string;
  notes: string | null;
  valid_until: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  plan_id: string | null;
  system_id: string | null;
  commercial_model: "SUBSCRIPTION" | "PERMANENT";
  billing_period: "MONTHLY" | "YEARLY" | "ONE_TIME" | null;
  recurring_value: number | null;
  setup_value: number;
  maintenance_value: number | null;
  currency: string;
  created_at: string;
  updated_at: string;
};

export type CommercialContract = {
  id: string;
  client_id: string;
  proposal_id: string | null;
  status: ContractStatus;
  contract_number: string | null;
  title: string;
  started_at: string | null;
  ended_at: string | null;
  signed_at: string | null;
  signature_status: ContractSignatureStatus;
  public_signature_token: string;
  signature_requested_at: string | null;
  customer_signer_name: string | null;
  customer_signer_document: string | null;
  customer_signed_at: string | null;
  neroxa_signer_user_id: string | null;
  neroxa_signer_name: string | null;
  neroxa_signer_role: string | null;
  neroxa_signed_at: string | null;
  issued_at: string | null;
  term_months: number | null;
  plan_id: string | null;
  system_id: string | null;
  commercial_model: "SUBSCRIPTION" | "PERMANENT";
  billing_period: "MONTHLY" | "YEARLY" | "ONE_TIME" | null;
  recurring_value: number | null;
  setup_value: number;
  maintenance_value: number | null;
  currency: string;
  version: number;
  created_at: string;
  updated_at: string;
};

export type CommercialClient = {
  id: string;
  legal_name: string | null;
  trade_name: string | null;
};

export type CommercialOverview = {
  proposals: CommercialProposal[];
  contracts: CommercialContract[];
  clients: CommercialClient[];
};

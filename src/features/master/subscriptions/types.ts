export const SUBSCRIPTION_STATUS_LABELS = { PENDING: "Pendente", ACTIVE: "Ativa", PAUSED: "Pausada", DELINQUENT: "Inadimplente", CANCELLED: "Cancelada", EXPIRED: "Expirada" } as const;
export const BILLING_INTERVAL_LABELS = { MONTHLY: "Mensal", YEARLY: "Anual", ONE_TIME: "Avulso" } as const;
export type SubscriptionStatus = keyof typeof SUBSCRIPTION_STATUS_LABELS;
export type BillingInterval = keyof typeof BILLING_INTERVAL_LABELS;
export type SubscriptionPlan = { id:string; name:string; slug:string; description:string|null; active:boolean; billing_interval:BillingInterval; base_price:number; setup_price:number; gateway_provider:string|null; gateway_plan_id:string|null; gateway_status:string; gateway_synced_at:string|null };
export type Subscription = { id:string; client_id:string; contract_id:string|null; contract_version_id:string|null; plan_id:string; status:SubscriptionStatus; billing_interval:BillingInterval; contracted_recurring_value:number; contracted_setup_value:number; started_at:string|null; next_billing_date:string|null; updated_at:string; gateway_provider:string|null; gateway_subscription_id:string|null; gateway_status:string|null; checkout_url:string|null; gateway_synced_at:string|null };
export type SubscriptionClient = { id:string; legal_name:string|null; trade_name:string|null };
export type SubscriptionOverview = { plans:SubscriptionPlan[]; subscriptions:Subscription[]; clients:SubscriptionClient[] };

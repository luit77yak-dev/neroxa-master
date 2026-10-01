export const MERCADO_PAGO_PROVIDER = "MERCADO_PAGO" as const;

export type GatewayEvent = {
  provider: string;
  eventId: string;
  eventType: string;
  resourceId: string | null;
  payload: Record<string, unknown>;
};

/**
 * Gateway adapter boundary. Secrets and API calls stay server-side in a Supabase Edge Function.
 * The Master frontend only consumes persisted gateway state from Supabase.
 */
export type GatewayAdapter = {
  provider: typeof MERCADO_PAGO_PROVIDER;
  createCheckout: (input: { subscriptionId: string }) => Promise<{ checkoutUrl: string }>;
  syncSubscription: (externalId: string) => Promise<void>;
};

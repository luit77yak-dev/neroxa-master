import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateNextPeriodEnd,
  shouldMarkBillingOverdue,
  shouldMarkSubscriptionPastDue,
  canCreateRenewalBilling,
  isFinalSubscriptionStatus,
} from "@/features/master/subscriptions/services";



const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc },
}));

describe("billing engine pure rules", () => {
  it("calculates monthly renewal periods", () => {
    expect(calculateNextPeriodEnd("2026-10-02", "MONTHLY")).toBe("2026-11-02");
  });

  it("calculates yearly renewal periods", () => {
    expect(calculateNextPeriodEnd("2026-10-02", "YEARLY")).toBe("2027-10-02");
  });

  it("handles leap-day monthly renewal without timezone drift", () => {
    expect(calculateNextPeriodEnd("2028-01-31", "MONTHLY")).toBe("2028-02-29");
  });

  it("marks only pending billing due today or earlier as overdue", () => {
    expect(shouldMarkBillingOverdue("PENDING", "2026-10-02", "2026-10-02")).toBe(true);
    expect(shouldMarkBillingOverdue("PENDING", "2026-10-01", "2026-10-02")).toBe(true);
    expect(shouldMarkBillingOverdue("PENDING", "2026-10-03", "2026-10-02")).toBe(false);
    expect(shouldMarkBillingOverdue("PAID", "2026-10-01", "2026-10-02")).toBe(false);
  });

  it("marks an active subscription past due only when its billing is due", () => {
    expect(shouldMarkSubscriptionPastDue("ACTIVE", "2026-10-02", "2026-10-02")).toBe(true);
    expect(shouldMarkSubscriptionPastDue("ACTIVE", "2026-10-03", "2026-10-02")).toBe(false);
    expect(shouldMarkSubscriptionPastDue("PAUSED", "2026-10-01", "2026-10-02")).toBe(false);
  });

  it("allows renewal processing only for active subscriptions whose period ended", () => {
    expect(canCreateRenewalBilling("ACTIVE", "2026-10-01", "2026-10-02")).toBe(true);
    expect(canCreateRenewalBilling("ACTIVE", "2026-10-02", "2026-10-02")).toBe(true);
    expect(canCreateRenewalBilling("ACTIVE", "2026-10-03", "2026-10-02")).toBe(false);
    expect(canCreateRenewalBilling("PAST_DUE", "2026-10-01", "2026-10-02")).toBe(false);
    expect(canCreateRenewalBilling("ACTIVE", null, "2026-10-02")).toBe(false);
  });

  it("identifies final subscription states", () => {
    expect(isFinalSubscriptionStatus("CANCELLED")).toBe(true);
    expect(isFinalSubscriptionStatus("EXPIRED")).toBe(true);
    expect(isFinalSubscriptionStatus("ACTIVE")).toBe(false);
    expect(isFinalSubscriptionStatus("PAUSED")).toBe(false);
  });
});


describe("contract activation flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockReset();
  });

  it("rejects an empty contract id before touching Supabase", async () => {
    const { createSubscription } = await import("@/features/master/subscriptions/services");

    await expect(createSubscription({ contractId: "" })).rejects.toThrow(
      "Contrato não informado.",
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("activates the contract through the transactional RPC", async () => {
    rpc.mockResolvedValue({ data: "subscription-123", error: null });

    const { createSubscription } = await import("@/features/master/subscriptions/services");

    await expect(createSubscription({ contractId: "contract-123" })).resolves.toBe(
      "subscription-123",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("activate_neroxa_contract_and_subscription", {
      p_contract_id: "contract-123",
    });
  });

  it("propagates an activation error without masking the database reason", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "O contrato só pode ser ativado após a aceitação da proposta vinculada" },
    });

    const { createSubscription } = await import("@/features/master/subscriptions/services");

    await expect(createSubscription({ contractId: "contract-123" })).rejects.toThrow(
      "O contrato só pode ser ativado após a aceitação da proposta vinculada",
    );
  });

  it("rejects a successful RPC that does not return a subscription id", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const { createSubscription } = await import("@/features/master/subscriptions/services");

    await expect(createSubscription({ contractId: "contract-123" })).rejects.toThrow(
      "O contrato foi ativado sem gerar uma assinatura recorrente.",
    );
  });
});

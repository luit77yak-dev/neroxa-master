import { describe, expect, it } from "vitest";
import {
  calculateNextPeriodEnd,
  shouldMarkBillingOverdue,
  shouldMarkSubscriptionPastDue,
  canCreateRenewalBilling,
  isFinalSubscriptionStatus,
} from "@/features/master/subscriptions/services";

describe("billing engine pure rules", () => {
  it("calculates monthly renewal periods", () => {
    expect(calculateNextPeriodEnd("2026-10-02", "MONTHLY")).toBe("2026-11-02");
  });

  it("calculates yearly renewal periods", () => {
    expect(calculateNextPeriodEnd("2026-10-02", "YEARLY")).toBe("2027-10-02");
  });

  it("handles leap-day monthly renewal without timezone drift", () => {
    expect(calculateNextPeriodEnd("2028-01-31", "MONTHLY")).toBe("2028-03-02");
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

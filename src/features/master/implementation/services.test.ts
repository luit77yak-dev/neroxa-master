import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc },
}));

import { prepareImplementationFromSubscription } from "./services";

describe("prepareImplementationFromSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes the implementation name and slug before calling the RPC", async () => {
    rpc.mockResolvedValue({ data: "instance-123", error: null });

    await expect(
      prepareImplementationFromSubscription({
        subscriptionId: "subscription-123",
        name: "  Minha Loja  ",
        slug: " Minha-Loja ",
      }),
    ).resolves.toBe("instance-123");

    expect(rpc).toHaveBeenCalledWith(
      "prepare_neroxa_implementation_from_subscription",
      {
        p_subscription_id: "subscription-123",
        p_name: "Minha Loja",
        p_slug: "minha-loja",
      },
    );
  });

  it("propagates RPC errors", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "A implantação existente está arquivada e não pode ser reutilizada" },
    });

    await expect(
      prepareImplementationFromSubscription({
        subscriptionId: "subscription-123",
        name: "Minha Loja",
        slug: "minha-loja",
      }),
    ).rejects.toThrow("A implantação existente está arquivada e não pode ser reutilizada");
  });

  it("returns the instance id generated or reused by the RPC", async () => {
    rpc.mockResolvedValue({ data: "instance-456", error: null });

    await expect(
      prepareImplementationFromSubscription({
        subscriptionId: "subscription-123",
        name: "Minha Loja",
        slug: "minha-loja",
      }),
    ).resolves.toBe("instance-456");
  });
});

describe("updateImplementationInstanceStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the controlled instance status transition RPC", async () => {
    rpc.mockResolvedValue({ data: "SUSPENDED", error: null });

    await expect(
      (await import("./services")).updateImplementationInstanceStatus({
        id: "instance-123",
        status: "SUSPENDED",
      }),
    ).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledWith("transition_neroxa_instance_status", {
      p_instance_id: "instance-123",
      p_status: "SUSPENDED",
    });
  });

  it("propagates instance status transition errors", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Uma instância arquivada não pode ter o status alterado" },
    });

    await expect(
      (await import("./services")).updateImplementationInstanceStatus({
        id: "instance-123",
        status: "ACTIVE",
      }),
    ).rejects.toThrow("Uma instância arquivada não pode ter o status alterado");
  });
});

describe("retryProvisioningJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the controlled retry RPC", async () => {
    rpc.mockResolvedValue({ data: "job-456", error: null });

    const { retryProvisioningJob } = await import("./services");

    await expect(
      retryProvisioningJob({
        id: "job-123",
        organization_id: "org-123",
        system_instance_id: "instance-123",
        action: "PROVISION_INSTANCE",
        status: "FAILED",
        payload: { instance_id: "instance-123" },
        error_message: "timeout",
        started_at: null,
        completed_at: null,
        created_at: "2026-10-07T00:00:00Z",
      }),
    ).resolves.toBe("job-456");

    expect(rpc).toHaveBeenCalledWith("retry_neroxa_provisioning_job", {
      p_job_id: "job-123",
    });
  });

  it("propagates retry RPC errors", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Somente jobs falhos ou cancelados podem ser tentados novamente" },
    });

    const { retryProvisioningJob } = await import("./services");

    await expect(
      retryProvisioningJob({
        id: "job-123",
        organization_id: "org-123",
        system_instance_id: "instance-123",
        action: "PROVISION_INSTANCE",
        status: "FAILED",
        payload: {},
        error_message: "erro",
        started_at: null,
        completed_at: null,
        created_at: "2026-10-07T00:00:00Z",
      }),
    ).rejects.toThrow("Somente jobs falhos ou cancelados podem ser tentados novamente");
  });
});

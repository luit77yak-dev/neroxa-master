import { supabase } from "@/integrations/supabase/client";

export type ProvisioningStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type InstanceStatus = "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";

export type ProvisioningJob = {
  id: string;
  organization_id: string;
  system_instance_id: string | null;
  action: string;
  status: ProvisioningStatus;
  payload: Record<string, unknown>;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type ImplementationInstance = {
  id: string;
  organization_id: string;
  system_id: string | null;
  plan_id: string | null;
  subscription_id: string | null;
  name: string;
  slug: string;
  system_type: string;
  status: InstanceStatus;
  created_at: string;
  updated_at: string;
};

export async function listProvisioningJobs() {
  const { data, error } = await supabase
    .from("neroxa_provisioning_jobs" as never)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ProvisioningJob[];
}

export async function listImplementationInstances() {
  const { data, error } = await supabase
    .from("neroxa_system_instances" as never)
    .select("id,organization_id,system_id,plan_id,subscription_id,name,slug,system_type,status,created_at,updated_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ImplementationInstance[];
}

export async function createProvisioningJob(input: {
  organizationId: string;
  systemInstanceId?: string | null;
  action: string;
  payload?: Record<string, unknown>;
}) {
  const { data, error } = await supabase
    .from("neroxa_provisioning_jobs" as never)
    .insert({
      organization_id: input.organizationId,
      system_instance_id: input.systemInstanceId || null,
      action: input.action,
      payload: input.payload ?? {},
      status: "PENDING",
    } as never)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as ProvisioningJob;
}

export async function updateProvisioningJob(input: {
  id: string;
  status: ProvisioningStatus;
  errorMessage?: string | null;
}) {
  const patch: Record<string, unknown> = {
    status: input.status,
    error_message: input.errorMessage ?? null,
  };
  if (input.status === "RUNNING") patch.started_at = new Date().toISOString();
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(input.status)) patch.completed_at = new Date().toISOString();

  const { error } = await supabase
    .from("neroxa_provisioning_jobs" as never)
    .update(patch as never)
    .eq("id", input.id);
  if (error) throw new Error(error.message);

  if (input.status === "COMPLETED" || input.status === "FAILED") {
    const job = await supabase.from("neroxa_provisioning_jobs" as never).select("system_instance_id").eq("id", input.id).single();
    if (!job.error && job.data?.system_instance_id) {
      await supabase.from("neroxa_system_instances" as never).update({
        status: input.status === "COMPLETED" ? "ACTIVE" : "PROVISIONING",
        updated_at: new Date().toISOString(),
      } as never).eq("id", job.data.system_instance_id);
    }
  }
}

export async function retryProvisioningJob(job: ProvisioningJob) {
  return createProvisioningJob({
    organizationId: job.organization_id,
    systemInstanceId: job.system_instance_id,
    action: job.action,
    payload: job.payload,
  });
}

export async function cancelProvisioningJob(jobId: string) {
  return updateProvisioningJob({ id: jobId, status: "CANCELLED" });
}

export async function prepareImplementationFromSubscription(input: { subscriptionId: string; name: string; slug: string }) {
  const { data, error } = await supabase.rpc("prepare_neroxa_implementation_from_subscription", {
    p_subscription_id: input.subscriptionId,
    p_name: input.name.trim(),
    p_slug: input.slug.trim().toLowerCase(),
  });
  if (error) throw new Error(error.message);
  return String(data);
}

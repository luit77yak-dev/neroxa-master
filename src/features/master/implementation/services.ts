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

export async function updateImplementationInstance(input: {
  id: string;
  name: string;
  slug: string;
  systemType: string;
}) {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const systemType = input.systemType.trim().toUpperCase();
  if (!name || !slug || !systemType) throw new Error("Informe nome, slug e tipo de sistema.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("O slug deve usar apenas letras minúsculas, números e hífens.");
  }

  const { data, error } = await supabase
    .from("neroxa_system_instances" as never)
    .update({ name, slug, system_type: systemType, updated_at: new Date().toISOString() } as never)
    .eq("id", input.id)
    .select("id,organization_id,system_id,plan_id,subscription_id,name,slug,system_type,status,created_at,updated_at")
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as ImplementationInstance;
}

export async function deleteImplementationInstance(id: string) {
  const { data, error } = await supabase.rpc("delete_neroxa_system_instance_safely", {
    p_instance_id: id,
  });
  if (error) throw new Error(error.message);
  return data as { deleted: boolean; instance_id: string; status: InstanceStatus };
}

export async function updateProvisioningJob(input: {
  id: string;
  status: ProvisioningStatus;
  errorMessage?: string | null;
}) {
  const { error } = await supabase.rpc("update_neroxa_provisioning_job_status", {
    p_job_id: input.id,
    p_status: input.status,
    p_error_message: input.errorMessage ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function updateImplementationInstanceStatus(input: { id: string; status: InstanceStatus }) {
  const { error } = await supabase.rpc("transition_neroxa_instance_status", {
    p_instance_id: input.id,
    p_status: input.status,
  });
  if (error) throw new Error(error.message);
}

export async function retryProvisioningJob(job: ProvisioningJob) {
  const { data, error } = await supabase.rpc("retry_neroxa_provisioning_job", {
    p_job_id: job.id,
  });
  if (error) throw new Error(error.message);
  return String(data);
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

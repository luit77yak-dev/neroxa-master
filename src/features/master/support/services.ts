import { supabase } from "@/integrations/supabase/client";

export type SupportTicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING_CLIENT" | "RESOLVED" | "CLOSED";
export type SupportTicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type SupportTicket = {
  id: string;
  organization_id: string;
  subject: string;
  description: string;
  category: string;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  assignee_user_id: string | null;
  created_by_user_id: string | null;
  last_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  organization?: { id: string; trade_name: string | null; legal_name: string | null } | null;
};

export type SupportMessage = {
  id: string;
  ticket_id: string;
  author_user_id: string | null;
  body: string;
  internal: boolean;
  created_at: string;
};

export async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  return data.user?.id ?? null;
}

export async function listSupportTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from("neroxa_support_tickets" as never)
    .select("*, organization:neroxa_organizations(id, trade_name, legal_name)")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SupportTicket[];
}

export async function listSupportMessages(ticketId: string): Promise<SupportMessage[]> {
  const { data, error } = await supabase
    .from("neroxa_support_messages" as never)
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SupportMessage[];
}

export async function createSupportTicket(input: {
  organizationId: string;
  subject: string;
  description: string;
  category: string;
  priority: SupportTicketPriority;
}) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Sessão expirada.");
  const { data, error } = await supabase
    .from("neroxa_support_tickets" as never)
    .insert({
      organization_id: input.organizationId,
      subject: input.subject.trim(),
      description: input.description.trim(),
      category: input.category.trim() || "GENERAL",
      priority: input.priority,
      created_by_user_id: userId,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function updateSupportTicket(input: {
  id: string;
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  assigneeUserId?: string | null;
}) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status) {
    patch.status = input.status;
    if (input.status === "RESOLVED") patch.resolved_at = new Date().toISOString();
    if (input.status === "CLOSED") patch.closed_at = new Date().toISOString();
    if (input.status === "OPEN" || input.status === "IN_PROGRESS" || input.status === "WAITING_CLIENT") {
      patch.resolved_at = null;
      patch.closed_at = null;
    }
  }
  if (input.priority) patch.priority = input.priority;
  if (input.assigneeUserId !== undefined) patch.assignee_user_id = input.assigneeUserId;

  const { error } = await supabase
    .from("neroxa_support_tickets" as never)
    .update(patch as never)
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function addSupportMessage(input: { ticketId: string; body: string; internal?: boolean }) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Sessão expirada.");
  const body = input.body.trim();
  if (!body) throw new Error("Digite uma mensagem.");
  const { error } = await supabase
    .from("neroxa_support_messages" as never)
    .insert({
      ticket_id: input.ticketId,
      author_user_id: userId,
      body,
      internal: Boolean(input.internal),
    } as never);
  if (error) throw new Error(error.message);

  await supabase
    .from("neroxa_support_tickets" as never)
    .update({
      last_response_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: input.internal ? undefined : "IN_PROGRESS",
    } as never)
    .eq("id", input.ticketId);
}

export async function assignSupportTicket(ticketId: string) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Sessão expirada.");
  await updateSupportTicket({ id: ticketId, assigneeUserId: userId, status: "IN_PROGRESS" });
}

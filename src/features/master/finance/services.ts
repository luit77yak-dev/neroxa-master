import { supabase } from "@/integrations/supabase/client";
import type { FinanceOverview } from "./types";
const statusMap: Record<string, any> = { PENDING:"PENDING", PAID:"PAID", OVERDUE:"OVERDUE", CANCELLED:"CANCELLED", REFUNDED:"REFUNDED" };
export async function loadFinanceOverview(): Promise<FinanceOverview> {
  const [billingResult, clientsResult] = await Promise.all([
    supabase.from("neroxa_billing_records" as never).select("id,organization_id,subscription_id,reference_month,amount,due_date,paid_at,status,payment_method,external_id,created_at,updated_at,gateway_provider,gateway_payment_id,gateway_status,gateway_event_id").order("due_date", { ascending:true }),
    supabase.from("neroxa_clients" as never).select("id,legal_name,trade_name").order("updated_at", { ascending:false }),
  ]);
  if (billingResult.error) throw new Error(billingResult.error.message);
  if (clientsResult.error) throw new Error(clientsResult.error.message);
  const invoices = (billingResult.data ?? []).map((row) => { const item=row as any; return { id:String(item.id), client_id:String(item.organization_id), subscription_id:item.subscription_id?String(item.subscription_id):null, invoice_number:`NRX-${String(item.reference_month).slice(0,7).replace("-","")}-${String(item.id).slice(0,6).toUpperCase()}`, status:statusMap[item.status]??"PENDING", issue_date:String(item.reference_month), due_date:String(item.due_date), paid_at:item.paid_at??null, subtotal:Number(item.amount??0), discount_amount:0, total_amount:Number(item.amount??0), notes:item.external_id?`Ref. ${item.external_id}`:null, updated_at:item.updated_at, gateway_provider:item.gateway_provider??null, gateway_payment_id:item.gateway_payment_id??null, gateway_status:item.gateway_status??null, gateway_event_id:item.gateway_event_id??null }; });
  const payments=(billingResult.data??[]).filter((row:any)=>row.status==="PAID"&&row.paid_at).map((row:any)=>({ id:String(row.id), invoice_id:String(row.id), client_id:String(row.organization_id), status:"CONFIRMED" as const, method:row.payment_method??"Não informado", amount:Number(row.amount??0), paid_at:row.paid_at, external_reference:row.external_id??null, notes:"Pagamento conciliado a partir do registro financeiro.", created_at:row.created_at, gateway_provider:row.gateway_provider??null, gateway_payment_id:row.gateway_payment_id??null, gateway_status:row.gateway_status??null }));
  return { invoices:invoices as any, payments:payments as any, clients:(clientsResult.data??[]) as any };
}

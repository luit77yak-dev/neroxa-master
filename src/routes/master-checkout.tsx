import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, ShieldCheck, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isNeroxaStaff } from "@/features/master/clients/services";
import { MasterShell } from "@/features/master/shell/MasterShell";
import { MasterLogin } from "@/features/master/shell/MasterLogin";
import { supabase } from "@/integrations/supabase/client";

type Plan={id:string;name:string;slug:string;price_monthly:number;setup_price:number;billing_period:string};
type Session={id:string;status:string;gateway_status:string|null;gateway_payment_id:string|null;amount:number|string;customer_name:string;customer_email:string};
const formatCurrency=(value:number|string|null|undefined)=>{const amount=Number(value??0);return Number.isFinite(amount)?`R$ ${amount.toFixed(2).replace(".",",")}`:"—"};

export const Route=createFileRoute("/master-checkout")({component:MasterCheckoutPage});

function MasterCheckoutPage(){
 const [authorized,setAuthorized]=useState<boolean|null>(null),[plans,setPlans]=useState<Plan[]>([]),[planId,setPlanId]=useState(""),[name,setName]=useState(""),[email,setEmail]=useState(""),[phone,setPhone]=useState(""),[loading,setLoading]=useState(true),[creating,setCreating]=useState(false),[error,setError]=useState<string|null>(null),[checkoutUrl,setCheckoutUrl]=useState<string|null>(null),[session,setSession]=useState<Session|null>(null),[status,setStatus]=useState<string|null>(null);
 useEffect(()=>{void (async()=>{try{const staff=await isNeroxaStaff();setAuthorized(staff);if(!staff)return;const {data,error}=await supabase.from("neroxa_plans").select("id,name,slug,price_monthly,setup_price,billing_period").eq("active",true).order("price_monthly");if(error)throw error;setPlans((data??[]) as Plan[]);setPlanId(String(data?.[0]?.id??""));const params=new URLSearchParams(window.location.search);setStatus(params.get("status"));const sessionId=params.get("session");if(sessionId){const {data:s}=await supabase.from("neroxa_checkout_sessions").select("id,status,gateway_status,gateway_payment_id,amount,customer_name,customer_email").eq("id",sessionId).maybeSingle();if(s)setSession(s as Session);}}catch(e){setError(e instanceof Error?e.message:"Não foi possível carregar o checkout.");}finally{setLoading(false);}})()},[]);
 const plan=useMemo(()=>plans.find(p=>p.id===planId),[plans,planId]);
 const total=(Number(plan?.price_monthly??0)+Number(plan?.setup_price??0));
 async function startCheckout(){
  if(!plan||!name.trim()||!email.trim()){setError("Informe nome e e-mail e selecione um plano.");return}
  setError(null);setCreating(true);
  try{const {data,error}=await supabase.functions.invoke("mercado-pago-checkout",{body:{planId:plan.id,customerName:name,customerEmail:email,customerPhone:phone,returnOrigin:window.location.origin}});if(error)throw error;if(data?.error)throw new Error(data.error);setCheckoutUrl(data.checkoutUrl);}
  catch(e){setError(e instanceof Error?e.message:"Não foi possível iniciar o checkout.");}
  finally{setCreating(false)}
 }
 if(authorized===false)return <MasterLogin/>;
 if(authorized===null||loading)return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100"><Loader2 className="h-7 w-7 animate-spin"/></main>;
 return <MasterShell><div className="mx-auto min-w-0 max-w-5xl space-y-5 overflow-x-hidden px-3 py-5 sm:px-6 sm:py-6">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-medium tracking-wide text-muted-foreground/70">Teste · Mercado Pago</p><h1 className="mt-1 text-2xl font-semibold text-foreground">Fluxo de contratação</h1><p className="mt-1 text-sm text-muted-foreground">Simule a contratação de um plano sem movimentar dinheiro real.</p></div><Link to="/master"><Button variant="outline"><ArrowLeft className="h-4 w-4"/>Voltar</Button></Link></div>
  {status&&<Card className="border-emerald-200 bg-success/10 p-4"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600"/><div><p className="font-semibold text-emerald-900">{status==="success"?"Retorno do Mercado Pago recebido.":status==="pending"?"Pagamento pendente.":"Pagamento não aprovado."}</p><p className="mt-1 text-sm text-emerald-800">A confirmação definitiva acontece pelo webhook.</p></div></div></Card>}
  {error&&<Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>}
  {session&&<Card className="border-border bg-card p-5 shadow-soft"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sessão</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Status</p><p className="font-semibold">{session.status}</p></div><div><p className="text-xs text-muted-foreground">Valor</p><p className="font-semibold">{formatCurrency(session.amount)}</p></div><div><p className="text-xs text-muted-foreground">Pagamento</p><p className="font-semibold">{session.gateway_payment_id??"Aguardando webhook"}</p></div></div></Card>}
  <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
   <Card className="border-border bg-card p-6 shadow-soft"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-sidebar text-white"><ShoppingCart className="h-5 w-5"/></div><div><h2 className="font-semibold">Dados da contratação</h2><p className="text-xs text-muted-foreground">Use dados fictícios durante o teste.</p></div></div>
    <div className="mt-6 grid gap-4"><div><Label>Plano</Label><select value={planId} onChange={e=>setPlanId(e.target.value)} className="mt-1 flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm">{plans.map(p=><option key={p.id} value={p.id}>{p.name} · {formatCurrency(p.price_monthly)}/mês</option>)}</select></div><div><Label>Nome</Label><Input className="mt-1" value={name} onChange={e=>setName(e.target.value)} placeholder="Empresa ou responsável"/></div><div><Label>E-mail</Label><Input className="mt-1" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="cliente@exemplo.com"/></div><div><Label>Telefone</Label><Input className="mt-1" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="(62) 99999-9999"/></div></div>
    <Button className="mt-6 w-full" onClick={()=>void startCheckout()} disabled={creating}>{creating?<Loader2 className="h-4 w-4 animate-spin"/>:<ExternalLink className="h-4 w-4"/>}{creating?"Criando checkout…":"Ir para checkout de teste"}</Button>
   </Card>
   <Card className="border-border bg-sidebar p-6 text-slate-100 shadow-soft"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-slate-300"/><p className="text-xs font-medium tracking-wide text-sidebar-foreground/60">Sandbox</p></div><h2 className="mt-3 text-lg font-semibold">{plan?.name??"Selecione um plano"}</h2><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span className="text-sidebar-foreground/60">Implantação</span><span>{formatCurrency(plan?.setup_price)}</span></div><div className="flex justify-between"><span className="text-sidebar-foreground/60">1ª mensalidade</span><span>{formatCurrency(plan?.price_monthly)}</span></div><div className="border-t border-white/10 pt-3 flex justify-between font-semibold"><span>Total de teste</span><span>{formatCurrency(total)}</span></div></div>{checkoutUrl&&<Button asChild variant="secondary" className="mt-6 w-full"><a href={checkoutUrl} target="_blank" rel="noreferrer">Abrir checkout novamente <ExternalLink className="h-4 w-4"/></a></Button>}<p className="mt-4 text-xs leading-5 text-sidebar-foreground/60">Nenhuma cobrança real deve ser feita enquanto forem usadas credenciais e contas de teste do Mercado Pago.</p></Card>
  </div>
 </div></MasterShell>;
}
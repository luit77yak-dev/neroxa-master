import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, FileCheck2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type PublicContract = {
  id: string;
  contract_number: string | null;
  title: string;
  status: string;
  signature_status: "PENDING_CUSTOMER" | "PENDING_NEROXA" | "SIGNED";
  version: number;
  commercial_model: "SUBSCRIPTION" | "PERMANENT";
  billing_period: "MONTHLY" | "YEARLY" | "ONE_TIME" | null;
  recurring_value: number | null;
  setup_value: number;
  maintenance_value: number | null;
  currency: string;
  issued_at: string | null;
  term_months: number | null;
  started_at: string | null;
  customer_name: string | null;
  customer_document: string | null;
  neroxa_entity_type: "INDIVIDUAL" | null;
  neroxa_trade_name: string | null;
  neroxa_legal_name: string | null;
  neroxa_tax_id: string | null;
  customer_signed_at: string | null;
  neroxa_signer_name: string | null;
  neroxa_signer_role: string | null;
  neroxa_signed_at: string | null;
};

export const Route = createFileRoute("/assinar-contrato")({ component: SignContractPage });

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function SignContractPage() {
  const search = typeof window === "undefined" ? "" : window.location.search;
  const token = new URLSearchParams(search).get("token");
  const [contract, setContract] = useState<PublicContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const load = async () => {
    if (!token) {
      setMessage("Link de assinatura inválido.");
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("get_neroxa_public_contract" as never, { p_token: token } as never);
    if (error) setMessage(error.message);
    else setContract((data as PublicContract | null) ?? null);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [token]);

  const sign = async () => {
    if (!token) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.rpc("sign_neroxa_contract_as_customer" as never, {
      p_token: token,
      p_signer_name: name,
      p_signer_document: document || null,
      p_confirmed: confirmed,
    } as never);
    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Assinatura do cliente registrada com sucesso. Agora o contrato aguarda a assinatura da Neroxa.");
      await load();
    }
    setSaving(false);
  };

  if (loading) return <main className="grid min-h-screen place-items-center bg-background"><Loader2 className="h-7 w-7 animate-spin" /></main>;

  if (!contract) {
    return <main className="grid min-h-screen place-items-center bg-background px-4"><Card className="w-full max-w-lg p-8 text-center"><XCircle className="mx-auto h-10 w-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-semibold">Contrato indisponível</h1><p className="mt-2 text-sm text-muted-foreground">{message ?? "O link pode ter expirado ou não é válido."}</p></Card></main>;
  }

  const waitingCustomer = contract.signature_status === "PENDING_CUSTOMER";
  const signed = contract.signature_status === "SIGNED";

  return (
    <main className="min-h-screen bg-background px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="rounded-2xl border border-border bg-card p-5 text-center shadow-soft sm:p-8">
          <p className="text-[11px] font-semibold tracking-[0.22em] text-muted-foreground">NEROXA · CONTRATO COMERCIAL</p>
          <h1 className="mt-3 break-words text-2xl font-semibold leading-tight sm:text-3xl">{contract.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{contract.contract_number || "Contrato"} · versão {contract.version}</p>
        </header>

        <Card className="p-5 sm:p-7">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-lg bg-muted"><FileCheck2 className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">Contratante</p><p className="font-semibold">{contract.customer_name ?? "Cliente"}</p></div></div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Implantação</p><p className="mt-1 font-semibold">{money(contract.setup_value)}</p></div>
            <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Recorrência</p><p className="mt-1 font-semibold">{money(contract.recurring_value)}</p></div>
            <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Manutenção</p><p className="mt-1 font-semibold">{money(contract.maintenance_value)}</p></div>
          </div>

          <div className="mt-7 space-y-6 text-sm leading-6">
            <section><h2 className="font-semibold">1. Objeto</h2><p className="mt-1 text-muted-foreground">Prestação dos serviços e disponibilização do sistema descritos na proposta comercial vinculada a este contrato.</p></section>
            <section><h2 className="font-semibold">2. Valores e condições</h2><p className="mt-1 text-muted-foreground">Implantação: {money(contract.setup_value)}. Recorrência: {money(contract.recurring_value)}. Manutenção: {money(contract.maintenance_value)}.</p></section>
            <section><h2 className="font-semibold">3. Vigência</h2><p className="mt-1 text-muted-foreground">{contract.term_months ? `Prazo inicial de ${contract.term_months} meses.` : "Vigência a partir da ativação do contrato, conforme as condições comerciais desta versão."}</p></section>
            <section><h2 className="font-semibold">4. Partes e assinaturas</h2><p className="mt-1 text-muted-foreground">Este documento corresponde à versão {contract.version}. O conteúdo fica congelado após a primeira assinatura.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border p-4"><p className="font-medium">Cliente</p><p className="mt-1">{contract.customer_name || "Cliente"}</p><p className="text-xs text-muted-foreground">CNPJ: {contract.customer_document || "Não informado"}</p></div><div className="rounded-xl border border-border p-4"><p className="font-medium">Prestadora · Neroxa</p><p className="mt-1">{contract.neroxa_trade_name || "Neroxa | Soluções Personalizadas"}</p><p className="text-xs text-muted-foreground">Pessoa Física · CPF: {contract.neroxa_tax_id || "Não informado"}</p><p className="mt-2">{contract.neroxa_legal_name || contract.neroxa_signer_name || "Aguardando assinatura"}</p><p className="text-xs text-muted-foreground">Cargo: {contract.neroxa_signer_role || "Aguardando assinatura"}</p></div></div></section>
          </div>

          {message && <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4 text-sm">{message}</div>}

          {waitingCustomer && (
            <div className="mt-7 rounded-2xl border border-primary/20 bg-primary/5 p-5">
              <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><h2 className="font-semibold">Assinatura eletrônica do cliente</h2><p className="mt-1 text-sm text-muted-foreground">Informe os dados do responsável que está assinando e confirme a leitura do documento.</p></div></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-muted-foreground">Nome completo<input className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do responsável" /></label>
                <label className="text-xs font-medium text-muted-foreground">CPF/CNPJ <span className="font-normal">(opcional)</span><input className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" value={document} onChange={(e) => setDocument(e.target.value)} placeholder="Documento do responsável" /></label>
              </div>
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>Li o contrato completo acima e concordo com seus termos nesta versão.</span></label>
              <Button className="mt-5 w-full sm:w-auto" onClick={() => void sign()} disabled={saving || !confirmed || name.trim().length < 3}><CheckCircle2 className="h-4 w-4" />{saving ? "Registrando..." : "Assinar contrato"}</Button>
            </div>
          )}

          {contract.signature_status === "PENDING_NEROXA" && <div className="mt-7 rounded-2xl border border-border bg-muted/30 p-5"><CheckCircle2 className="h-6 w-6" /><h2 className="mt-3 font-semibold">Sua assinatura foi registrada</h2><p className="mt-1 text-sm text-muted-foreground">O contrato agora aguarda a assinatura da Neroxa.</p><p className="mt-3 text-xs text-muted-foreground">{contract.customer_signed_at ? `Assinado em ${new Date(contract.customer_signed_at).toLocaleString("pt-BR")}` : ""}</p></div>}

          {signed && <div className="mt-7 rounded-2xl border border-green-200 bg-green-50 p-5 text-green-900"><CheckCircle2 className="h-6 w-6" /><h2 className="mt-3 font-semibold">Contrato assinado pelas duas partes</h2><p className="mt-1 text-sm">Cliente e Neroxa concluíram as assinaturas desta versão.</p><p className="mt-3 text-xs">{contract.neroxa_signed_at ? `Assinatura finalizada em ${new Date(contract.neroxa_signed_at).toLocaleString("pt-BR")}` : ""}</p></div>}
        </Card>

        <p className="text-center text-xs text-muted-foreground">Neroxa · documento eletrônico · versão {contract.version}</p>
      </div>
    </main>
  );
}

import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, FileText, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type PublicProposal = {
  id: string;
  title: string;
  status: "SENT" | "NEGOTIATION" | "ACCEPTED";
  notes: string | null;
  valid_until: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  commercial_model: "SUBSCRIPTION" | "PERMANENT";
  billing_period: "MONTHLY" | "YEARLY" | "ONE_TIME" | null;
  recurring_value: number | null;
  setup_value: number;
  maintenance_value: number | null;
  currency: string;
  version: number;
  client_name: string;
  plan_name: string | null;
  system_name: string | null;
};

export const Route = createFileRoute("/proposta-publica")({
  component: PublicProposalPage,
});

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function PublicProposalPage() {
  const search = typeof window === "undefined" ? "" : window.location.search;
  const token = new URLSearchParams(search).get("token");
  const [proposal, setProposal] = useState<PublicProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    if (!token) {
      setMessage("Link de proposta inválido.");
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("get_neroxa_public_proposal" as never, { p_token: token } as never);
    if (error) setMessage(error.message);
    else setProposal((data as PublicProposal | null) ?? null);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [token]);

  const respond = async (action: "ACCEPTED" | "REJECTED") => {
    if (!token) return;
    setSaving(true);
    setMessage(null);
    const { data, error } = await supabase.rpc("respond_neroxa_public_proposal" as never, { p_token: token, p_action: action } as never);
    if (error) {
      setMessage(error.message);
    } else {
      const result = data as { status: PublicProposal["status"] };
      setProposal((current) => current ? { ...current, status: result.status } : current);
      setMessage(action === "ACCEPTED" ? "Proposta aceita com sucesso." : "Proposta recusada.");
    }
    setSaving(false);
  };

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-background"><Loader2 className="h-7 w-7 animate-spin" /></main>;
  }

  if (!proposal) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4">
        <Card className="w-full max-w-lg p-8 text-center">
          <XCircle className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">Proposta indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">{message ?? "O link pode ter expirado ou não é válido."}</p>
        </Card>
      </main>
    );
  }

  const canRespond = proposal.status === "SENT" || proposal.status === "NEGOTIATION";
  const expired = proposal.valid_until ? new Date(proposal.valid_until + "T23:59:59") < new Date() : false;

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="w-full rounded-2xl border border-border bg-card px-5 py-6 text-center shadow-soft sm:px-8 sm:py-7">
          <p className="text-[11px] font-semibold tracking-[0.22em] text-muted-foreground">
            NEROXA · PROPOSTA COMERCIAL
          </p>
          <h1 className="mx-auto mt-3 max-w-2xl break-words text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            {proposal.title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {proposal.client_name}
            {proposal.system_name ? ` · ${proposal.system_name}` : ""}
          </p>
        </header>

        <Card className="p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-muted"><FileText className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Plano</p>
              <p className="font-semibold">{proposal.plan_name ?? "Proposta personalizada"}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Implantação</p><p className="mt-1 font-semibold">{money(proposal.setup_value)}</p></div>
            <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">{proposal.commercial_model === "PERMANENT" ? "Manutenção" : "Recorrência"}</p><p className="mt-1 font-semibold">{proposal.commercial_model === "PERMANENT" ? money(proposal.maintenance_value) : money(proposal.recurring_value)}</p></div>
            <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Validade</p><p className="mt-1 font-semibold">{proposal.valid_until ? new Date(proposal.valid_until + "T12:00:00").toLocaleDateString("pt-BR") : "Sem prazo"}</p></div>
          </div>

          {proposal.notes && <div className="mt-6 rounded-xl border border-border p-4"><p className="text-xs font-medium text-muted-foreground">Observações</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{proposal.notes}</p></div>}

          <div className="mt-6 rounded-xl border border-border p-4 text-sm">
            <span className="font-medium">Status:</span> {proposal.status === "SENT" ? "Enviada" : proposal.status === "NEGOTIATION" ? "Em negociação" : "Aceita"}
          </div>

          {message && <p className="mt-4 text-sm font-medium">{message}</p>}

          {canRespond && !expired && (
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => void respond("REJECTED")} disabled={saving}><XCircle className="h-4 w-4" />Recusar</Button>
              <Button onClick={() => void respond("ACCEPTED")} disabled={saving}><CheckCircle2 className="h-4 w-4" />Aceitar proposta</Button>
            </div>
          )}
        </Card>

        <p className="text-center text-xs text-muted-foreground">Proposta comercial da Neroxa · versão {proposal.version}</p>
      </div>
    </main>
  );
}

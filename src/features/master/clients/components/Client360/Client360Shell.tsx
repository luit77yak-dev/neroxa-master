import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Building2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Section = {
  key: string;
  title: string;
  description: string;
  href?: string;
};

const SECTIONS: Section[] = [
  { key: "client", title: "Dados do cliente", description: "Dados cadastrais, status e contatos" },
  { key: "commercial", title: "Comercial", description: "Propostas e contratos", href: "/master-comercial" },
  { key: "subscription", title: "Plano e assinatura", description: "Planos, ciclos e situação", href: "/master-assinaturas" },
  { key: "systems", title: "Sistemas", description: "Sistemas e instâncias", href: "/master-sistemas" },
  { key: "domains", title: "Domínios", description: "Endereços e status dos domínios", href: "/master-dominios" },
  { key: "implementation", title: "Implantação", description: "Jobs e acompanhamento", href: "/master-implantacao" },
  { key: "finance", title: "Financeiro", description: "Cobranças e situação financeira", href: "/master-financeiro" },
  { key: "support", title: "Suporte", description: "Chamados e atendimentos", href: "/master-suporte" },
  { key: "audit", title: "Auditoria", description: "Histórico administrativo", href: "/master-configuracoes" },
];

export function Client360Shell({
  clientId,
  organizationId,
  clientName,
  status,
  initialSection = "client",
  onSectionChange,
  children,
}: {
  clientId: string;
  organizationId?: string | null;
  clientName: string;
  status: string;
  initialSection?: string;
  onSectionChange?: (section: string) => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const [openSection, setOpenSection] = useState(() =>
    SECTIONS.some((section) => section.key === initialSection) ? initialSection : "client",
  );
  const scrollPositionRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (scrollPositionRef.current === null || typeof window === "undefined") return;

    const scrollY = scrollPositionRef.current;
    scrollPositionRef.current = null;

    window.scrollTo(0, scrollY);

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
      window.requestAnimationFrame(() => window.scrollTo(0, scrollY));
    });

    return () => window.cancelAnimationFrame(frame);
  }, [openSection]);

  const handleSectionChange = (section: string) => {
    if (typeof window !== "undefined") {
      scrollPositionRef.current = window.scrollY;
    }

    setOpenSection(section);
    onSectionChange?.(section);
  };

  return (
    <div className="min-w-0 space-y-4">
      <Card className="overflow-hidden border-border bg-card shadow-soft">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <div className="h-9 w-1 shrink-0 rounded-full bg-slate-900" />
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-950 text-white">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{clientName}</p>
            <p className="text-[11px] text-muted-foreground">Cliente 360° · visão operacional</p>
          </div>
          <span className="shrink-0 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {status}
          </span>
        </div>
      </Card>

      <Card className="border-border bg-card shadow-soft">
        <div className="border-b border-border p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Visão operacional</p>
          <div className="mt-1 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">{clientName}</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Resumo rápido para operação. Abra a edição completa quando precisar alterar ou acompanhar detalhes.
              </p>
            </div>
            <span className="hidden shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">
              Cliente 360°
            </span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <SummaryItem label="Status" value={status} />
            <SummaryItem label="Visão" value="Operacional" />
            <SummaryItem label="Edição" value="Expansível" />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-muted/50 sm:px-5"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Edição completa</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Toque para abrir os módulos do cliente.</p>
          </div>
          <ChevronDown
            className={["h-5 w-5 shrink-0 text-muted-foreground/70 transition-transform", expanded ? "rotate-180" : ""].join(" ")}
          />
        </button>

        {expanded && (
          <div className="border-t border-border p-3 sm:p-5">
            <div className="overflow-hidden rounded-xl border border-border">
              {SECTIONS.map((section) => {
                const isOpen = openSection === section.key;

                return (
                  <section key={section.key} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => handleSectionChange(isOpen ? "" : section.key)}
                      className="flex min-h-16 w-full items-center justify-between gap-4 bg-card px-4 py-3 text-left transition hover:bg-muted/50 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{section.title}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{section.description}</p>
                      </div>
                      <ChevronDown
                        className={[
                          "h-5 w-5 shrink-0 text-muted-foreground/70 transition-transform",
                          isOpen ? "rotate-180" : "",
                        ].join(" ")}
                      />
                    </button>

                    {isOpen && (
                      <div className="border-t border-border/60 bg-muted/50/70 p-3 sm:p-4">
                        {section.key === "client" ? (
                          <div className="min-w-0">{children}</div>
                        ) : section.href ? (
                          <a
                            href={`${section.href}?clientId=${encodeURIComponent(clientId)}${organizationId ? `&organizationId=${encodeURIComponent(organizationId)}` : ""}`}
                            className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 transition hover:border-input hover:bg-muted/50"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground">Abrir {section.title}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Continuar esta operação no módulo correspondente.
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                          </a>
                        ) : null}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

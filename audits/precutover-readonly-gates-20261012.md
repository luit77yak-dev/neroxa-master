# PR #37 — verificação read-only de pré-cutover (12/10/2026)

**Resultado:** **NO-GO para produção**. Registro de auditoria na branch `audit/store-isolation-candidate-20261011`, sem migração remota, DML, deploy ou merge. Os dados abaixo são agregados/sanitizados; não há UUIDs de clientes nem credenciais.

## Evidências conferidas nesta revisão

1. **GitHub Master** — PR [#37](https://github.com/luit77yak-dev/neroxa-master/pull/37) aberta em draft, sem merge; head inspecionado `0d96eacb23e5c54c63d33686b46ee57e431a6a37`. No head inspecionado, [Build and Test #38317977002](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38317977002) concluiu com sucesso (lint, test, build e format), assim como [inventário #38317976961](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38317976961). **Esta evidência pertence ao SHA indicado**; novos commits exigem conferir checks novamente.
2. **Pizza Perfect Plate** — [PR #37](https://github.com/luit77yak-dev/pizza-perfect-plate/pull/37) aberta em draft, sem merge, head inspecionado `3f6d9edb4c64f6b63684098e62999b58ac5f3854`. [Build and Lint #38318014447](https://github.com/luit77yak-dev/pizza-perfect-plate/actions/runs/38318014447) concluído com sucesso. [PR #36](https://github.com/luit77yak-dev/pizza-perfect-plate/pull/36), sobre autorização de adições ao pedido, também segue draft.
3. **Master Supabase** — projeto `iefaoaqzltvpfabyeelj` reportou `ACTIVE_HEALTHY`. Consultas **exclusivamente SELECT** ao catálogo operacional atual:
   - `neroxa_storefront_settings`: **5** configurações, **4** organizações com uma instância e **1** organização com **zero instâncias**; nenhuma com múltiplas.
   - `neroxa_storefront_delivery_zones`: **1** zona, ligada a organização com uma instância; **0** zonas sem instância.
   - A **única** organização correspondente a configuração não reconciliada registra `active = true`, `status = CANCELLED`, **uma** assinatura com `status = TRIAL` e **zero** membros ativos. São campos de domínios diferentes; **não concluir automaticamente** que a configuração pode ser excluída, desativada ou atribuída a instância arbitrária.

## Ensaios aprovados — escopo limitado

- [Recuperação pós-cutover em clone #38261570628](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38261570628): relatada como PASS em `audits/catalog-consumers-postcutover-20261012.md`, incluindo estado A1/A2 após gravações, dados/digests e controles de Auth/RLS. **Não prova** downgrade da PK por organização nem disaster recovery independente entre clusters.
- [Checkout HTTPS isolado #38306941709](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38306941709): relatado como PASS em `audits/checkout-https-enabled-rehearsal-20261012.md`: **275** verificações Auth/JWT/RLS + **49** integração de gateway + **30** chamadas HTTPS reais no TanStack = **354**, sem falhas. **Não prova** segurança do roteamento de domínio publicado no Vercel.

## Bloqueios a fechar antes de qualquer release

1. **Decisão e reconciliação da configuração histórica sem instância.** Verificar o estado comercial/operacional contraditório (`active=true`, `CANCELLED`, assinatura `TRIAL`) e registrar destino autorizado. Proibir remoção silenciosa ou mapeamento por primeira instância.
2. **Consumidores legados e efetivamente publicados.** Confrontar Master, Pizza Perfect Plate, painel `/painel`, itens adicionais, status do pedido, RPCs, jobs e outros deploys; inventário estático não comprova roteamento real ou compatibilidade.
3. **Ingress confiável no Vercel/edge.** Homologar domínio verificado de teste, `request.url` originada de roteamento confiável e testes contra Host/Origin falsificados. Headers fornecidos pelo cliente não são prova de identidade.
4. **Autorização/abuso.** Fechar PR #36 do Pizza Perfect Plate, bypass de RPC público, privilégios de `service_role`, antiabuso/quotas, logs sem PII e retenção de hashes HMAC.
5. **Recuperação operacional.** Exercitar runbook de congelamento de escrita, snapshot pós-cutover, restore e roll-forward com consumidores implantados; bloquear downgrade da PK caso A1/A2 contenham configurações distintas.
6. **Gate de qualidade.** Conferir CIs de todos os SHAs candidatos e tratar separadamente os 43 erros preexistentes de `tsc --noEmit` relatados em `audits/ci-pr37-20261012.md`; build Vite verde não equivale ao typecheck completo.

## Sequência recomendada

Reconciliar o dado órfão **após decisão explícita**; inventariar consumidores e contratos RPC publicados; validar ingress/checkout e PR #36 no ambiente isolado; ensaiar recuperação operacional; repetir matrizes e CI nos SHAs finais; só então revisar autorização de release.

**Gates:** manter PRs draft, Master remoto somente leitura e produção sem deploy/migração até todos os itens relevantes terem evidência rastreável.

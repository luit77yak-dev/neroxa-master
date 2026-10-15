# NEROXA — F02: plano de contenção e decisão de engenharia (15/10/2026)

**STATUS:** P0 leitura e escrita em clone confirmados; F01/F02 ABERTOS, Marco 01 0/7, operação comercial NÃO LIBERADA. **AVANÇAR COM RESTRIÇÕES NA CORREÇÃO; SEM CUTOVER.**

## Identidade / escopo
- Master PR #46: entrada `12567f0140086668674f4c1a4b1a77d97b00911d`; runner de descoberta com mutação indevida [38752338356](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38752338356) testou Master `e86b182f0a3e4ad9c5c923be0863aa296e60af79`, não o HEAD documental.
- Delivery PR #42: `4ce88959a751066f96da4cbab8d1fc9ac29bb320`. PRs permanecem draft e protegidas contra auto-deploy.
- A evidência provém de Supabase descartável, sem exploração remota, sem dados reais, sem alterações em produção. Runner SUCCESS só indica conclusão do ensaio forense.
- Demos `food.neroxa.ia.br` / `mvp.neroxa.ia.br`: DEMONSTRAÇÃO INTERNA — LEGADO DISTRIBUÍDO; mesmo deployment. Projeto Delivery tem 14 aliases / 11 deployments; 10 previews com backend efetivo ainda **UNKNOWN**. Não inferir exposição real sem telemetria/autorização.

## Risco e decisão
1. Prioridade P0: substituir caminhos legados de acompanhamento e alteração de pedidos por operações cuja autorização seja vinculada à instância, ao pedido e a uma capability/identidade legítima.
2. Reutilizar o candidato isolado de amendment já existente, sem ativação automática: `audits/sql/order-amendment-capability.candidate.sql` e overlays `group-addons-capability.candidate.sql` / `store-availability-capability.candidate.sql`. Seu manifesto `audits/02a5/AMENDMENT-MANIFEST.json` mantém estado BLOCKED.
3. Exigir preço calculado no servidor, idempotência sob repetição e concorrência, histórico, estado de pagamento, checkout/browser completo, separação de capability para tracking/amendment, cross-store A/B/C e digests antes/depois.
4. Auditar todos overloads text/enum, wrappers, SECURITY DEFINER, default ACL e grants efetivos. Preservar diferenças de perfil Master × Delivery e hashes originais/derivados da migration 18.
5. **Gate de revogação continua BLOCKED:** consumidores/owners/versões/bindings distribuídos não comprovados; nenhum `CONSUMER-DISABLEMENT.json` nem GUC artificial. Pós-gate NOT RUN.
6. Fundação/Coordenação devem decidir separadamente manter restrito, suspender com controle ou substituir as demos, considerando aliases técnicos e dez previews; qualquer alteração remota requer despacho específico do fundador. Suspender a UI **não revoga** o acesso direto às RPCs antigas.
7. Não restaurar grants inseguros ou StaffPanel no plano de recuperação. Primeiro testes PostgreSQL/Supabase descartáveis; todos os casos classificados PASS/FAIL/BLOCKED/NOT RUN com SHAs e logs.

**AÇÕES NESTE COMMIT:** documentação apenas. Sem alteração de código comercial, workflows, SQL executável, grants, domínio, deploy ou banco.

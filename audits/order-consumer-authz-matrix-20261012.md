# Auditoria de consumidores de pedidos — Master × Pizza Perfect Plate (12/10/2026)

**Decisão: NO-GO para produção.** Esta auditoria diferencia evidência da branch do delivery, snapshot histórico do Master e hipóteses ainda não testadas. **Nenhum SQL foi aplicado à produção.** PRs #37 permanecem DRAFT, sem merge.

## Escopo e fontes

- Master: `luit77yak-dev/neroxa-master`, branch `audit/store-isolation-candidate-20261011`; código candidato, matriz local Auth/JWT/RLS e `audits/ab-auth/master-catalog-20261009.json` (snapshot histórico, **não** catálogo de produção em tempo real).
- Delivery: `luit77yak-dev/pizza-perfect-plate`, branch `audit/delivery-instance-checkout-20261012`; frontend `Storefront`, `CheckoutPanel`, `TrackedOrderPanel`, `/admin/pedidos`, `/painel`, rotas e migrations.
- PR delivery [#36](https://github.com/luit77yak-dev/pizza-perfect-plate/pull/36): **proposta draft separada**, baseada na PR #33, de credencial de alteração por pedido. Não está integrada à PR #37; não reutilizar seu SQL/token sem revisão de assinatura, serialização, idempotência e coordenação entre branches.
- Testes isolados anteriores: [HTTP HTTPS habilitado, 38306941709](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38306941709) — 275 Auth + 49 gateway/PG + 30 HTTP, **354 aprovados**. Isso **não** certifica todos os consumidores nem o deploy Vercel.

## Matriz de caminhos reais identificados

### C1 — Criação de pedido (checkout público; risco residual alto)

- `src/features/storefront/components/CheckoutPanel.tsx:214-270` envia `organization_id`, `instance_id`, `store_domain` e `idempotency_key`. Com `VITE_NEROXA_CHECKOUT_GATEWAY=true`, chama `POST /api/checkout`, **sem fallback à RPC**; com flag desligada, chama diretamente `create_public_order`.
- Gateway `src/server/checkout-gateway.ts` resolve domínio/instância, valida campos divergentes e HMAC-quota antes do pedido; candidato Master `audits/sql/storefront-rpcs-phase2.candidate.sql` recalcula produto/preço no servidor. Testado entre A/B da mesma organização e C de outra.
- **Bloqueio:** a função pública histórica tinha EXECUTE para `anon` e `authenticated` (snapshot de 09/10). Revogação candidata de `create_public_order(jsonb)` passou no clone, **não** aplicada à produção. Edge/host de verdade e consumidores externos não verificados.

### C2 — Adicionar item esquecido/complemento (P0 — autorização do comprador)

- `src/features/storefront/components/CheckoutPanel.tsx:120-157` usa `append_public_order_items_with_payment` com `p_order_id`, `p_customer_phone`, `p_items` e `p_payment_method`, direto do navegador. **Não envia credencial exclusiva por pedido**.
- O snapshot histórico Master define `append_public_order_items_with_payment(uuid,text,jsonb,text)` como `SECURITY DEFINER` com EXECUTE `anon`/`authenticated`. Identifica o pedido por UUID+telefone, aceita `RECEIVED`, `CONFIRMED`, `PREPARING` e `READY`, altera subtotal/total e `payment_method`. O SQL calcula preço por `instance_id` do pedido e bloqueia produto de outra instância, **mas UUID+telefone não é autenticação de comprador robusta**.
- Migrations legadas do Delivery `20260927140000_allow_public_order_item_additions.sql` e `20260928133000_fix_append_order_items_with_payment.sql` também expõem escrita `anon` pelo par UUID+telefone, agora em `public.orders`. É um **segundo modelo de dados**, não o mesmo objeto Master.
- **Mitigação candidata na PR #37 delivery:** no modo gateway protegido, a interface esconde `onAddToOrder` e `CheckoutPanel` recusa complementos antes da RPC antiga. Quando a flag está desligada, o fluxo legado fica inalterado; essa mitigação **NÃO revoga execução direta no PostgREST**.
- **Candidato NÃO executado remotamente:** `audits/sql/legacy-order-append-no-bypass.release-gate.candidate.sql` revoga execução direta no clone para `anon`/`authenticated`, incluindo `append_public_order_items(uuid,text,jsonb)` se existir. **Não usar em qualquer loja ativa** sem endpoint alternativo seguro; interromperia itens esquecidos.
- **Saída requerida:** credencial aleatória não adivinhável por pedido/finalidade, verificada no backend, vinculada à instância e a prazo/estado, revogável e sem exposição em URL/log; RPC antiga desativada de modo atômico e ensaio A/B/C.

### C3 — Acompanhamento do pedido (P1 — privacidade)

- `src/components/storefront/Storefront.tsx:122-125,902-905` chama `get_public_order_status` com ID+telefone. A branch já guarda snapshots locais por **instância**, prevenindo mistura no navegador.
- Snapshot Master: `get_public_order_status(uuid,text)` é `SECURITY DEFINER`, EXECUTE por `anon`/`authenticated`, devolve **nome, telefone, endereço, observações e itens** quando conhece ID+telefone. Testes existentes negam telefone incorreto; isso não certifica confidencialidade suficiente para uma operação comercial.
- **Pendente:** capability/token separado de leitura ou autorização equivalente, limitação de consultas e minimizar resposta pública. **Não revogar a RPC antes de migrar os consumidores**, pois quebraria acompanhamento.

### C4 — Painel novo de pedidos (controlado por instância, com ressalvas)

- `src/routes/admin/pedidos.tsx:62-85,140-148`: exige sessão no frontend, resolve contexto por domínio, chama `get_admin_orders(p_instance_id)` e `update_admin_order_status(p_order_id,...)`.
- Candidato Master `audits/sql/storefront-admin-rpc.candidate.sql` filtra pela instância e função de papel. `audits/sql/storefront-rpcs-phase2.candidate.sql:236-260` recupera a instância do pedido antes de avaliar papel, evitando confiar no ID fornecido no cliente.
- Matriz Auth/JWT/RLS isolada exerce operadores A/B/C e recusas cruzadas. **Não certifica ACL e runtime de produção**; verificar sempre a identidade/papel no SQL, não no frontend.
- Fluxo de transições permite qualquer valor de status da enumeração, sem matriz explícita de transições no candidato. Isso merece validação operacional (ex.: impedir retorno de `DELIVERED` para `RECEIVED` sem auditoria).

### C5 — Painel legado `/painel` (P0/P1 — legado por organização)

- `src/routes/painel.tsx:191-216` escolhe a primeira associação ativa à organização (`.limit(1)`), não uma instância resolvida de domínio.
- `src/routes/painel.tsx:609-614` lê `public.orders` e itens pela chave `organization_id`. `:906-913` chama `update_order_status(p_order_id,p_organization_id,p_status)`; `:667-692` subscreve itens em realtime com filtro apenas de organização.
- Outras operações (produtos, addons, bairros, horários e settings) também usam tabelas legadas sem `instance_id`. A PR #37 não migrou nem desativou esta rota. **Não concluir que a rota não é usada em deploy ativo sem inspeção do ambiente real.**
- **Pendente:** decidir migração de operações por instância ou desativação controlada após substituição, usando roteamento confiável, membership/role SQL e testes interlojas. Conferir RLS das tabelas legadas separadamente.

### C6 — Complementos no pedido inicial e pagamentos

- `CheckoutPanel.tsx:231-252` transforma complementos em linhas para `create_public_order`; preço de produto principal e itens separados é recalculado em SQL candidato. A/B/C validaram produto estrangeiro negado.
- `append_public_order_items_with_payment` pode alterar `payment_method`; isso **não equivale a pagamento capturado, confirmado ou liquidado**. Não marcar pedidos como pagos sem integração transacional/conciliation específica.

### C7 — Consumidores externos e deploy (não verificados)

- PR #36/#33, versões publicadas, scripts de terceiros e webhooks podem continuar chamando RPCs antigas. Inventário estático do Master encontrou **ocorrências**, não todos os consumidores; não assumir cobertura total.
- `VITE_NEROXA_CHECKOUT_GATEWAY` e as flags de servidor permanecem desligadas em produção até plano coordenado de cutover, reversão, suporte e proteção na borda.

## Gates para retirar este NO-GO

1. Homologar API de modificação com autorização exclusiva do comprador e `instance_id` validado no servidor; provar negação de replay, token ausente/errado/expirado e troca de instância, preços e status.
2. Testar **em clone descartável** revogação de todas as RPCs de escrita antigas para `anon`/`authenticated` e inexistência de outros canais de mutação, antes de planejar ativação.
3. Migrar acompanhamento público para leitura com autorização e resposta mínima; preservar UX dos pedidos em andamento.
4. Resolver `/painel` e quaisquer consumidores de `public.orders` por organização; documentar destino de dados legados e compatibilidade.
5. Verificar status do pedido, transições, pagamentos e permissões de cada papel real.
6. Validar trusted ingress/edge, rate limiting, segredos menos privilegiados, limpeza de HMACs, dados históricos órfãos e rollback/roll-forward após novas gravações.
7. Repetir CI completo e documentar as dependências externas; **somente depois** solicitar autorização específica de release.

**Não confundir CI verde do checkout principal com certificação de itens esquecidos, acompanhamento, painel legado ou produção.**

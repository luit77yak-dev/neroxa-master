# Item esquecido — capacidade de comprador, SQL atômico e HTTPS local (12/10/2026)

**Resultado:** ensaio isolado aprovado; **NO-GO para implantação**. Nenhum SQL executado na produção
do Neroxa Master, nenhum merge e nenhuma flag ativada na Vercel. PRs #37 permanecem DRAFT.

## Evidências reproduzíveis

- [Neroxa Master / Isolated A-B Auth Matrix / run 38317636564](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38317636564):
  **success**, usando Supabase Auth, PostgREST e PostgreSQL 17 descartáveis.
- Matriz Auth/JWT/RLS: **275 PASS, 0 FAIL**.
- Checkout, bloqueios de bypass e cotas persistentes: **54 PASS, 0 FAIL**.
- Novo ensaio PostgreSQL de capacidade para item esquecido: **43 PASS, 0 FAIL**.
- Handler HTTPS real do TanStack, checkout + alteração habilitados no clone: **47 PASS, 0 FAIL**.
- **Total na execução integrada: 419 verificações aprovadas, zero falhas.**
- Consumer Pizza Perfect Plate: [CI 38317138016](https://github.com/luit77yak-dev/pizza-perfect-plate/actions/runs/38317138016),
  **33/33 testes PASS**, lint, TypeScript, build e smoke HTTP com rotas desativadas.

Os relatórios JSON saneados estão no artefato `ab-auth-evidence-38317636564`, incluindo
`order-amendment-capability.json` e `checkout-http-enabled.json`.

## Implementação candidata, sem ativação comercial

Arquivo `audits/sql/order-amendment-capability.candidate.sql`:

- `private.neroxa_order_amendment_capabilities` guarda somente SHA-256 de um token aleatório
  de **256 bits** e sua associação com `order_id` e `instance_id`. Validade candidata: **2 horas**,
  com `revoked_at`; não armazena token em texto puro.
- RPC `neroxa_register_order_amendment_capability` cria a autorização **somente uma vez**,
  após checkout com chave de idempotência coincidente, instância ACTIVE e pedido elegível.
  Tentativas posteriores não retornam nem substituem o token anterior.
- RPC `neroxa_append_order_items_with_capability` exige token, pedido e instância corretos,
  estado **RECEIVED ou CONFIRMED**, preço recalculado no servidor e linha válida da mesma loja.
  Pedido `PREPARING` requer outro fluxo com aprovação; `READY` e posteriores são negados.
- O pedido é travado com `SELECT ... FOR UPDATE`. `private.neroxa_order_amendment_operations`
  guarda `request_key`, digest canônico do payload, valor acrescido e totais resultantes.
  Repetição idêntica é idempotente; tentativa de reutilizar a chave com outro payload falha.
- O valor adicional recebe `payment_state='NOT_SETTLED'`. **Não há captura, liquidação,
  conciliação nem aprovação financeira implícita**.
- Funções novas são `SECURITY DEFINER`, com `EXECUTE` revogado de `PUBLIC`, `anon` e
  `authenticated`; `service_role` mantém execução **somente no adaptador de servidor**.
  RPC histórica com UUID+telefone também foi revogada **apenas no clone** para impedir bypass.

No consumidor, a rota `POST /api/order-amend` usa somente a credencial privada de servidor,
resolve o domínio e reserva cota persistente antes da RPC. O checkout gera o token com
`crypto.randomBytes(32)` e só o entrega na resposta da primeira emissão bem-sucedida,
com `Cache-Control: no-store`. O frontend guarda o token em **sessionStorage por
instância/pedido**, não em histórico/localStorage nem URLs. O botão de complemento exige
token presente e status elegível.

A liberação exige simultaneamente as flags de checkout existentes mais:

- `NEROXA_CHECKOUT_AMENDMENTS_ENABLED=true` (servidor).
- `VITE_NEROXA_CHECKOUT_AMENDMENTS=true` (frontend).

**Todas desativadas por padrão**. Com a rota protegida ativa, não há fallback à RPC histórica
de complemento. As flags não foram habilitadas em produção nem em preview.

## Negativos testados em banco e em HTTPS local

- Token incorreto, expirado e revogado; registro indevido, tentativa de registrar outro pedido
  ou reaproveitar chave de checkout para reemitir segredo.
- `anon` e `authenticated` negados nas RPCs novas, mesmo com token válido.
- Produto e pedido de outra instância (inclusive A/B na mesma organização) recusados.
- Preço adulterado, quantidade zero, array vazio e mudança de pagamento impedidos.
- Seis workers concorrentes repetindo a mesma operação: **uma inclusão efetiva**.
- Replay idempotente com o mesmo payload retornando o total original; payload diferente
  com a mesma chave recusado.
- Estado `CONFIRMED` permitido; `PREPARING` e `READY` negados.
- Na rota HTTPS local habilitada: criação de pedidos A/B com capacidades distintas,
  inclusão autorizada de A, recusa por token errado ou domínio/Origin incorreto, preço
  de servidor e **HTTP 429 após cinco inclusões de B**, sem sexta linha no banco.
- Acesso direto anônimo por PostgREST com token válido não contorna a ACL testada.

## Bloqueadores não resolvidos

1. **Roteamento confiável do domínio:** testes HTTPS locais não certificam a Vercel/edge;
   `Host`, `Origin` e `request.url` não autenticam por si sós um cliente externo.
2. **Consumidores legados:** scripts, versões publicadas, `public.orders`,
   `/painel`, RPCs antigas e outras integrações requerem inventário, migração e
   revogação coordenada sem interromper o checkout de clientes existentes.
3. **Acompanhamento/privacidade:** a RPC antiga de rastreamento ainda aceita UUID+telefone
   e pode retornar PII; precisa de autorização de leitura independente e minimização.
4. **Pagamento:** ainda não há confirmação/aceite da cobrança incremental pelo fornecedor.
   O sistema não deve tratar totais alterados como pagamento liquidado.
5. **Capacidade perdida:** se o cliente perder a primeira resposta depois da emissão, um
   replay seguro não deve revelar novamente o token. Planejar recuperação autenticada,
   sem reemissão por telefone, antes do release.
6. **Segurança operacional:** credencial `service_role` ampla, proteção de borda,
   revisão de XSS/sessionStorage, observabilidade, retenção dos hashes, operações
   administrativas de revogação e teste de UI em navegador real.
7. **Compatibilidade e DR:** resolver a linha histórica de settings sem instância,
   consumidores externos, snapshot/roll-forward e restauração após escritas do cutover.

**Decisão: DRAFT / NO-GO.** O ensaio comprova funcionalidade e bloqueio do caminho candidato
no clone; não autoriza merge, deploy, mudanças de flags nem SQL no Supabase de produção.

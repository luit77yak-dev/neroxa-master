# Prova integrada de checkout + PostgREST + revogação de RPC — 12/10/2026

**Evidência:** GitHub Actions [38271595042](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38271595042), job `auth-matrix`, **PASS**.

**Escopo:** branch draft `audit/store-isolation-candidate-20261011` do Neroxa Master e gateway pinado do Pizza Perfect Plate no commit `2dec40f30cbc9b9d8089d768fe2a945f67f4603a` (PR #37 do delivery). Não houve merge, deploy nem alteração no Supabase de produção.

## O que realmente foi executado

1. GitHub Actions montou PostgreSQL 17, Supabase Auth e PostgREST locais em rede de teste com bind de loopback, reconstruiu o catálogo Master histórico e aplicou **migrations candidatas apenas no clone descartável**.
2. A matriz Auth/JWT/RLS/PostgREST histórica executou **275 testes PASS, 0 FAIL** antes de qualquer revogação de EXECUTE.
3. O workflow fez checkout do **código exato** `src/server/checkout-gateway.ts` do repositório consumidor, usando SHA fixo; o teste `tools/ab-auth/checkout_gateway_integration.mjs` importou diretamente esse módulo TypeScript no Node 22.
4. O teste descobriu domínios `a.ab.invalid`, `b.ab.invalid` e `c.ab.invalid` no PostgREST local: A/B são **instâncias diferentes da mesma organização**; C pertence a outra organização.
5. **Somente após** a matriz anônima anterior, o teste aplicou o candidato `audits/sql/checkout-public-rpc-revoke.release-gate.candidate.sql` **no PostgreSQL descartável**, confirmando `EXECUTE=false` para `anon` e `authenticated` e `EXECUTE=true` para `service_role`.
6. As chamadas diretas `POST /rest/v1/rpc/create_public_order` com JWTs reais `anon` e `authenticated` foram recusadas por PostgREST (SQLSTATE `42501`); o gateway importado, por sua vez, resolveu o domínio e criou pedidos pelas RPCs reais usando a credencial **local** do papel de serviço.
7. Testou criação isolada A e B, preço de servidor apesar de `unit_price=0.01` informado pelo navegador, idempotência, rejeição de domínio/instância incompatíveis, domínio não cadastrado e produto de outra loja; contagem final comprovou **exatamente +1 pedido na A, +1 na B e 0 na C**.
8. **34 verificações integradas PASS, 0 FAIL**; artefato saneado `ab-auth-evidence-38271595042` contém `checkout-gateway-integrated.json` e evidências da matriz. A stack descartável foi removida no cleanup.

## Limites: o que NÃO foi demonstrado

- O gateway foi invocado como módulo `handleCheckoutRequest` com dependências conectadas ao **PostgREST local real**. **Não** foi testado o handler HTTP concreto do TanStack `/api/checkout` montado em Vercel, nem o import `checkout-gateway.server.ts` dentro do runtime Vercel.
- Os valores HTTPS/Host/Origin da `Request` eram **sintéticos**; um cliente não-browser pode falsificar cabeçalhos. A origem roteada por domínio de verdade ainda depende de configurações de edge confiáveis e ensaio específico, incluindo Host/Forwarded falsificados.
- A matriz comprova ausência de bypass **da função `create_public_order(jsonb)` testada** após a revogação candidata. **Não prova** que outros RPCs/canais legados de pedidos são incapazes de criar pedidos sem autorização; precisam de inventário e validação.
- Não há rate limiting persistente, monitoramento de abuso, teste de concorrência ou quotas por domínio/identidade/IP. A `service_role` em um gateway público tem alto privilégio e exige controle adicional ou substituição por credencial menos privilegiada.
- Nenhuma das credenciais de produção foi usada. A classificação é **INCONCLUSIVO para implantação**, apesar de 309 verificações agregadas aprovadas neste job.
- O script de revogação **não integra nenhuma migração de produção** e **não foi aplicado ao Master**; seu uso futuro exigiria mudança coordenada de todos os consumidores e preservação do rollback/roll-forward.
- A linha histórica em `neroxa_storefront_settings` sem instância segue pendente de reconciliação. Recuperação lógica pós-cutover e recuperação operacional entre clusters são gates separados.

## Próximos gates bloqueadores

1. Definir e comprovar host/dominio confiável no gateway real sob roteamento de teste, com endpoint e banco fictício; testar requests falsificadas e ausência de bypass via outras rotas.
2. Implementar e testar controle de abuso **persistente e atômico**, antes da chamada de serviço, com logs saneados, idempotência robusta e janelas de quota adequadas.
3. Aplicar revogação SQL somente em cluster descartável num ensaio completo **do HTTP real do TanStack e seus consumidores**, comprovando que nenhum consumidor antigo quebra.
4. Auditar clientes legados, itens adicionais, acompanhamento de pedido, segurança de token e painel administrativo.
5. Resolver o registro real sem instância **sem atribuição arbitrária ou perda de dados**, e homologar plano operacional de cutover/restore.

**Decisão:** PRs do Master e do Pizza Perfect Plate devem permanecer **DRAFT**; release **NO-GO**; Supabase Master produção **READ-ONLY**.

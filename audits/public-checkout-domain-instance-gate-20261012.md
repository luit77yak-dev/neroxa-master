# Gate de domínio e instância do checkout público — 12/10/2026

**Estado: CANDIDATO, NO-GO para produção.** Este documento pertence à PR #37 do Neroxa Master, que deve permanecer **draft**. O Supabase de produção permanece **somente leitura**.

## Contrato e teste local

A função candidata `public.create_public_order(p_order jsonb)` em `audits/sql/storefront-rpcs-phase2.candidate.sql` exige:

- `organization_id`: UUID da organização (não é uma credencial).
- `instance_id`: UUID da loja, obrigatoriamente ativa e vinculada à organização.
- `store_domain`: domínio retornado por `get_public_storefront_catalog(p_domain)` em `context.domain`, e não inferido de um ID arbitrário no frontend.
- Validação no PostgreSQL: `public.get_public_storefront_context(store_domain)` deve devolver exatamente a mesma instância e organização; esta função histórica só resolve domínios `VERIFIED`, instâncias `ACTIVE`, organização ativa e sistemas ativos.
- A associação é checada **antes** da recuperação de pedidos por `idempotency_key`; tentativas com domínio divergente não podem recuperar um pedido pela chave.

A PR draft do consumidor [Pizza Perfect Plate #37](https://github.com/luit77yak-dev/pizza-perfect-plate/pull/37) transporta `context.instance_id` e `context.domain` ao checkout e separa o armazenamento local por loja. A nova matriz isolada inclui dois estabelecimentos A1/A2 da mesma organização e um terceiro C de outra organização, exercitando os casos de domínio desconhecido, faltante, cruzado, de outra organização, envio válido, preço no servidor e reuso indevido da chave de idempotência.

**Atenção:** SQLSTATE `42501` para usuários `anon` é exposto pelo PostgREST como HTTP **401**, enquanto usuários autenticados podem receber HTTP 403. Testes devem exigir a recusa por SQLSTATE `42501`, sem presumir HTTP 403 em todos os papéis.

## Limite fundamental do teste

`store_domain` é **um campo enviado pelo cliente**. Compará-lo ao cadastro de domínios é uma validação real de consistência dos dados em PostgreSQL, **mas não comprova que a requisição partiu do site daquela loja**. Um cliente externo pode conhecer domínio e ID públicos e apresentar um par válido.

`Origin`, `Referer` e `X-Forwarded-Host` informados pelo cliente também não são provas criptográficas de origem. O checkout público requer medidas contra abuso, mas sua abertura a consumidores anônimos impede tratar identidade pública da loja como credencial secreta.

## Gate adicional de arquitetura antes de implantação

1. Definir e validar ingress de checkout **same-origin** por domínio de loja, cujo servidor obtenha domínio da conexão/contexto roteado por infraestrutura confiável, sem aceitar o domínio de corpo como autoridade. Garantir que a requisição efetiva esteja associada a domínio cadastrado/validado.
2. Impedir o bypass do ingress: migrar consumidores de `create_public_order` para o endpoint da aplicação antes de revogar `EXECUTE` de `anon`/clientes em RPC pública, caso esta arquitetura seja adotada. A chave privilegiada **nunca** deve estar no navegador e sua utilização exige auditabilidade.
3. Validar requisições falsificadas por API direta, cabeçalhos Host/Origin/Forwarded adulterados, domínio inexistente/desativado, instância errada, organização errada, produtos de outra loja, retries, rate limits e duplicidade de pedidos.
4. Coordenar a compatibilidade de deploy: o frontend com campos extras pode preceder o backend; publicar o backend que exige `store_domain` **antes** de disponibilizar o frontend compatível quebra o checkout atual.
5. Fechar itens adicionais/acompanhamento (incluindo PR #36 do Pizza Perfect Plate), painel legado, política de retenção de sessão e todos os consumidores publicados.
6. Resolver a configuração histórica sem instância, executar testes integrados com dados fictícios e um procedimento de recuperação/roll-forward validado.

**Decisão:** esta PR não autoriza release. Os ensaios históricos de restauração pós-cutover continuam separados do gate de deploy da aplicação. Não aplicar SQL remoto, fazer merge ou implantar sem autorização e evidências finais.

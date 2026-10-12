# Homologação isolada do checkout HTTP HTTPS habilitado — 12/10/2026

**Status:** ENSAIO LOCAL APROVADO — **NO-GO PARA PRODUÇÃO**. As PRs do Master e do Pizza Perfect Plate continuam DRAFT. Não houve merge, aplicação de SQL no Supabase remoto, mudança de configuração no Vercel ou deploy manual.

## Evidência objetiva

- Workflow: [Neroxa Master / Isolated A-B Auth Matrix / 38306941709](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38306941709), resultado **success**.
- Artefato saneado `ab-auth-evidence-38306941709`: `result.json`, `checkout-gateway-integrated.json` e `checkout-http-enabled.json`.
- Matriz histórica Auth/JWT/PostgREST/RLS: **275 verificações aprovadas, 0 falhas**.
- Gateway importado do consumidor contra PostgREST/PG real: **49 verificações aprovadas, 0 falhas**.
- **Handler real do TanStack Start `POST /api/checkout` com gateway habilitado, HTTPS local e DB descartável: 30 verificações aprovadas, 0 falhas**.
- Total combinado no mesmo workflow: **354 verificações aprovadas, 0 falhas**. A classificação de compatibilidade com produção permanece **INCONCLUSIVO** por envolver apenas ambiente de teste.

## Como o ensaio foi montado

O CI preparou PostgreSQL 17, Auth e PostgREST reais em rede de teste ligada apenas ao loopback, sem dados ou credenciais de produção. Reconstruiu o catálogo histórico do Master e aplicou as migrações candidatas somente nesse clone. Revogou o EXECUTE direto da `create_public_order(jsonb)` para `anon` e `authenticated` apenas no clone, provando que o servidor permanece capaz de registrar pedidos após o bloqueio do bypass.

O GitHub Actions fixou o código do Pizza Perfect Plate em SHA `aea8e5816d490a94e4ba3550bc63dfcd8011e5e3` e criou um certificado HTTPS temporário para `a.ab.invalid`, `b.ab.invalid`, `c.ab.invalid` e `unknown.ab.invalid`. Executou o **servidor de desenvolvimento real do TanStack**, ligado exclusivamente ao Supabase descartável, com `NEROXA_CHECKOUT_GATEWAY_ENABLED=true`, `VITE_NEROXA_CHECKOUT_GATEWAY=true` e segredo HMAC aleatório de teste, nunca salvo no repositório.

O ensaio validou todos os caminhos:
- `POST` real por HTTPS habilitado criou pedido na instância A, e outro na B da **mesma organização**, com IDs e preços corretos calculados no PostgreSQL.
- Repetição da mesma chave de idempotência recuperou a identidade do mesmo pedido.
- Alterar `instance_id` ou `organization_id` da loja, falsificar `Origin`, fornecer `Host` incompatível e acessar domínio sem cadastro foram rejeitados.
- Produto de outra loja foi rejeitado no PostgreSQL real sem criar pedido.
- Cinco pedidos do mesmo telefone fictício em B foram aceitos; o sexto retornou **HTTP 429** e não criou outro pedido.
- Contagens finais confirmadas: **+1 pedido em A, +6 em B, +0 na loja C**, incluindo não criação por tentativas recusadas.
- A etapa anterior também validou quota com 12 reservas simultâneas: 5 aceitas e 7 negadas; quota por loja e contato, e função de quota inacessível diretamente a usuários comuns.

## Compatibilidade Host / Origin no TanStack

O diagnóstico no runtime real mostrou que o TanStack pode remover completamente o cabeçalho `Host` da `Request` ao encaminhar a chamada, preservando `request.url` e `Origin`. A versão antiga exigia `Host` presente e recusava uma origem válida com HTTP 403. O consumidor agora verifica:
1. HTTPS e hostname da `request.url`, rejeitando localhost e previews de provedores no gateway privilegiado.
2. `Origin` obrigatório e **igual ao `request.url.origin` completo**, inclusive protocolo e porta.
3. Se `Host` estiver **presente**, ele deve corresponder ao host exato (ou à normalização sem porta pelo adaptador), recusando porta explicitamente errada ou domínio diferente.
4. `Sec-Fetch-Site` quando presente e o contexto de domínio `VERIFIED`/instância `ACTIVE` resolvido novamente pelo PostgreSQL.
5. Nenhum uso de `X-Forwarded-Host` informado pelo cliente para determinar loja.

**Limite de segurança essencial:** cabeçalhos `Origin`, `Host` e `request.url` não são provas criptográficas de identidade do consumidor. Em produção o hostname de `request.url` **deverá ser assegurado pelo roteamento confiável do provedor**, independentemente de cabeçalhos fornecidos diretamente pelo cliente. Um cliente não-browser pode tentar forjá-los; quotas/antispam continuam essenciais.

## Pendências de liberação comercial

1. Homologar **edge/Vercel** com domínio de teste e roteamento autenticado/permitido pelo provedor, sem trafegar dados de produção e sem aceitar host arbitrário.
2. Implementar limitação/defesa contra abuso no edge (IP confiável da infraestrutura, bot/spam), monitoramento sem dados sensíveis e um plano de retenção/limpeza para os hashes HMAC de contatos no PostgreSQL.
3. Evitar uso excessivamente privilegiado de `service_role`; definir credencial restrita e segredos rotacionáveis onde viável.
4. Inventariar e compatibilizar demais consumidores legados do checkout, painel admin, complementos, itens adicionais e acompanhamento; assegurar ausência de RPCs públicas alternativas capazes de criar/alterar pedidos indevidamente.
5. Resolver a configuração histórica de settings sem instância, planejar rollout coordenado da revogação de RPC e da ativação do gateway, e terminar homologação de recuperação/roll-forward e compatibilidade com gravações feitas após o cutover.

**Conclusão:** o checkout HTTP protegido funciona no ensaio local de ponta a ponta. Isso não é uma autorização de release. Manter as PRs #37 em draft e produção estritamente READ-ONLY.

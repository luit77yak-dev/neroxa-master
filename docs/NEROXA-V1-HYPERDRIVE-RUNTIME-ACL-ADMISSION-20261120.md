# NEROXA V1 — Hyperdrive runtime ACL / service contract | 2026-11-20

**STATUS:** REVIEW REQUIRED — NO GO. Análise estática das unidades SQL do manifesto de release imutável e catálogo comercial em leitura. **Nenhum usuário PostgreSQL, grant, Hyperdrive, Worker ou deployment foi criado/modificado**.

## Evidência direta

- Supabase comercial aprovado: `iefaoaqzltvpfabyeelj` (`ACTIVE_HEALTHY`), PostgreSQL 17, host anunciado `db.iefaoaqzltvpfabyeelj.supabase.co:5432`.
- Catálogo em leitura após reset de testes: `public_tables=33`, `public_rls_tables=33`, `new_release_tables=0`, `organizations=0`, `orders=0`, `storefront_settings=0`, `base_plans=18`, `platform_members=4`.
- 58 migrações históricas e 0 funções atuais de registration capability; a release de 33 SQLs não foi instalada.
- `anon_executable_definers=14`, `authenticated_executable_definers=16`, 3 RPCs legadas de checkout/tracking existentes; estes alertas continuam até o cutover técnico.
- Nenhum role PostgreSQL com prefixo `neroxa%` encontrado na consulta de catálogo. **Isso não representa autorização para criar automaticamente um usuário.**

## Compatibilidade obrigatória antes de criar o Hyperdrive

Os candidatos SQL atuais não são neutros em relação ao papel de execução: alguns concedem `EXECUTE` **somente a `service_role`**, não a um papel login customizado. `SECURITY DEFINER` não torna uma função executável por qualquer papel; o novo papel precisa de autorização apropriada. Não conceder `service_role`/ `postgres` inteiro a um login de Hyperdrive para contornar o problema.

Inventário de funções service-only explícitas encontradas nos SQLs (número da unidade entre parênteses), a ser reconciliado com **chamadas concretas e fluxo de autenticação do Worker final**:

- `public.neroxa_recover_group_order(uuid,uuid,jsonb)` (16)
- `public.neroxa_recovery_reserve_quota(uuid,text)` (16)
- `public.neroxa_register_tracking_capability(uuid,uuid,uuid,text)` (25)
- `public.neroxa_track_order_with_capability(uuid,uuid,text)` (25)
- `public.neroxa_tracking_reserve_ingress(text)` (26)
- `public.neroxa_checkout_reserve_quota(uuid,text)` (27)
- `public.neroxa_register_order_amendment_capability(uuid,uuid,uuid,text)` (28)
- `public.neroxa_append_order_items_with_capability(uuid,uuid,text,uuid,jsonb)` (28)
- `public.neroxa_register_buyer_capabilities(uuid,uuid,uuid,text,text)` (33)

As unidades 29 e 30 redefinem a função de alteração de pedido; revisar direitos finais após o último `CREATE OR REPLACE` e após cada etapa de hardening. Este inventário **não é uma lista de grants prontos para executar**: faltam leitura de storefront, criação de pedidos, execução de outros fluxos e limites/escopo do runtime final. Precisamos resolver a arquitetura de API final: conexão Postgres direta via Hyperdrive com role dedicada e grants mínimos, ou HTTPS/PostgREST com autoridade server-only; não misturar `service_role` do PostgREST com uma role SQL customizada por inferência.

## Sequência de admissão sem senhas no chat

1. Revisar o contrato RPC final e a prova da identidade Cloudflare `account/Worker/version/release/domínio`. Manter `HOSTED_SERVER` fechado enquanto não existir.
2. Aprovar separadamente `SQL_RELEASE` e instalar **somente** as 33 unidades da release mediante sessão nativa TLS/libpq admitida, recovery e custódia. Não executar DDL por Hyperdrive nem misturar este passo com grants de runtime.
3. Com a estrutura instalada e a lista completa de RPCs, revisar/autorizar uma role dedicada **LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS**, privilégios mínimos e regras claras de `USAGE`/`EXECUTE` por assinatura. Não conceder acesso indiscriminado a schemas/tabelas privados, `auth` ou `storage`.
4. Gerar e guardar senha forte **somente em UI/canal de segredo aprovado**, por exemplo Supabase Dashboard/Cloudflare Dashboard; nunca em Markdown, comando shell com histórico, repositório, chat, log ou resposta da ferramenta.
5. Cloudflare Hyperdrive: criar **nova** configuração, vinculada ao **host direto** do projeto comercial, `database=postgres`, `caching.disabled=true`, TLS `verify-full` e CA compatível, e validar conexão. O Hyperdrive testa a autenticação na criação; não pode ser criado validamente sem usuário e senha.
6. Verificar o alvo real em sessão própria de mínimo privilégio; proteger credentials, janela, rollback e limites de conexões. Associar o binding a um **Worker comercial separado** somente após admissão `HOSTED_SERVER` e testes HTTP reais. Nunca alterar `neroxa-v1-i04-lab` ou o Worker de LAB.
7. Testar negativos de funções e RLS, rate limits, tracking sem telefone, idempotência e A1/A2/C1 antes de abrir tráfego. Falha => `HOLD` sem publicação.

## Transporte, documentação e custos

- Cloudflare recomenda **Supabase Direct Connection**, não pooler Supavisor, para Hyperdrive. O Supabase diz que o host direto é IPv6 por padrão e só terá IPv4 direto com add-on; conectividade efetiva e modo TLS **ainda não foram demonstrados**. Não presumir que o hostname nominal bastou.
- Hyperdrive `verify-full` valida o hostname do certificado. Suas limitações de estado de sessão justificam manter a instalação SQL nativa/libpq separada.
- Supabase: https://supabase.com/docs/guides/database/postgres/roles ; https://supabase.com/docs/guides/database/connecting-to-postgres
- Cloudflare: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/ ; https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/

**Bloqueios vigentes:** manifesto `execution_authorized=false`, `approval=null`; `tools/hosted-admission/preflight-policy.json` em `CLOSED` com host/role/CA/authority não admitidos; Hyperdrive comercial inexistente. Nenhum compromisso de GO baseado apenas em CI.

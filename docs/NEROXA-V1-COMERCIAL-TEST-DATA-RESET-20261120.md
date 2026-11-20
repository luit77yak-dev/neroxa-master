# NEROXA V1 — limpeza autorizada de dados comerciais de teste | 2026-11-20

**Status:** `TEST_DATA_CLEANUP=PASS`; `COMMERCE_GO=NO-GO`. Evidência direta das integrações Supabase/GitHub. Esta limpeza **não é** a instalação da release de 33 SQLs.

## Escopo e autorização

O proprietário declarou explicitamente que os cadastros, propostas, contratos, assinaturas e configurações comerciais históricos eram **dados de teste** e autorizou alteração e até exclusão. Escopo estrito aplicado: apenas o Supabase comercial `iefaoaqzltvpfabyeelj` (`neroxa-solutions-hub`), não o LAB `gomexvhvecvvfbdzhjct` nem os demais projetos, `auth.users`, Storage, catálogo-base ou contas administrativas. Nenhuma credencial apareceu no relatório.

- Projeto comercial: PostgreSQL 17, `ACTIVE_HEALTHY` antes e após.
- Inventário de partida: 33 tabelas `public`, 537 linhas totais.
- Verificação de dependências: 51 FKs envolvendo `public`, 24 tabelas relacionadas por dependência a `public.neroxa_organizations`; todas incluídas juntas na limpeza. FKs para `auth.users` são referências de saída; nenhuma alteração em `auth.users`.
- Conferência de triggers `ON TRUNCATE` não internos no esquema `public`: 0.
- Ensaio: transação com `TRUNCATE ... RESTRICT`, confirmação temporária de 0 organizações/contratos/produtos storefront e 18 planos + 4 membros administrativos, seguida de `ROLLBACK`. Leitura independente antes da operação final comprovou restauração de 5 organizações, 8 contratos e 43 produtos storefront.
- Execução autorizada: transação única `BEGIN` / `TRUNCATE ... RESTRICT` / `COMMIT` com `lock_timeout=3s`, `statement_timeout=15s`. **Não foi usado `CASCADE`, `DROP`, `DELETE FROM auth`, alteração de schema, script SQL_RELEASE ou manipulação de migrações.**
- **Resultado:** 24/24 tabelas selecionadas com 0 linhas em consulta independente pós-commit; 118 linhas eliminadas, 419 preservadas; comercial segue `ACTIVE_HEALTHY`.

## Tabelas esvaziadas (24)

`neroxa_billing_records`, `neroxa_checkout_sessions`, `neroxa_client_contacts`, `neroxa_contract_signatures`, `neroxa_contracts`, `neroxa_order_items`, `neroxa_order_status_history`, `neroxa_orders`, `neroxa_organization_members`, `neroxa_organizations`, `neroxa_proposals`, `neroxa_provisioning_jobs`, `neroxa_storefront_addon_groups`, `neroxa_storefront_addons`, `neroxa_storefront_categories`, `neroxa_storefront_delivery_zones`, `neroxa_storefront_product_addon_groups`, `neroxa_storefront_products`, `neroxa_storefront_settings`, `neroxa_subscriptions`, `neroxa_support_messages`, `neroxa_support_tickets`, `neroxa_system_domains`, `neroxa_system_instances`.

**Apenas dados foram removidos**; as tabelas, constraints, funções, RLS, índices e as 58 migrações históricas permanecem. Os dados apagados não têm uma cópia de recuperação fornecida por este procedimento; a autorização do proprietário abrangia descarte dos testes.

## Preservação deliberada (8 tabelas / 419 linhas)

| Tabela | Linhas pós-operação |
| --- | ---: |
| `neroxa_audit_logs` | 77 |
| `neroxa_plan_features` | 210 |
| `neroxa_plan_products` | 81 |
| `neroxa_plans` | 18 |
| `neroxa_platform_members` | 4 |
| `neroxa_platform_settings` | 3 |
| `neroxa_products` | 19 |
| `neroxa_systems` | 7 |

Esses dados não foram classificados como clientes reais; foram **preservados intencionalmente** para não destruir catálogos e acesso administrativo necessários à continuidade da NEROXA e para manter histórico de auditoria. Nenhum `auth.users` foi removido.

## Segurança e gates que NÃO mudaram com o reset

- Advisor Supabase pós-limpeza: 14 avisos de `SECURITY DEFINER` executável por `anon`, 16 por `authenticated`, 1 de proteção contra senha vazada; 2 informações de RLS sem política. Esses avisos são superfície de auditoria, não prova automática de exploração.
- `get_public_order_status(order_id, phone)` permanece legado; não confundir linhas vazias com redução de exposição funcional.
- Histórico de migrações Supabase: **58**, última `20261009133857`; **33 SQLs da nova release ainda não instaladas/admitidas**, manifesto permanece `execution_authorized=false`, `approval=null`, política `HOSTED_PREFLIGHT=CLOSED`.
- Hyperdrive existente `neroxa-v1-i04-lab` continua exclusivo do LAB, não foi criado binding comercial.
- Nenhum merge em `main`, deployment comercial, mudança DNS ou ativação de checkout/tracking decorre desta limpeza.

## Próximo avanço

Preparar acesso comercial de runtime de mínimo privilégio por canal de credenciais seguro, Hyperdrive independente e preflight real TLS/libpq; revisar as concessões RPC legadas; aprovar separadamente `SQL_RELEASE` e `HOSTED_SERVER` e testar F01/F02/SEC-18/HTTP. Dados comerciais testados e descartados **não dispensam** os testes de segurança.

**Fronteira operacional:** este procedimento foi uma **autorização limitada a DML de teste**, não autorização para as 33 unidades SQL de schema, para exposição de serviços, nem para publicar a NEROXA.

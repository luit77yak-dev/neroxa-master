# NEROXA V1 — inventário comercial somente-leitura | 2026-11-20

**Natureza:** inspeção de metadados e contagens via conectores Supabase/Cloudflare, sem credenciais expostas, sem migrações, sem DDL/DML, sem deployment ou merge. **Não equivale ao `HOSTED_PREFLIGHT` nativo em sessão TLS/libpq.**

## Destino e estados conferidos

- **Destino comercial confirmado pelo solicitante:** Supabase `iefaoaqzltvpfabyeelj` (`neroxa-solutions-hub`), `us-east-1`, PostgreSQL 17. Estado `ACTIVE_HEALTHY` após retomada.
- **LAB principal:** `gomexvhvecvvfbdzhjct` (`neroxa-f01-f02-sec18-lab`), `ACTIVE_HEALTHY`. Manter isolado.
- **LAB antigo:** `nvbmzdgfretwnkdfqcap` (`neroxa-homologacao`), `INACTIVE` após pausa autorizada.
- **Delivery test antigo:** `uvyinrojuhizjqbuzdcy`, `INACTIVE`.
- Organização Supabase no plano Free; nenhuma contratação/upgrade realizada.

## Catálogo comercial observado

- `public`: 33 tabelas, todas com RLS habilitada; ausência do esquema `neroxa_v1` na enumeração `pg_namespace`/tabelas consultada.
- Histórico Supabase: 58 migrações listadas, última `20261009133857 add_storefront_visual_overrides`. Isto **não demonstra aplicação** das 33 unidades SQL da release atual.
- Contagens agregadas, sem leitura/registro de linhas individuais: 5 organizações; 4 instâncias de sistema; 3 domínios; 5 configurações storefront; 8 assinaturas; 8 contratos; 0 pedidos; 0 itens de pedido. A discrepância entre cinco configurações e quatro instâncias requer reconciliação antes de corte, mas **não comprova por si só órfão**.
- Reconciliação agregada sem identificadores: **1 configuração storefront pertence a uma organização sem instância de sistema correspondente**; **0 configurações sem organização**, **0 instâncias sem configuração na organização** e **0 configurações vinculadas a organização com `active=false`**. Não classificar nem excluir esta configuração automaticamente; requer decisão administrativa e cópia recuperável antes de qualquer corte.
- Não tratar o banco como destino vazio; preservar preimagem e dependências.

## Achados do Security Advisor Supabase

- `31 WARN` em 3 categorias: `14` alertas de `SECURITY DEFINER` executável por `anon`, `16` por `authenticated`, `1` de proteção de senhas vazadas.
- `2 INFO`: RLS habilitada sem políticas nas tabelas `public.neroxa_order_items` e `public.neroxa_order_status_history`.
- Inspeção pontual de catálogo `pg_proc` e `has_function_privilege` confirmou `SECURITY DEFINER=true`, `EXECUTE` para `anon` e `authenticated` em `create_public_order`, `append_public_order_items_with_payment`, `get_public_order_status`, `update_admin_order_status`, `get_admin_orders`, `get_public_storefront_context`.
- **Avaliação:** exposição de superfície legada a revisar. Privilégio não constitui, isoladamente, prova de exploração; exigir checagens efetivas de autorização e corte dos consumidores antes de publicar.
- Remediações oficiais: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable e https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Cloudflare / Hyperdrive

- Hyperdrive `neroxa-v1-i04-lab` (ID `e7570caf4da24a53838d3cb9a234d9ac`) tem origem `db.gomexvhvecvvfbdzhjct.supabase.co:5432/postgres` — **aponta para o LAB**, não para o Supabase comercial.
- Cache do Hyperdrive desativado. Não reutilizar esse binding para runtime comercial. Criar ou aprovar destino comercial separado apenas com identidade, TLS, credenciais e rollback específicos.
- Inspeção anterior: Worker `neroxa-v1-i04-api-lab` mantém a versão LAB e não serve como identidade da release comercial.

## Gates de admissão

| Gate | Estado | Critério não atendido |
| --- | --- | --- |
| Destino designado | PASS | Referência confirmada e estado saudável |
| Inventário do destino | PASS (somente leitura) | Não substituir por host preflight |
| `HOSTED_PREFLIGHT` TLS/libpq | NOT_RUN | Host, role, CA, identidade, janela e autoridade ainda não aprovados |
| SQL_RELEASE / 33 unidades | BLOCKED | Manifesto `execution_authorized=false`, `approval=null`; preservar hashes |
| ACL/RLS e RPC legado | BLOCKED | Grants observados em funções sensíveis |
| Reconciliar organizações/instâncias/configurações | PENDING | Validação e decisão de retenção nominal, com custódia/rollback |
| HYPERDRIVE comercial | NOT_CONFIGURED | Binding atual direcionado ao LAB |
| HOSTED_SERVER Cloudflare | NOT_ADMITTED | Worker/version/release/domínios e autoridade de assinatura sem prova operacional |
| HTTP real / SEC-18 / F01 / F02 | NOT_CLOSED | Testes hospedados e rollback final ainda exigidos |
| Comercial | NO-GO | Nenhuma ativação autorizada |

## Próxima sequência segura

1. Inspecionar mapas de consumidores e as decisões administrativas das cinco configurações sem expor registros pessoais; preservar e reconciliar o legado.
2. Preparar identidade Cloudflare específica de `account/worker/version/release/domínios` e conexão exclusiva para o comercial; exigir TLS/CA e credenciais fora do chat.
3. Aprovar separadamente `HOSTED_PREFLIGHT` de leitura, `SQL_RELEASE` e `HOSTED_SERVER`; nunca inferir autorização a partir de CI ou do destino confirmado.
4. Em janela supervisionada e com recuperação, fazer cortes de RPC legadas, instalar somente a cadeia exata admitida e executar negativos de isolamento e testes HTTP reais.
5. Decidir GO apenas após provas, integridade remota, aprovação humana e rollback pronto.

**Invariantes:** sem SQL remoto de escrita nesta etapa, sem alteração de `preflight-policy.json`, sem edição do manifesto de 33 unidades, sem merge/deploy/ativação de tráfego.
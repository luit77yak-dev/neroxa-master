# NEROXA V1 — inventário comercial somente-leitura | 2026-11-20

**Natureza:** inspeção de metadados e contagens via conectores Supabase/Cloudflare, sem credenciais expostas, sem migrações, sem DDL/DML, sem deployment ou merge. **Não equivale ao `HOSTED_PREFLIGHT` nativo em sessão TLS/libpq.**

## Classificação dos dados de teste — esclarecimento do proprietário (2026-11-20)

- O proprietário confirmou que os cadastros, contratos, propostas e assinaturas mencionados nesta homologação **são testes do sistema, não relações comerciais reais**. Essa é uma declaração do proprietário, **não uma validação independente de cada linha**.
- O aparente conflito `CANCELLED` / contrato `ACTIVE` / proposta `ACCEPTED` / assinatura `TRIAL` **não deve mais ser tratado como disputa contratual real**. Reclassificar como **higienização técnica de dados de teste antes do GO**, mantendo as dependências e a segurança de isolamento.
- Esta classificação **não autoriza exclusão, alteração ou migração automática**. Antes de qualquer saneamento, inventariar impacto, garantir cópia recuperável e rollback, isolar acesso público e obter autorização explícita para o plano de escrita.
- As análises anteriores permanecem como evidência de estados observados, mas suas menções a `HOLD administrativo/contratual` ficam **superadas por esta classificação**. Os gates de runtime/SQL/segurança permanecem fechados.

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
- Investigação adicional em `2026-11-20`, ainda **somente leitura**, confirmou o cenário da única configuração sem instância: organização com `status='CANCELLED'` mas `active=true`; 1 assinatura `TRIAL`, 1 contrato e 1 proposta. Sem pedidos, domínios, membros, contatos, tickets, zonas de entrega ou sessões de checkout associados nas tabelas diretamente verificadas. Não se divulgou nome, UUID, dados de clientes ou contatos.
- **Conflito contratual confirmado por contagem/status, sem identidade pessoal:** o único contrato vinculado à organização cancelada tem estado `ACTIVE`, e a única proposta vinculada tem estado `ACCEPTED`. A assinatura relacionada está em `TRIAL`. Essa combinação foi reclassificada pelo proprietário como **dados de teste**, sem litígio contratual real. O bloqueio remanescente é o **saneamento técnico seguro** antes de ativar clientes reais.
- **Aviso de integridade:** a FK `neroxa_storefront_settings.organization_id -> neroxa_organizations.id` possui `ON DELETE CASCADE`; portanto, eliminar a organização poderia apagar essa configuração. Contratos e propostas usam FKs `ON DELETE RESTRICT`, acrescentando dependências históricas. Proibir exclusão/reassociação automática.
- Não existe role PostgreSQL com prefixo `neroxa%` no comercial, conforme `pg_roles` em leitura. Isto não exclui funções existentes com outros nomes; não há credencial de runtime específica aprovada.
- **Desfecho de reconciliação:** configuração **identificada tecnicamente, segregação ainda NÃO executada**. Requer inventário de impacto, custódia recuperável, prova de restituição, janela e autorização separada de escrita para higienização de dados de teste.
- Não tratar o banco como destino vazio; preservar preimagem e dependências.

## Achados do Security Advisor Supabase

- `31 WARN` em 3 categorias: `14` alertas de `SECURITY DEFINER` executável por `anon`, `16` por `authenticated`, `1` de proteção de senhas vazadas.
- `2 INFO`: RLS habilitada sem políticas nas tabelas `public.neroxa_order_items` e `public.neroxa_order_status_history`.
- Inspeção pontual de catálogo `pg_proc` e `has_function_privilege` confirmou `SECURITY DEFINER=true`, `EXECUTE` para `anon` e `authenticated` em `create_public_order`, `append_public_order_items_with_payment`, `get_public_order_status`, `update_admin_order_status`, `get_admin_orders`, `get_public_storefront_context`.
- **Avaliação:** exposição de superfície legada a revisar. Privilégio não constitui, isoladamente, prova de exploração; exigir checagens efetivas de autorização e corte dos consumidores antes de publicar.
- Remediações oficiais: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable e https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Análise focal de RPCs e mapeamento de instâncias (somente leitura, 20/11)

- Quatro instâncias comerciais em classes distintas: `BARBER/ACTIVE` com organização `LEAD` e nenhum domínio; `DELIVERY/ACTIVE` com organização `IMPLEMENTATION` e dois domínios; `FOOD/ACTIVE` com organização `ACTIVE` e um domínio; `FOOD/PROVISIONING` com organização `PAUSED` e nenhum domínio. Cada uma possui uma configuração associada. **Não liberar todas por inferência.**
- Dos três domínios registrados, **dois estão `VERIFIED`** (um Delivery e um Food) e **um `VERIFYING`** (Delivery). Não há prova de que a verificação externa DNS e a rota da release comercial estejam prontas.
- Leitura do `pg_get_functiondef` confirmou: `get_public_order_status(p_order_id, p_customer_phone)` retorna JSON incluindo nome, telefone e endereço do comprador após identificação por ID+telefone; legado deve ser fechado e substituído por capability antes da publicação.
- `get_admin_orders` e `update_admin_order_status` chamam `neroxa_is_platform_member()`; a função exige `auth.jwt()->>'aal' = 'aal2'` e vínculo ativo em `neroxa_platform_members`. Isso é um controle explícito interno; **não declarar essas funções exploráveis somente por `EXECUTE` concedido**. Ainda restam avaliação de escopo por instância e negativos reais de ACL/SEC-18 antes de GO.
- `create_public_order` aceita payload público e resolve instância pelo `organization_id`; a definição observada **não aplica quota durável ou confirmação por capability** neste ponto. Bloqueio de novos pedidos e corte de consumidores legados continuam necessários.
- Nenhuma linha individual de cliente, pedido, telefone ou identificador de organização foi extraída para o repositório.

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
# PR #37 — Reconciliação estrutural, consumidores e ensaio pós-cutover (12/10/2026)

**Estado:** catálogo histórico/atual compatível nas categorias verificadas; consumidores e autorização de implantação **NO-GO**; PR #37 deve permanecer **draft**. Produção Supabase Master `iefaoaqzltvpfabyeelj` consultada somente com `SELECT`/metadata; **nenhuma DDL/DML, merge ou deploy**.

## Comparação read-only entre snapshot 09/10 e Master atual

| Componente | Histórico | Atual | Diferenças |
| --- | ---: | ---: | ---: |
| Colunas: nomes, posições, `format_type`, default, nulidade, identity, generated | 438 | 438 | 0 |
| Relações: tipo, proprietário, RLS, FORCE RLS, views, ACL como conjuntos | 34 | 34 | 0 |
| Funções: proprietário, EXECUTE ACL, argumentos, resultados, volatilidade, SECURITY DEFINER, `proconfig` | 50 | 50 | 0 |
| Constraints: nomes, `pg_get_constraintdef(oid,true)`, validação | 145 | 145 | 0 |
| Triggers: nomes, `pg_get_triggerdef(oid,true)` | 22 | 22 | 0 |
| Default ACL do schema public (owner/tipo/grantees) | 6 | 6 | 0 |
| Extensions: nome, schema, versão | 5 | 5 | 0 |
| Enums: nome, labels, owner, ACL | 10 | 10 | 0 |

**Importante:** 46 divergências anteriores de constraints e quatro de triggers desaparecem quando a consulta atual usa o **mesmo parâmetro de formatação** (`pretty=true`) do snapshot. A equivalência textual do DDL reconstruído **não** substitui teste de regressão ou reconciliação completa dos dados.

O catálogo de índices, policies, dependências indiretas e consumidores permanece sujeito aos gates registrados anteriormente, mesmo onde comparações preliminares foram favoráveis.

## Diagnóstico de dados históricos reais — apenas agregados

| Dados | Total | Organização sem instância | Organização com uma instância | Com múltiplas |
| --- | ---: | ---: | ---: | ---: |
| Configurações `neroxa_storefront_settings` | 5 | **1** | 4 | 0 |
| Zonas `neroxa_storefront_delivery_zones` | 1 | 0 | 1 | 0 |

**Bloqueio material:** o backfill conservador da fase 1 não resolve a configuração de uma organização que não tem instância associada. A fase 2 deve impedir o cutover com essa linha não reconciliada. Não atribuir automaticamente nem apagar dados. Reexaminar esse agregado imediatamente antes de qualquer migração, pois produção pode mudar.

Consulta de FKs declaradas apontando para a relação `public.neroxa_storefront_settings`: **zero FKs encontradas**. Isso não certifica views, funções, integrações, triggers nem dependências operacionais da antiga PK.

## Consumidores identificados

### Neroxa Master — repositório da PR

- `src/routes/master-catalogo.tsx:214-221`: escritor direto de settings, `upsert` com `instance_id` e `onConflict: 'instance_id'`. Requer cutover e compatibilidade com PK/índice. **Não usar esta branch como garantia de compatibilidade com schema antigo em produção.**
- `src/routes/master-catalogo.tsx:174,180`: categorias e produtos lidos por `instance_id`.
- As funções históricas `create_public_order`, `get_public_storefront_catalog`, `calculate_public_order_line_price`, `get_admin_orders`, `update_admin_order_status`, `append_public_order_items_with_payment` e `get_public_order_status` dependem de validação por loja; SECURITY DEFINER/RLS/executores não são certificados por busca estática.
- Workflow `legacy-consumer-inventory.yml`, run **38261198240 PASS** (commit `28103985`), encontrou **157 ocorrências de referências diretas ou nomes de RPC** no código do Master. **São ocorrências, não 157 consumidores independentes; muitas são SQLs candidatos ou testes.** Artefato: `legacy-consumers-inventory`. A ferramenta não avalia automaticamente SQL de funções em produção nem código de outros repositórios.

### Pizza Perfect Plate — repositório externo ao Master

- `src/features/storefront/components/CheckoutPanel.tsx:204-245`: `create_public_order` recebe payload com **`organization_id` mas sem `instance_id`**. O candidato `audits/sql/storefront-rpcs-phase2.candidate.sql:7-22` **exige** `instance_id` ativo validado contra organização. **BLOQUEADOR de compatibilidade e disponibilidade do checkout** enquanto o consumidor não for atualizado e testado; binding do ID ao domínio confiável ainda pendente.
- `src/core/delivery/services/load-public-store.ts:66-80` e `src/features/storefront/services/load-store.ts:66-80`: catálogo resolvido por domínio inclui `context.instance_id`, mas o modelo devolvido ao checkout identifica a organização por `context.organization_id`. É preciso carregar o ID da instância até a transação, com validação no backend.
- `src/routes/admin/pedidos.tsx:70-85`: resolve loja por domínio e chama `get_admin_orders(p_instance_id)`; `src/routes/admin/pedidos.tsx:144` faz mutação por `p_order_id`, exigindo autorização de instância no servidor.
- `src/components/storefront/Storefront.tsx:121,899`: status do pedido por `get_public_order_status`. `CheckoutPanel.tsx:139-153`: itens adicionais por `append_public_order_items_with_payment`.
- `src/components/storefront/Storefront.tsx`: chaves de rastreamento local estão vinculadas ao `organization.id`, o que pode misturar o **estado local** de duas lojas da mesma organização, mesmo que o RPC de status negue acesso indevido. Revisar chave por instância.
- `src/routes/painel.tsx`: painel legado usa tabelas `organization_settings`, `delivery_zones`, `orders`, `products` e filtros por `organization_id`; este caminho **não é automaticamente migrado** pelos candidatos das tabelas `neroxa_storefront_*`. Classificar separadamente como fluxo legado e verificar o deploy real antes de afirmar que está desativado.

## Ensaio de recuperação pós-cutover — ambiente descartável

- Fixture: `audits/sql/post-cutover-recovery.fixture.sql`, aplicada **após** a fase 2 e **antes** do backup lógico no job histórico.
- Modificação em `tools/ab-auth/historical_rehearsal.mjs` afirma settings divergentes A1/A2, preservação de B1, zona exclusiva A2, dois pedidos fictícios com itens/histórico e incompatibilidade de downgrade ingênuo da PK para `organization_id`.
- `tools/ab-auth/restore_rehearsal.mjs` compara digests de **todas** as tabelas/sequências do clone (não apenas settings/zones) e verifica integridade de FKs, objetos, ACLs e Auth no banco restaurado.
- Primeira execução **38261107334 falhou** na matriz REST por uma expectativa legada que exigia A2 sem zona. Os dados/restauração, 10 categorias estruturais e 88 FKs passaram; **o run como um todo não passou**. A expectativa foi corrigida em `tools/ab-auth/restore_security.mjs`, passando a exigir contagem exata de zonas 2/1/1 (A1/A2/B1). **Resultado da nova execução deve ser conferido antes de declarar PASS**.

## Limites e decisão

- O ensaio restaura um snapshot **pós-cutover** em outra base descartável do **mesmo cluster**, com roles globais compartilhadas; não prova disaster recovery independente nem downgrade seguro da PK.
- Nenhum teste deve reverter a PK ignorando configurações separadas por loja. Preferir **roll-forward** após falha, com congelamento de escrita, snapshot de recuperação e validações integradas.
- Reconciliar a configuração real sem instância e testar o checkout do Pizza Perfect Plate contra o novo contrato antes de qualquer release.
- Consumidores externos adicionais, deploys ativos, chaves por domínio confiável e plano de contingência operacional exigem validação específica.

**Decisão:** PR #37 draft; produção READ-ONLY; release **NO-GO** até CI novo aprovado, consumidores corrigidos e reconciliação de dados históricos autorizada.

# PR #37 — Reconciliação incremental e plano de rollback (12/10/2026)

**Estado:** PARCIAL; NO-GO para produção. PR permanece draft. Consultas ao Master exclusivamente SELECT. Nenhuma migração, DML, deploy ou merge.

## Reconciliação estrutural executada

Comparação direta do snapshot `audits/ab-auth/master-catalog-20261009.json` com o catálogo atual do Master `iefaoaqzltvpfabyeelj`, usando `pg_attribute`, `format_type(atttypid,atttypmod)` e `pg_get_expr`.

- 438 colunas públicas no snapshot e 438 atuais; **0 divergências** em tabela, nome, posição, tipo completo, NOT NULL, default, identity e generated. Inclui colunas de views.
- 145 constraints históricas e 145 atuais, mesmas chaves nome+tabela. **46 diferenças textuais** de `pg_get_constraintdef` (por exemplo, parênteses extras em CHECK). **Não certificadas como semanticamente equivalentes**.
- 22 triggers históricos e 22 atuais, mesmas chaves nome+tabela. **4 diferenças textuais** de `pg_get_triggerdef` (qualificação de schema e parênteses em WHEN). **Não certificadas como semanticamente equivalentes**.
- Normalização completa de ACLs, owners, privilégios default e dependências ainda pendente; não concluir compatibilidade integral.

## Consumidores legados: constatações e lacunas

- `src/routes/master-catalogo.tsx:214-221`: upsert de `neroxa_storefront_settings` com `instance_id` e `onConflict: "instance_id"`. **Escritor candidato**, requer PK/unique e grants do cutover. O código da branch não demonstra compatibilidade com a PK histórica em produção.
- `src/routes/master-catalogo.tsx:174,180`: categorias e produtos são lidos por `instance_id`.
- `tools/ab-auth/inventory_consumers.py`: inventário estático procura apenas referências literais às duas tabelas; a classificação por operações é heurística e não prova escopo efetivo de queries. RPCs, views, jobs e integrações externas exigem inventário separado.
- `audits/storefront-instance-migration-plan.md`: identifica consumidores RPC históricos com resolução ambígua por organização (inclusive `create_public_order`); verificar implementação atual e dependências antes de cutover.
- Não classificar consumidores externos ou não versionados como compatíveis.

## Plano de rollback a ensaiar — somente fixtures fictícias

**Importante:** o restore pós-cutover aprovado em `38211490095` não testa downgrade de PK ou preservação de escritas posteriores.

1. Preparar **clone descartável pré-cutover**, com organizações A (lojas A1/A2) e B (B1), settings/zones legados e baseline de dados, sequências, objetos, ACLs e dependências. Capturar snapshot lógico **pré-cutover** e digest.
2. Aplicar fase 1; confirmar backfill automático somente de B1 e bloqueio atômico de fase 2 com A unresolved. Registrar decisão explícita para A1/A2, sem inferência por ordem.
3. Aplicar fase 2 e candidatos RLS/RPC no clone, com autenticação real. Criar **novas gravações após cutover** em A1 e A2: configurações diferentes, zonas, pedidos, itens e histórico; registrar IDs, versões e digests.
4. Simular falha após cutover e congelar novas escritas no clone. Capturar **snapshot de recuperação pós-cutover**, com as novas gravações, e comprovar restore em destino descartável. Comparar integridade e isolamento antes/depois.
5. Demonstrar que **reverter diretamente a PK para organization_id não é seguro** quando A1 e A2 possuem settings diferentes. A alternativa segura padrão é **roll-forward**: recuperar estado pós-cutover em clone, corrigir candidato e validar APIs; se a estratégia exigir retorno à versão anterior, criar adaptador/migração reversa explicitamente definida que preserve ambas as lojas e não descarte dados, ou bloquear retorno.
6. Exercitar falhas injetadas (gravação em loja errada, FK órfã, RLS indevida, ACL divergente); o ensaio deve falhar fechado. Validar Auth/JWT, RLS, RPCs, pedidos e consumidores após retomada.
7. Limpar clones e arquivos privados; evidência sanitizada inclui run ID, SHA, checksums, contagens, decisões de reconciliação, testes negativos e status final.

**Gates para PASS:** todos os dados pré e pós-cutover recuperados; zero vazamento entre lojas/organizações; nenhuma perda silenciosa; integridade e ACLs preservadas; rollback/roll-forward operacional demonstrado; consumidores versionados e externos verificados. Caso contrário **NO-GO**.

## Próximas ações concretas

1. Concluir comparação normalizada de ACLs/owners e revisão das 46 constraints e 4 triggers com PostgreSQL real, não apenas remoção de parênteses.
2. Ampliar o inventário para referências indiretas a RPCs, views, edge functions, jobs e outros repositórios, classificando leitura/escrita/PK/FK.
3. Implementar e executar workflow isolado de recuperação **com escritas pós-cutover**, sem usar produção. Registrar relatório de execução; não marcar como PASS por antecipação.

**Decisão atual:** reconciliação de colunas aprovada; catálogo global e consumidores inconclusivos; rollback pós-cutover não executado. PR #37 draft; produção READ-ONLY.

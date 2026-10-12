# Gate de consumidores legados e recuperação — PR #37

**Estado:** revisão estática; não equivale a execução de rollback. **NO-GO produção.**

## Evidência já disponível
- `audits/master-catalog-compatibility-20261012.md`: 34 relações, 438 colunas, 50 funções, 99 policies, 22 triggers, 121 índices e 145 constraints; equivalência semântica e ACLs não certificadas.
- `audits/sql/storefront-instance-phase2-cutover.candidate.sql`: altera a PK de `neroxa_storefront_settings` de `organization_id` para `instance_id`. Exige reconciliação prévia de `instance_id` e inspeção de FKs dependentes.
- `audits/historical-two-store-rehearsal-plan.md`: prevê falha atômica com registros unresolved, mapeamento humano de A1/A2, restart de PostgREST e restauração verificável.
- `tools/ab-auth/run.mjs`: testes Auth/JWT/PostgREST de lojas fictícias; **não substitui** inventário de consumidores externos.

## Gate 1 — inventário de consumidores
1. Inspecionar código frontend, funções RPC, views, edge functions, jobs e integrações por referências a `neroxa_storefront_settings`, `neroxa_storefront_delivery_zones`, `organization_id` e `instance_id`.
2. Classificar cada consumidor como leitor, escritor, atualizador, exclusor ou dependência de PK/FK.
3. Exigir filtro inequívoco por `instance_id` quando o dado é de loja; jamais selecionar primeira loja da organização.
4. Identificar consumidores não versionados no repositório (externos) como **não verificados** até confirmação explícita.
5. Comparar `format_type(atttypid,atttypmod)`, defaults, NOT NULL, FKs, grants, owners, triggers e extensões com catálogo real antes de autorizar cutover.

## Gate 2 — ensaio de restauração em clone descartável
1. Criar fixture histórica antes das migrações: organização A com A1/A2, organização B com B1; settings e zonas legadas sem `instance_id`.
2. Capturar backup lógico restaurável e baseline de contagens, checksums de linhas, PKs/FKs, índices, triggers e grants.
3. Aplicar fase 1; confirmar B1 automático e A unresolved. Tentar fase 2 e exigir rejeição atômica.
4. Mapear A explicitamente, copiar settings para A2 somente após decisão registrada e não duplicar zonas automaticamente.
5. Aplicar candidatos no clone e repetir Auth/JWT/PostgREST, pedidos e consumidores antigos após reload/restart.
6. Restaurar o backup em **outro** clone descartável e comparar contagens, checksums, constraints, triggers e permissões com baseline.
7. Registrar run ID, SHA, hash do backup, duração, divergências e resultado. Qualquer diferença não justificada = **NO-GO**.

## Critérios de bloqueio
- Nenhum dado real, credencial de produção, merge ou migração no Master.
- Não chamar DDL inversa de rollback seguro depois da duplicação de settings por organização.
- Não considerar workflow verde prova de compatibilidade com integrações não inventariadas.
- PR #37 permanece draft até evidências do inventário, do ensaio e decisão humana.

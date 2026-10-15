# Missão 02A.5 — Matriz de 21 casos, estado pré-gate (SEM REVOGAÇÃO)

Workflow `.github/workflows/mission-02a5-f02-pre-gate-ledger.yml` reutiliza o ensaio nativo buyer/catálogo já validado no run 38672488319, com um novo emissor de 21 linhas de status. O CSV de casos originais da Coordenação é reproduzido nos IDs PG-01..09, GT-01..03, PO-01..09. Essa execução **não é** um teste integrado completo dos 21 critérios. Cada PASS é restrito ao recorte realmente observado (master buyer, fonte Delivery fixada), um baseline vulnerável **FAIL** é preservado, e todo gate/pós-gate fica **BLOCKED/NOT RUN**.

- Master SHA da execução = GITHUB_SHA; Delivery SHA `4ce88959a751066f96da4cbab8d1fc9ac29bb320`; PRs draft sem deploy.
- Teste comprador usa Auth real e PostgreSQL/Auth/REST/Storage/Realtime nativos em VM descartável, identidades fictícias, egress do processo de teste bloqueado; o runner NÃO executa E2E TanStack completo, simula apenas gateway RPC + adapter HTTP.
- O catálogo é uma consulta `READ ONLY` em banco **Master**. Comparação Delivery histórica derivada provém separadamente do run 38678827509; não se deve concatenar schemas.
- `PG-03 FAIL` = evidência de F02 P0 existente pré-gate; não é falha do executor. `PG-08 BLOCKED` porque não cobre digests integrados de todas as tabelas/T1. `PG-09 BLOCKED` pelos previews e consumidores externos ainda UNKNOWN.
- `GT-01..03 BLOCKED`, `PO-01..09 NOT RUN`, `CONSUMER-DISABLEMENT.json` ausente; nenhuma GUC artificial, SQL de revogação, deploy, secrets, dados de clientes, ou artefato público.
- A execução passará no runner somente se o ensaio buyer/catálogo e a verificação de identidade funcionarem. O relatório parcial local é emitido em `$RUNNER_TEMP` e evidências sumárias no log GitHub, sem upload de dump.

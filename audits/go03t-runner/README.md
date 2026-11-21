# NEROXA GO-03T — GitHub Actions: testes multissessão

Este pacote usa **exatamente** os quatro arquivos de fonte do GO-03T: os SQLs 34 e 35, a projeção de dependências e o executor `verify-contracts.mjs`. Os SHA-256 são conferidos antes de executar. `runner-adapt.mjs` altera **somente a cópia temporária do executor** para que os clientes se conectem ao serviço PostgreSQL 17.12 na rede privada do job; não altera os SQLs.

## Destino autorizado

Repositório: `luit77yak-dev/neroxa-master`
Branch temporária já criada: `test/go03t-postgres17-multisession-20261121` (base `d41695c5a935faeb41001502162716539f927899`).

Copiar para a branch o diretório `audits/go03t-runner` deste pacote, preservando os nomes dos arquivos, e **por último** criar `.github/workflows/go03t-postgresql-multisession.yml`, também incluído. O push do workflow dispara somente o teste focal da branch. Não abrir PR nem merge.

O workflow usa `permissions: contents: read`, `node:24-bookworm` e serviço descartável `postgres:17.12`, com autenticação `trust` **somente na rede privada do job**, sem publicação de porta ou projeto Supabase. Não armazena segredos. `pg@8.23.1` é dependência pública do executor. A senha comercial nunca é usada. Dados de pedidos são fictícios.

Os testes sequenciais incluídos no executor criam as fixtures necessárias; as provas novas buscadas são: duas sessões simultâneas no checkout, contenção/rollback de nonce em sessões distintas e validação de quota. Esta execução *não* atesta autenticação comercial, equivalência com Supabase ou segurança geral da publicação.

**Atenção:** este workflow ainda **não foi executado** enquanto a branch não contiver os arquivos e o workflow. `R3` continua `BLOCKED` até readback dos logs reais. Em falhas, registrar SQLSTATE e aplicar apenas correção focal.

## Critérios de aceitação

- Runner usa PostgreSQL real v17.12, duas ou mais sessões reais e `pg_stat_activity` mostra espera de lock.
- SQL 34 e 35 executados sem modificações, com hashes idênticos aos originais.
- Checkout concorrente: uma única ordem e uma única emissão de capabilities.
- Nonce concorrente: uma confirmação, segunda negação; rollback libera chave somente à segunda sessão válida.
- Quota e rollback sem contadores parciais ou bypass.
- Sem segredos, Supabase, Cloudflare, deploy ou alterações de produção.

**Resultado desejado:** `R3=PASS` e `IMPLEMENTATION=READY_LOCAL`, somente após confirmar também os resultados R1/R2 preservados.

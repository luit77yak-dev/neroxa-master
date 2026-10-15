# NEROXA — 02A.5 integração autorizada: recorte estático e regressão Delivery (15/10/2026)

**Decisão da Coordenação:** AVANÇAR COM RESTRIÇÕES; **NENHUM** merge/deploy/DNS/alias/SQL remoto/cliente real/gasto novo/gate.
F01 ABERTO; F02 ABERTO (leitura + escrita P0 legados); Marco 01 = **0/7** homologados; comercial **NÃO LIBERADO**.

## Fontes, SHAs e resultados novos
- PR Master #46 em draft; commit de testes unitários `9f4f1a7668ba2201021282585a2291c787ecf51a`. PR Delivery #42 em draft, SHA fixado `011275488660bfa1a9271b3e4c92e457f7638e34`.
- [GitHub Actions 38787660490](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38787660490) **SUCCESS estático**: valida 21 IDs oficiais PG-01..09 / GT-01..03 / PO-01..09; fonte Master `daf564ec268bceea4cb9acab63d106f2f6adac11`, Delivery `0112754`, fontes inspecionadas 227 Master + 199 Delivery. Não testou banco/ACL.
- [GitHub Actions 38788471451](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38788471451) **SUCCESS unitário**: SHA Master `9f4f1a7668ba2201021282585a2291c787ecf51a`, fonte Delivery `011275488660bfa1a9271b3e4c92e457f7638e34`. Bun 1.3.4 (action fixa e `bun.lock --frozen-lockfile --ignore-scripts`); 7 suítes, **87 testes PASS / 0 FAIL**. Testou contratos do checkout, tracking privado, complemento, consumidores e backend, sem PostgreSQL, sem browser, sem dados reais.
- Tentativas anteriores [38787986497](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38787986497) e [38788198111](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38788198111) falharam no *setup*, respectivamente pelo arquivo `.env` versionado e `npm ci` incompatível com `bun.lock`. Corrigidos no workflow; nenhuma das duas é falha funcional, nem deve ser ocultada.
- Ensaio SQL exato anterior [38785111675](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38785111675), Master executado `c149f802adf1922be588319cc98a798c7b387ea8`, Delivery `0112754`: 15 grupos SEC PASS, 2 FAIL P0, 1 BLOCKED gate, 44 observações detalhadas; não se convertem em 15 critérios comerciais.

## Oficial vs provisório (sem fabricação)
A matriz oficial PG/GT/PO está em `audits/02a5/f02/origem-coordenacao-20261015/MATRIZ-21-CASOS-PRE-GATE.csv`.
A tabela de rastreabilidade temática `audits/02a5/f02/MATRIZ-21-TRACEABILIDADE-20261015.csv` marca **4 PASS de recorte, 2 FAIL (P0), 5 BLOCKED, 10 NOT RUN**, vinculando evidências reais/históricas. Isso **não** é prova de execução homogênea dos 21 critérios e não transfere PASS pré-gate para pós-gate.
As definições oficiais completas de `SEC-01..SEC-18` **NÃO FORNECIDAS**: relação com PG/GT/PO é apenas temática, não equivalente.

## Gaps indispensáveis antes de homologação
1. **Browser real TanStack:** checkout → emissão de tracking/amendment separados → acompanhamento comprador com projeção mínima → inclusão de item legítimo → repetição/chave idempotente → digests orders/items/financeiro. Teste com serviços reais só em clone, browser isolado e egress bloqueado. NÃO EXECUTADO neste lote.
2. **F01/Auth:** controles positivos e negativos A/B da mesma organização e C de outra; credenciais reais fictícias e lifecycle JWT/logout. Não atribuir o PASS parcial de F01 a todas as permissões.
3. **Storage:** bucket privado, upload/download/upsert/delete own, negação cross-instance, acesso anônimo e integridade após exclusão.
4. **Realtime:** evento próprio A positivo deve chegar antes de considerar ausência de eventos B como prova de isolamento. Evidência histórica `audits/02a3/evidence/realtime-assessment.json` registrou join A/B PASS, evento A FAIL, B BLOCKED e logout NOT RUN. A partir da documentação atual Realtime, exigir renovação/rejeição JWT e verificar o momento de revogação das permissões em nova sessão. `NO PASS` até execução.
5. **Consumidores distribuídos:** demos internas + 10 previews; owner técnico/binding efetivo/permissões ainda UNKNOWN. Mesmo deployment não implica mesmo backend para previews. Não ler segredos ou dados reais para adivinhar.
6. **Gate:** sem recibo legítimo `CONSUMER-DISABLEMENT.json`, sem GUC forçada; BLOCKED. Pós-gate NOT RUN; não revogar/reactivar RPC legado em remoto ou clone sem pré-condições.

## Próxima decisão / sequência permitida
Continuar apenas com instrumentação e ensaio integrado num clone descartável, reaproveitando `tools/ab-auth/first_order_browser.mjs`, `tools/mission-02a4/storage.mjs` e `tools/mission-02a3/native-realtime.mjs` após reconciliar fixtures, perfis SQL e commits com o Master/Delivery atuais. Preservar logs com PASS/FAIL/BLOCKED/NOT RUN por operação e cleanup. **Nenhum** resultado histórico pode ser promovido como PASS do candidato novo sem execução real.

O fundador deve decidir **separadamente** sobre conter/suspender/substituir as demonstrações internas, sem alteração por parte da engenharia.

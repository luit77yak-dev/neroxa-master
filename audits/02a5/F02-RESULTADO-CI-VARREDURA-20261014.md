# NEROXA — Resultado F02: inventário estático pós-passagem Codex

**Data de decisão:** 14/10/2026. **Decisão recomendada:** AVANÇAR COM RESTRIÇÕES. F01/F02 abertos, comercial NÃO LIBERADO, Marco 01 0/7.

## Evidência independente reproduzível

- [GitHub Actions 38670223632](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38670223632) — **SUCCESS apenas do scanner offline**, Master SHA \`51974ef5912557ea8fd3085f98aeb87d3abcfb3e\`; Delivery SHA \`4ce88959a751066f96da4cbab8d1fc9ac29bb320\`.
- **408 arquivos distintos:** 211 Master + 197 Delivery. Scanner corrigido para NÃO contar o checkout Delivery uma segunda vez dentro da pasta Master.
- **284 registros estáticos:** 121 ocorrências de nomes F02 (52 \`get_public_order_status\`, 53 \`append_public_order_items_with_payment\`, 16 \`append_public_order_items\`) e 163 ocorrências de outras RPCs ou chamadas indiretamente resolvidas. São **ocorrências textuais**, NÃO usuários, pedidos, vulnerabilidades independentes ou consumidores de produção.
- Nenhum dos três nomes F02 apareceu como literal na categoria \`RUNTIME_SOURCE\` auditada. Isso não exclui resolução dinâmica, app distribuído com SHA diferente nem consumidores fora do GitHub.
- **Scripts de testes e migração:** referências executáveis aparecem em \`tools/ab-auth/checkout_gateway_integration.mjs\`, \`group_addons.mjs\`, \`run.mjs\`, \`tools/migration-bridge-v1/verify-*\`, \`tools/mission-02a3/run.mjs\` e \`tools/mission-02a5/buyer-minimum.mjs\`. Classificar como teste legado/reprodução; revisar antes de reaproveitar como suite pós-gate.
- Histórico de execução: [38669988602](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38669988602) falhou por token de gh inválido antes do scanner; [38670124768](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38670124768) foi SUCCESS mas dupla contagem; execução final corrigida é 38670223632. Não apagar evidências de falha.

## Classificação de consumidores

| Caminho | Categoria / estado |
|---|---|
| Delivery Storefront, duas leituras por \`readPrivateTracking\` | MIGRADO NO CÓDIGO CANDIDATO; E2E não comprovado |
| Delivery CheckoutPanel, append antigo | DESATIVADO NESSE COMPONENTE; alternativa financeira não homologada |
| Delivery CheckoutPanel \`create_public_order\` com gateway off | DEPENDENTE de outro gate; não é prova F02 migrado |
| Delivery /api/order-track + emissão de capability | MIGRADO no ensaio **descartável** do comprador, não produção |
| Scripts históricos de teste/migração que invocam nome legado | DEPENDENTE DE ADAPTAÇÃO OU FIXTURE PRÉ-GATE, não consumidor comercial presumido |
| SQL histórico \`get_public_order_status\` e \`append_public_order_items*\` | P0/legado perigoso pré-gate; grants SECURITY DEFINER históricos |
| RPC nova service-only | Positivo pré-gate em [run 38665665942](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38665665942) |
| Integrações externas/distribuídas, owners/versões/flags instaladas | **UNKNOWN**; precisa responsável e prova verificável |

## ACL, pré-gate, gate, pós-gate

- Assinaturas em migrations históricas: \`get_public_order_status(uuid,text)\`, \`append_public_order_items(uuid,text,jsonb)\`, \`append_public_order_items_with_payment(uuid,text,jsonb,public.payment_method)\`. O wrapper de pagamento chama a função append. **Não é inventário efetivo de todos overloads do clone**.
- **Pré-gate histórico:** comprador privado A positivo, token A em B/C negado, staff sem grant PATCH B negado, admin B positivo, **F02 anon UUID+telefone FAIL/P0** (run 38665665942).
- **Gate BLOCKED:** desconhecemos todos os consumidores externos. Não fabricar \`CONSUMER-DISABLEMENT.json\`; não setar GUC \`neroxa.legacy_phone_consumers_disabled=on\` sem prova. \`--release-ready\` continua bloqueado.
- **Pós-gate NOT RUN:** não existe teste que comprove todos EXECUTEs revogados e tracking privado preservado depois do gate.
- **Consulta pg_proc/ACL/views/wrappers NOT RUN nesta rodada:** não foi iniciada stack PostgreSQL nova. Exigir clone isolado e inventário real antes de transação SQL.
- **Rollback:** se abortar antes COMMIT, ROLLBACK transacional; depois do COMMIT nunca restaurar privilégios inseguros ou StaffPanel. Preservar suspensão e roll-forward seguro/T1 separado.

Não houve merge, deploy, SQL remoto ou contratação. Branch com \`vercel.json\` desabilitado. O scanner é estático e não reivindica homologação de banco.

**Próxima decisão:** nomear os donos das integrações externas e confirmar cada versão/ambiente em uso. Somente depois de evidência verdadeira da desativação/migração executar a matriz pré-gate → gate → pós-gate num clone descartável. F02 NÃO ENCERRADO.

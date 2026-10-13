# Dependência GROUP_ADDONS_V1

SQL revisável: `audits/sql/group-addons-pricing.candidate.sql` e `audits/sql/group-addons-capability.candidate.sql`. Fora de migrations automáticas; nenhuma instalação remota realizada.

Master funcional comprovado: **703ef87cb498be67b02d3257fcf1f91d4098b893**, branch `audit/group-addons-v1-20261013`.
Delivery funcional: **56756c13ff2c1617e7ed2efe728622f7e29eecc6**, branch `audit/group-addons-integration-20261013`.
Documentação final do Delivery: **10f7074**, pasta `audits/group-addons-20261013/`, incluindo contrato, matriz, relatório, decisão e manifest com hashes.

Integração: https://github.com/luit77yak-dev/pizza-perfect-plate/actions/runs/38346177959 — 493 verificações integradas e 54 testes Node aprovados.
Recuperação: https://github.com/luit77yak-dev/neroxa-master/actions/runs/38345378954 — 36 verificações históricas e 193 de restauração aprovadas; 87 tabelas e 89 FKs comparadas.

GO restrito para próxima homologação isolada dos recursos implementados; produção NO-GO. Combos, meio-a-meio, múltiplas unidades do mesmo adicional, ledger/pagamento, tracking por capacidade, consumidores legados e homologação browser permanecem pendentes. A recuperação não comprova equivalência com produção atual nem DR entre clusters independentes. Nenhuma autorização de instalação remota, merge ou deploy resulta destes ensaios.

Master PR #37 e Delivery PRs #36/#37 continuam DRAFT e seus commits originais permanecem preservados.

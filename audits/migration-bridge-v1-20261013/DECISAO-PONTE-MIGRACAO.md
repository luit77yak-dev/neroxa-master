# Decisões independentes — 2026-10-14

| Item                                           | Decisão                                                                     | Limite                                                                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1. Contrato canônico definido                  | GO restrito ao núcleo operacional nativo                                    | Modelo compartilhado inteiro/lifecycle/entitlements não fechado                                                            |
| 2. Ponte candidata implementada                | GO restrito: perfil observado,16-table projection                           | Não cobre oito SQLs já instalados, papéis reais nem instalador comercial completo                                          |
| 3. Clean descartável                           | GO                                                                          | 493/40/24/19/21/77 +11 ACL; stack PG/Auth/REST, não todos produtos Supabase                                                |
| 4. Upgrade descartável preservando dados       | GO restrito                                                                 | 57 preparação +37 cutover + matriz integrada;3/6/12, formato legado representativo, old keys/half/PII fictício preservados |
| 5. Iniciar próxima missão restore independente | GO para ensaio gratuito descartável a preparar                              | 202 restore atual é same-cluster; capacidade de dois clusters deve ser medida, não já aprovada                             |
| 6. Solicitar revisão pacote sandbox            | GO para revisão técnica da candidata, NO-GO como instalador final aprovável | Fechar FKs/lifecycle, role/concessões legítimas, frozen consumers, backup/restores e executor do destino                   |
| 7. Instalar sandbox remoto                     | NO-GO                                                                       | Não autorizado, backup efetivo/DR/decisões reais ausentes                                                                  |
| 8. Produção                                    | NO-GO                                                                       | Sem autorização comercial; hosted, consumidores, operação, suporte e demais gates pendentes                                |

Runtime Master e5184d2dbda707036f25a0492578aa480a0cca82 / Delivery35e844c48ad41ce82141abfb7beb502e565930ab.
Workflow https://github.com/luit77yak-dev/pizza-perfect-plate/actions/runs/38490640042 SUCCESS, ambos jobs e cleanup.
Restore regressão https://github.com/luit77yak-dev/neroxa-master/actions/runs/38488429219 SUCCESS, Master12122dee62692d79e2ce01616417b45751ee6d45,202 +36 checks; não testa a projeção/anchors entre clusters.

101 Node reexecutados localmente, TypeScript/build/lint direcionado aprovados.13 testes de pacote Python aprovados, inclusive em cada runner. Contagens históricas não reutilizadas como novas sem execução.
Alguns JSON legados dizem INCONCLUSIVO para certificação global, embora checks individuais sejam todos PASS. Preservado esse significado.

Próxima ação: revisão das resoluções comerciais e do pacote limitado, seguida de ensaio de restore independente para esta projeção com GROUP/intents/anchors/Auth reais. Não aplicar pacote remoto. Quando houver T1, congelar e preservar T1/roll-forward; nunca restauração cega de T0.

Branch audit/migration-bridge-v1-20261013, auto-deploy false antes de push. Main, PRs37 Master/36+37 Delivery e branches referência preservadas. Configuração histórica órfã Master não entrou na ponte. Nunca atribuir vínculo arbitrário.

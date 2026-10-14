# Decisão — recuperação independente V1

Evidência final: https://github.com/luit77yak-dev/pizza-perfect-plate/actions/runs/38512737541, job115684698047 SUCCESS e cleanup SUCCESS. Par: Master 1704dc590202d9c9b25b764683fbf74127a78635 / Delivery c18d6803b319de442d5dfb2ed1d58fb367df096d. SHA/hashes em MANIFEST-BACKUP-RESTORE.json; artifact11870822768 verificado, SHA1337456cf76cca13e0cc6c4aad6d3f74f0bcfec24690d9a7f8c7a3b5f642a3c4.

| Gate                              | Decisão                                            | Justificativa                                                                                                     |
| --------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1. Clusters independentes         | GO no runner                                       | dois clusters/volumes/system identifiers/bootstraps; não DR geográfico                                            |
| 2. Backup restaurável descartável | GO restrito                                        | restore real +183 checks; perfil16 tabelas com dependências nativas                                               |
| 3. Recuperar3 pedidos legados     | GO                                                 | 3/6/12, IDs/totais/half/id-only/histórico preservados                                                             |
| 4. GROUP/intents/capabilities     | GO restrito                                        | fingerprints e retries sem duplicação; NOT_SETTLED; sem tokens antigos inventados                                 |
| 5. Auth/ACL/RLS/isolamento        | GO restrito AAL1 exercitado                        | JWT próprio TARGET, SOURCE rejeitado, grants; MFA/sessions completas pendentes                                    |
| 6. Operação navegador             | GO restrito                                        | 78 checks build normal TARGET, frontend/painel/tracking; Chromium emulado                                         |
| 7. Preservar T1                   | GO para falha transacional; NO-GO para perda total | 46→47 e11 checks; não testamos restore T1 após destruição integral nem RPO zero                                   |
| 8. Revisão final pacote sandbox   | GO para revisão técnica limitada                   | fechar gates hosted, executor, credenciais próprias, MFA/cookies, consumers e backup real antes de aprovabilidade |
| 9. Instalação remota              | NO-GO                                              | nenhuma autorização, snapshot real/restore e preflight do destino ainda necessários                               |
| 10. Produção                      | NO-GO                                              | não homologação hosted/comercial completa; decisões/consumers/DR e operação pendentes                             |

Próxima ação: revisar pacote/executor e mecanismos duráveis de backup/delta; ensaiar restauração do checkpoint T1 e portabilidade de MFA/credenciais/cookies, sem tocar nos projetos remotos. Não utilizar este GO restrito como aprovação automática de sandbox ou produção.

Os183 checks atuais não são os202 históricos reclassificados: a prova atual atravessa clusters independentes, e a histórica usava bancos do mesmo cluster. O escopo também difere: esta prova é a projeção operacional da ponte, não o Master financeiro/comercial inteiro.

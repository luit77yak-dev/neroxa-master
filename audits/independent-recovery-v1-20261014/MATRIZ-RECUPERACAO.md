# Matriz de recuperação — https://github.com/luit77yak-dev/pizza-perfect-plate/actions/runs/38512737541

| Superfície                                      | Resultado                        | Evidência/limite                                                                                               |
| ----------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Clusters/volumes/roles bootstrap independentes  | Comprovado                       | system identifiers/mounts/redes diferentes; roles próprios mapeados                                            |
| Legado3/6/12                                    | Comprovado                       | IDs, monetary values, half/id-only, eventos e digests                                                          |
| GROUP v2/snapshots                              | Comprovado no perfil             | digest imutável +preço banco+pedido browser                                                                    |
| Intents/hash/lease/fencing armazenado           | Comprovado                       | todos os dados privados restaurados e propriedades comparadas                                                  |
| Retry GROUP                                     | Comprovado                       | mesma key/payload mesmo pedido, sem item/evento extra; payload divergente rejeitado                            |
| Capability/append                               | Comprovado                       | operação restaurada retry NOT_SETTLED; histórico permanece sem capability                                      |
| Auth UID e novas sessões TARGET                 | Comprovado AAL1                  | reautenticação real e JWT TARGET próprio; SOURCE401                                                            |
| Expiração JWT TARGET                            | Comprovado                       | GoTrue real TTL curto; REST401 após34s, sem mudança de leeway                                                  |
| RLS/ACL/owners/defaults/FKs                     | Comprovado perfil                | fingerprint semântico +74 FKs e grant matrix                                                                   |
| A1/A2/B1/outsider/histórico                     | Comprovado nos casos exercitados | Auth real +RPCs+DB+browser; sem herança automática de organização                                              |
| Operação navegador TARGET                       | Comprovado restrito              | 78 checks: catálogo→entrega→total91→pedido→painel→tracking/transições                                          |
| Mobile emulado360/390/412/768/1440              | Comprovado navegador             | capturas/overflow/teclado; não celular físico                                                                  |
| T1 após COMMIT e falha transacional             | Comprovado                       | 46→47 pedidos;11 checks, digest preservado e rollbackT0 bloqueado                                              |
| T1 após perda total TARGET                      | Não comprovado                   | checkpoint real existe, mas restore desse checkpoint em desastre total não executado                           |
| RPO zero/WAL/PITR/CDC                           | Não disponível                   | perda possível do intervalo sem fonte durável                                                                  |
| JWTs/sessions/refresh/cookies antigos           | Parcial                          | dados Auth restaurados, mas portabilidade de todas as credenciais/cookies não certificada                      |
| MFA plataforma após restore                     | Pendente                         | requisitos preservados; variantes/fatores não ensaiados no destino                                             |
| Roles customizadas/credenciais SQL por cluster  | Pendente                         | nativeCLI defaults; nenhum pg_dumpall importado nem role gerenciada alterada                                   |
| Missing role/extension/restore abrupto          | Parcial                          | preflight de ausência e transação interrompida; não remoção de managed role/extension ou SIGKILL de pg_restore |
| Storage/blobs/financeiro Master/SUPPORT/FINANCE | Fora da aprovação                | núcleo16 tabelas, decisões comerciais ainda abertas                                                            |
| Sandbox hosted/produção                         | NO-GO                            | não autorizado nem homologado                                                                                  |

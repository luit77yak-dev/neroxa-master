# Desastre após cutover — T0 e T1

T0: SOURCE operativa fictícia após a ponte, com legado 3/6/12, GROUP e append NOT_SETTLED. Escritas congeladas e Auth/REST parados; backup lógico transferido e restaurado em outro cluster. Os digests e propriedades devem coincidir antes da liberação da TARGET.

T1: o navegador normal conectado à TARGET cria pedidos novos e executa acompanhamento/painel. Depois, o ensaio exige classificação PASS do navegador, >=77 checks e aumento comprovado no número de pedidos, congela escritas e gera checkpoint lógico privado no runner, fora do volume PostgreSQL TARGET. Isso é uma fonte real de dados até o checkpoint, mas o runner é efêmero e o arquivo é removido no cleanup.

A falha injetada ocorre em transação: abertura temporária do gate, checkpoint DR_FAIL e erro INJECTED_DR_T1_FAILURE. Rollback precisa remover o checkpoint e preservar todos os digests, mantendo o gate congelado. Uma escrita posterior deve falhar especificamente com DR_WRITE_FREEZE e não modificar dados. A retomada libera apenas a TARGET e compara o digest completo dos pedidos para preservar T1.

A política candidata recusa restauração T0 quando o destino já divergiu do snapshot inicial: T1_PRESENT_ROLLBACK_TO_T0_FORBIDDEN. O teste é um guard do procedimento; não adicionamos uma política geral de backup/rollback em produção nem um instalador remoto.

| Cenário                                         | Limite da prova                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Recuperar T0 em outro cluster                   | Restore real de dados, Auth e definições, conforme evidence manifest           |
| Preservar T1 em falha transacional              | Digest completo antes/depois e checkpoint revertido                            |
| Retomar com dados T1 presentes                  | Gate liberado e pedidos preservados; não é um upgrade completo de roll-forward |
| Recuperar T1 após destruição integral da TARGET | Não executado; depende do checkpoint sobrevivente e de novo restore aprovado   |
| Perda da TARGET e do runner/checkpoint          | Perda possível de T1; não há WAL/PITR/CDC/journal durável externo              |
| Novas escritas depois do checkpoint             | Potencialmente perdidas numa destruição total sem captura de delta             |

Não prometer RPO zero nem RTO comercial. Nenhum pedido é apagado para fazer o teste passar, e não executamos downgrade de PK por organização. Os tempos são medições do runner, com imagens compartilhadas, não garantias de operação hosted.

A decisão final deve separar PASS de preservação transacional de T1 e NO-GO para afirmar recuperação automática de T1 após perda total de infraestrutura.

Resultado efetivo: https://github.com/luit77yak-dev/pizza-perfect-plate/actions/runs/38512737541 SUCCESS,11/11 checks T0/T1. PedidosT0=46,T1=47. Checkpoint real privado704919 bytes, SHA256 `1c76ba88b8e57f52f9a8e6d0ba41efcb035baa755466d34be93990c7b12d8298`; removido após testes. Não restauramos esse checkpoint em um cenário de destruição total.

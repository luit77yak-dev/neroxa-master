# F02 — procedimento pendente, não autorizado

Alvo nominal: `neroxa-solutions-hub`, projeto `iefaoaqzltvpfabyeelj`. O hash da função detecta deriva; não autentica o banco. Antes de executar, confirmar o projeto no transporte autenticado e reler o catálogo na mesma janela. Nenhuma credencial deve entrar no recibo.

1. Preservar a suspensão dos seis endereços informada pela Coordenação, a contenção Realtime da PR #49 e o polling existente. Não remover proteções para testar.
2. Admitir o backend real de capability e sua versão: as quatro funções exigidas pelo guard estão AUSENTES na leitura remota. Instalar SQL não prova ativação segura do servidor; os guards de ambiente e o vínculo do consumidor também precisam de evidência. Reutilizar os candidatos #44/#48/#49; não apontar o harness Docker ao hospedado.
3. Reconciliar os consumidores restantes, incluindo clientes já baixados, integrações e código dinâmico. Seis URLs suspensas não comprovam esgotamento do inventário. A confirmação de consumidores do clone não é recibo global.
4. Somente após autorização nominal separada, usar `remote-cut.pending.sql`, com seus hashes conferidos. O script bloqueia se faltarem funções, houver novas variantes, deriva de corpo/ACL ou wrapper SQL literal ainda chamando o legado. Não remover guards nem preencher aprovação fictícia.
5. Verificar ACL efetiva das duas assinaturas para anon/authenticated/service_role, preservação das funções novas e controles legítimos no ambiente/tenant fictício especificamente autorizado. Não repetir pedido incerto para obter PASS.

Recuperação:

- Falha antes do COMMIT: STOP e observar o estado da transação/catálogo; nenhum retry ou mudança compensatória automática. Manter a suspensão externa. Não presumir que houve revogação.
- COMMIT incerto/resposta incompleta: STOP. Preservar o recibo integral e reconciliar por leitura antes de decidir qualquer operação.
- Revogação confirmada e falha em consumidor legítimo: manter as RPCs inseguras revogadas; manter suspensão/HOLD e corrigir o fluxo por capability (roll-forward). Não executar GRANT como rollback e não restaurar corpos antigos.
- Os defaults de funções public ainda concedem EXECUTE a anon/authenticated/service_role. Não alterar defaults globalmente neste corte; verificar novamente estas assinaturas após futuras migrações, especialmente DROP/CREATE.

`create_public_order(jsonb)` não é revogada por este delta: continua necessária ao novo servidor e é um gate separado. A variante enum e o wrapper ausente não são declarados cobertos em outros projetos. O projeto Delivery de testes está INACTIVE; não foi retomado. Homologação hospedada não foi usada como executor.

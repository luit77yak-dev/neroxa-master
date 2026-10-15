# F02 — varredura executável e pré-condições para revogação

Auditoria **somente de fontes públicas versionadas**, sem dados de clientes, dotenv ou backend remoto. Os artefatos **não** comprovam migração de consumidores instalados nem permitem revogar grants.

Fixação:
- Delivery PR42 código 4ce88959a751066f96da4cbab8d1fc9ac29bb320.
- Master PR46 auditado a partir de b40f2777168919852bd5a4b95a1046d8fbd3fbdf.
- Ensaio histórico 38665665942: tracking privado positivo, F02 anon UUID+telefone P0 confirmado.
- Auto-deploy desabilitado para a branch via vercel.json.

O workflow de varredura percorre os diretórios dos dois checkouts: fontes runtime, testes, scripts, migrations e candidatos SQL. Saída mostra ocorrências de três nomes legados e chamadas RPC indiretas, rotuladas para **REVISÃO MANUAL**. Não converta mera referência histórica de migration, tipo gerado ou teste em consumidor ativo. Um arquivo sem símbolo literal não exclui chamada dinâmica, outra branch/instância nem integração externa.

Gate já existente: audits/02a4/phone-rpc-quarantine.release-gate.sql.
NÃO SETAR a GUC de consumidores desativados sem prova legítima e NÃO criar CONSUMER-DISABLEMENT.json para passar verificador.

Próximos itens obrigatórios antes do gate em clone:
1. Obter responsáveis, versões e ambientes efetivamente operantes dos consumidores externos e seus substitutos.
2. Inventariar pg_proc/regprocedure, owners, grants efetivos/inherited, wrappers SECURITY DEFINER, views, policies e defaults no clone.
3. Executar pré-gate com Auth real A/B/C, registrar snapshots, aplicar gate apenas com pré-condições comprovadas e repetir negativas legadas/positivos privados com digests.
4. Sem prova dos consumidores, gate BLOCKED e pós-gate NOT RUN. Nunca SQL remoto, merge/deploy nem restauração de EXECUTE por telefone.

F01/F02 abertos, comercial não liberado, Marco01 0/7.

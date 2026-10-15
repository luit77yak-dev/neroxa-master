# F02 — correção da origem SQL de recuperação (candidato, somente clone)

Revisão em 15/10/2026 para Master PR #46 (draft), origem HEAD `f3d58242725de7345e86b3b05f4986949a5e9317`; Delivery PR #42 `011275488660bfa1a9271b3e4c92e457f7638e34` fixada.

- Arquivo: `audits/02a5/recovery-without-phone.candidate.sql`.
- SHA-256 anterior (falha de delimiter): `46332b0bc0746a928143ca35c92ff957599f6f8693efec09beb3fd96efab067a`.
- SHA-256 exato corrigido: `b1ef02f71a9d087ef5bec59e93406f142e2bad5bec0e870e2b652904c3c307c4`.
- Alteração estrita: suprimir um `$function$` isolado dentro do corpo `$snapshot$`; nenhuma mudança na lógica, grants, owners ou predicados de permissão.
- Verificação inicial: hash original correspondeu ao manifesto; hash corrigido coincidiu com derivação documentada no runner descartável [38783768679](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38783768679).
- **Estado antes do novo runner:** SQL fonte + manifesto reconciliados, executor sem patch de memória; **instalação e testes exatos ainda NOT RUN**. Run disparado pela atualização da branch precisa ser inspecionado.
- **Limites:** P0s legados F02 continuam abertos, consumidores externos/previews UNKNOWN, gate oficial BLOCKED, pós-gate NOT RUN, F01 OPEN, marco 01 0/7, comercial NÃO LIBERADO.
- Não alterar banco remoto, domain/DNS, aliases, merge/deploy nem contratar serviços. Recuperação sem telefone só autorizada para candidatos sintéticos e não homologada para produção.

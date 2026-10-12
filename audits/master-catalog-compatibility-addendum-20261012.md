# Complemento da auditoria de compatibilidade — 2026-10-12

Consulta **somente leitura** no Supabase Master `iefaoaqzltvpfabyeelj`, comparada ao snapshot `audits/ab-auth/master-catalog-20261009.json`. Sem DDL/DML, deploy ou merge.

## Achados

- 50 funções: 48 em `public`, duas em `private`; nomes, corpo SQL e atributo SECURITY DEFINER sem diferenças detectadas no cotejo textual.
- 99 políticas RLS: nomes e expressões comparados sem diferenças detectadas.
- 121 índices: nomes e DDL textuais iguais na comparação.
- 22 triggers: nomes iguais; saída de DDL apresenta qualificação `public.` em consulta atual, sem alteração funcional demonstrada.
- 145 constraints: nomes iguais; 46 diferenças de formatação textual, principalmente parênteses. **Equivalência semântica ainda não demonstrada integralmente.**
- 438 colunas no `information_schema` incluindo views; consulta de `pg_attribute` limitada a tabelas físicas trouxe 424, deixando de fora 14 colunas de view. Essa diferença não demonstra remoção.
- Tipos de colunas: a consulta com `udt_name` produz aliases (`timestamptz`/`timestamp with time zone`, `bool`/`boolean`) e perde modificadores de `numeric(12,2)`. A consulta `format_type` das tabelas físicas não indicou diferenças adicionais nos campos comparados, mas a comparação completa de view/tipmods exige relatório reproduzível.
- Dez enums e cinco extensões presentes, sem evidência de ausência.
- ACLs de 34 relações e 50 funções: o formato de `pg_*acl::text` difere do array armazenado no snapshot; exemplos inspecionados contêm as mesmas entradas, mas **comparação normalizada completa de ACLs não foi concluída**.
- Privilégios padrão: o snapshot registra **seis entradas**, todas no schema `public` (owners `postgres` e `supabase_admin`, tipos S/f/r). O banco atual tem **24 entradas em todos os schemas**, das quais **as mesmas seis entradas `public`**, com as mesmas ACLs. As 18 restantes são de schemas gerenciados como auth, storage, realtime, graphql, graphql_public e extensions; a captura histórica foi delimitada ao `public`. **A contagem 6 vs 24 não é drift demonstrado de permissões do Master.**

## Decisão

**Nenhuma incompatibilidade material confirmada até aqui.** Permanecem pendentes: normalização exaustiva de ACLs e colunas/views, comparação semântica das constraints, proveniência do catálogo e verificação de consumidores e dados legados. **Release: INCONCLUSIVO.** Não aplicar SQLs candidatos na produção nem mesclar PR #37 antes do ensaio de migração/rollback e das aprovações necessárias.

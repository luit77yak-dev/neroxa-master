# Auditoria de compatibilidade do catálogo — 2026-10-12

**Escopo:** inspeção somente de leitura do Supabase Master `iefaoaqzltvpfabyeelj`, comparado à captura estrutural de 2026-10-09 em `audits/ab-auth/master-catalog-20261009.json`. Nenhuma migração, DML, deployment ou merge executado.

## Resultados verificados

| Categoria | Captura | Master atual | Identidade dos objetos |
| --- | ---: | ---: | --- |
| Relações públicas (tabelas/views) | 34 | 34 | mesmos nomes |
| Colunas públicas | 438 | 438 | mesmos nomes |
| Funções public + private | 50 | 50 | mesmos nomes e definições SQL textuais |
| Políticas RLS públicas | 99 | 99 | mesmos nomes, expressões e comandos |
| Triggers públicos | 22 | 22 | mesmos nomes |
| Índices públicos | 121 | 121 | mesmos nomes e definições |
| Constraints públicas | 145 | 145 | mesmos nomes |

**Correção da contagem:** a captura contém 48 funções em `public` e 2 em `private`; o Master também contém 48 + 2. Não há duas funções ausentes. Cinco diferenças iniciais de assinatura foram causadas por inclusão/omissão de valores DEFAULT em formatos distintos, não por funções adicionais.

**Comparação de definições:** funções (50), policies (99) e índices (121) não apresentaram diferenças na comparação textual normalizada por espaços. As 22 definições de triggers aparecem diferentes por qualificação `public.` na saída de catálogo. Em constraints, 46 diferenças textuais aparentam ser de parênteses/representação de expressões; não foi demonstrada alteração semântica. Nas colunas, 161 diferenças de representação de tipo foram sinalizadas, incluindo `timestamptz` vs `timestamp with time zone`, `bool` vs `boolean` e `numeric` vs `numeric(12,2)`. A consulta de comparação utilizou `information_schema.columns.udt_name`, que perde os modificadores de precisão/escala: **não considerar esses 161 casos prova de equivalência de tipo**.

## Incompatibilidades confirmadas

Nenhuma incompatibilidade estrutural material confirmada nesta rodada. Isso **não equivale** à certificação completa de equivalência de catálogo ou de implantação.

## Verificações ainda necessárias antes do ensaio de migração

1. Comparar tipos PostgreSQL usando `format_type(atttypid, atttypmod)`, defaults, nulidade, identidade e geração para as 438 colunas.
2. Comparar definições de constraints e triggers após normalização semântica/DDL, não apenas contagens.
3. Comparar ACLs, owners, defaults de privilégios, extensões, enums, schemas privados e dependências gerenciadas.
4. Verificar alterações de consumidores do schema (frontend, RPCs legadas, jobs, integrações) desde a captura.
5. Ensaiar cutover e rollback com dados históricos fictícios de organizações com múltiplas instâncias; nunca executar fase 2 em produção antes de resolver mapeamentos.

**Decisão:** compatibilidade preliminar promissora, mas liberação para produção permanece **INCONCLUSIVA**. Manter PR #37 em draft; não aplicar migrações.

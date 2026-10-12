# Inventário inicial de consumidores — isolamento por instância

**Escopo:** revisão estática pontual na branch da PR #37. Não é inventário exaustivo nem certificação de produção.

## Evidências verificadas

| Consumidor                                        | Evidência                                                                                                                                                      | Avaliação                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/routes/master-catalogo.tsx`                  | Consultas de categorias/produtos filtram por `instance_id` (linhas ~174, 180); configurações fazem `upsert` com `onConflict: "instance_id"` (linhas ~214–221). | Compatível em princípio com a PK por instância; testar execução e grants.    |
| `tools/ab-auth/run.mjs`                           | Fixtures A1/A2/C1 e testes de Auth/JWT/PostgREST, checkout e administração.                                                                                    | Exercita caminhos candidatos, não representa todos os consumidores externos. |
| `tools/ab-auth/historical_rehearsal.mjs`          | Rejeição atômica da fase 2 com A unresolved (linhas ~43–46); mapeamento explícito, mudança de PK e criação de settings A2 (linhas ~53–77).                     | Prova transacional no clone, não restauração de backup.                      |
| `audits/master-catalog-compatibility-20261012.md` | Comparação de objetos históricos e atuais; equivalência de tipos/ACLs/dependências ainda não certificada.                                                      | Gate permanece inconclusivo.                                                 |

## Riscos ainda abertos

- Busca de código da branch inteira, incluindo edge functions, jobs, consumidores legados, views, triggers, RPCs e componentes do delivery.
- Consulta ao catálogo real de dependências da PK antiga, ACLs, owners, `format_type`, constraints e triggers.
- Consumidores externos ao repositório não são cobertos por busca de código.
- Restauração em **outro clone** a partir de backup lógico e comparação de contagens, hashes e permissões não demonstrada.

## Próxima execução obrigatória

1. Inventariar todos os caminhos de leitura/escrita de settings e zonas e registrar caminho/linha/ação/filtro/chave de conflito.
2. Inspecionar dependências da PK e diferenças semânticas de catálogo antes do cutover.
3. Criar backup de fixture fictícia, executar migração em clone, restaurar em outro clone e comparar checksums, objetos e grants.
4. Arquivar logs, SHA e resultados do CI; bloquear implantação se houver qualquer divergência não explicada.

**Decisão:** NO-GO para produção; PR #37 permanece draft.

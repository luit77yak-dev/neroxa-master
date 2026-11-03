# Ensaio de restauração — revisão de 12/10/2026

PR #37, branch `audit/store-isolation-candidate-20261011`. Produção não foi consultada nem modificada. A PR foi devolvida a **draft** ao constatar que estava aberta como ready. Deploy por push permanece desabilitado para esta branch em `vercel.json`.

## Diagnóstico comprovado

O diagnóstico começou pelo run **38208303743**, SHA `b1dc969`, e pelos dois runs anteriores. Todos falharam durante `pg_restore --clean --if-exists`: `DROP POLICY IF EXISTS ... ON public.neroxa_storefront_product_addon_groups` referenciou uma tabela inexistente no destino. A fase de limpeza era inadequada para esse destino vazio. Nenhuma conclusão foi baseada apenas na lista de erros fornecida.

| Falha                                     | Evidência e causa                                                                                                                                                                                     | Tratamento                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `instance_id does not exist`              | Em `3a6c695`, o agregado externo ordenava por `instance_id`, mas a subconsulta projetava somente `organization_id` e outros campos.                                                                   | Comparar todos os campos e ordenar pela identidade da loja.                                                                                                                                                                                                                                                 |
| `Unexpected extension`                    | Validação antiga aceitava somente `[a-z0-9_]`, rejeitando nomes válidos com hífen.                                                                                                                    | O archive completo delega dependências e extensões a pg_restore; sem interpolar nomes recuperados em CREATE EXTENSION.                                                                                                                                                                                      |
| `public already exists`                   | Runs 38205663618/38206021027/38206406595. Destino inicializado e recriação do schema conflitavam. Em 99d924e, sequências literais de `\n` dentro de um comentário também comentavam o DROP planejado. | `template0` e decisão baseada no TOC do archive, sem editar SQL exportado.                                                                                                                                                                                                                                  |
| `exactly one public schema declaration`   | Runs 38206209035/38207125729. A presença obrigatória de CREATE SCHEMA public era uma suposição inválida.                                                                                              | Aceitar zero ou uma entrada SCHEMA public no TOC; usar schema nativo somente quando o archive não o cria.                                                                                                                                                                                                   |
| `auth does not exist`                     | Runs 38206669008/38206690119: export somente de public não incluía dependências Auth/private.                                                                                                         | Archive lógico completo da base local, incluindo owners e ACLs.                                                                                                                                                                                                                                             |
| `Unrecognized input header: 72`           | Run 38207401651, caminho antigo de transferência via Docker exec. O log indica falha de framing, mas não permite identificar definitivamente a camada responsável.                                    | Archive custom permanece dentro do contêiner. Teste real do relay compara SHA-256 de 1 MiB binário sintético; não presumir defeito atual do relay.                                                                                                                                                          |
| DROP POLICY em relação ausente            | Runs 38208229252/38208282828/38208303743.                                                                                                                                                             | Restore sem `--clean`, exclusivamente em banco recém-criado.                                                                                                                                                                                                                                                |
| `must be able to SET ROLE supabase_admin` | Run 38209585879, após remover a limpeza indevida. Executor postgres não podia restaurar owners/ACLs gerenciados.                                                                                      | Usar supabase_admin nativo somente dentro do contêiner descartável, verificando superuser; nenhum GRANT/membership global alterado.                                                                                                                                                                         |
| `text                                     |                                                                                                                                                                                                       | "char"` ambíguo                                                                                                                                                                                                                                                                                             | Run 38209808136, após a importação real: consulta de fingerprint concatenava `pg_trigger.tgenabled` sem cast. | Cast explícito e teste das consultas completas em PostgreSQL real. |
| Fingerprint de schemas divergente         | Run 38210096247. Um hash de ACL bruta não informa se a diferença é de ordenação ou de permissões.                                                                                                     | Comparar ACL efetiva ordenada, incluindo owner/grantee/grantor/grant option; registrar detalhes de schemas para diagnóstico. O run 38210443538 comprovou perda efetiva de grants em graphql/graphql_public. O suplemento de ACL capturado corrigiu a perda; diferença efetiva continua bloqueando o ensaio. |

O run 38209346435 registrou apenas o comando que falhou, porque o primeiro tratamento de erro ficou restritivo demais. Foi corrigido para registrar somente a mensagem principal `ERROR`, sem `DETAIL`, SQL, parâmetros ou linhas de dados.

## Estratégia e limites do backup

1. Recriar **todo** o catálogo histórico versionado em `audits/ab-auth/master-catalog-20261009.json`, com hash validado; não uma fixture mínima.
2. Seed fictício de duas organizações e três lojas. Fase 1 deve deixar as linhas ambíguas sem atribuição; fase 2 deve falhar atomicamente até a reconciliação fictícia explícita.
3. Comparar todos os campos históricos de settings/zones, excluindo apenas a nova coluna instance_id; depois aplicar os candidatos de segurança e criar identidades Auth fictícias, produtos, pedidos, itens e histórico.
4. `pg_dump -Fc` usando cliente PG17 da própria imagem, arquivo privado dentro do contêiner; SHA-256 verificado antes/depois, assim como o companion ACL. Não publicar nenhum dos arquivos.
5. Capturar também `restore_extension_acl.sql` em arquivo privado de acompanhamento: o archive sozinho não recuperou todos os grants de bootstrap dos membros de extensões. Tipos array herdam permissões do tipo base; não recebem GRANT direto.
6. Criar banco com nome exclusivo do run a partir de template0. O TOC decide o bootstrap de public. Restaurar com `--exit-on-error --single-transaction`, preservando owners/ACLs.
7. Comparar catálogo, todas as tabelas incluídas no dump, valores de sequências e integridade de FKs, inclusive NOT VALID.
8. Iniciar **Auth e PostgREST separados**, ligados ao destino e disponíveis apenas em loopback. Fazer login nas contas restauradas e usar seus JWTs para testar RLS e RPCs. Service role é usado apenas para provisionar usuários fictícios na origem.
9. Remover APIs temporárias, banco clone e archive. Qualquer falha de limpeza torna o resultado FAIL. O workflow verifica ausência de contêineres do projeto e remove sua rede.

O segundo banco no mesmo cluster é suficiente para este ensaio de restauração lógica da base e da migração: ele não herda tabelas da origem, utiliza template0 e tem Auth/REST próprios. **Não comprova restauração das roles globais em cluster independente**: roles/memberships são compartilhadas e não fazem parte de pg_dump. A evidência declara esse limite; não é um procedimento aprovado para restaurar sobre schemas gerenciados de um projeto Supabase remoto. Configuração do projeto, segredos, storage externo, extensões fora da imagem e recuperação integral de outro cluster continuam fora desta prova.

A captura de 09/10 é histórica, não comprovação do catálogo atual de produção. Supabase-managed defaults não são reescritos para facilitar o teste.

## Comparação e critérios

- Schemas/owners/ACLs efetivas; relações, RLS e FORCE RLS; colunas/tipos/defaults/identity/generated/ACLs; views e reloptions.
- Policies completas: roles, comando, permissividade, USING e WITH CHECK.
- Funções por assinatura: definição, owner, EXECUTE, SECURITY DEFINER/INVOKER, search_path/config, strictness, volatility, leakproof, parallel, cost/rows.
- Triggers, estado, event triggers; constraints e validação; definições e estado dos índices; enums/tipos/owners; extensões e versões; default privileges.
- Digests de conteúdo completo por tabela e valores de sequências, incluindo Auth. Tabelas internas de extensões não exportadas por pg_dump ficam fora do digest de dados; extconfig exportado é incluído. Nenhuma linha Auth é retornada nos logs.
- FKs verificadas por consultas de integridade, não apenas por contagem de constraints.
- JWTs reais: própria loja permitida, lojas da mesma organização e de outra organização bloqueadas, outsider/anon bloqueados, PATCH/DELETE negativos com digest antes/depois, status RPC estrangeira bloqueada, status autorizado com histórico preservado.

## Arquivos

- `tools/ab-auth/restore_rehearsal.mjs`: restore, precondições, comparações, relatório e limpeza.
- `tools/ab-auth/restore_security.mjs`: fixtures Auth, APIs do destino e matriz autenticada.
- `tools/ab-auth/restore_data.sql`, `restore_properties.sql`, `restore_integrity.sql`, `restore_extension_acl.sql`: verificações sem exportar dados.
- `tools/ab-auth/restore_test.py`: roundtrip PG17, detecção de alterações/órfãos e transporte binário pelo relay.
- `tools/ab-auth/historical_rehearsal.mjs`: preservação de todos os campos legados.
- `.github/workflows/isolated-historical-rehearsal.yml`: gatilhos e limpeza verificada.

Nenhuma migration candidata, função comercial, policy comercial, frontend ou configuração de produção foi alterada por esta revisão. `build_schema.py`, relay, fixtures/candidatos foram inspecionados; o relay existente foi testado, não substituído.

## Testes locais e infraestrutura

- 32 testes Vitest aprovados; lint sem erros, com 12 warnings preexistentes; build aprovado; formatação dos arquivos exigidos pelo CI aprovada; diff --check aprovado.
- PostgreSQL 17 descartável, imagem já disponível, sem portas e rede none: roundtrip real, consultas de catálogo/propriedades, corrupção controlada de instance_id/SECURITY DEFINER e detecção de FK órfã.
- Relay privado Unix: 1 MiB de bytes sintéticos com digest idêntico; três testes existentes do relay aprovados. Contêiner e diretório temporários removidos.
- Matriz real Auth/PostgREST: run 38209346409, **268/268** aprovadas, incluindo MFA real e isolamento entre organizações. Não é uma prova do restore por si só.
- Artifacts dos runs antigos: metadados acessíveis, download indisponível neste ambiente. Logs dos jobs acessíveis; resultados finais sanitizados serão preservados abaixo. Não foram copiados dumps nem logs privados da plataforma.

## Resultado final

**APROVADO para o ensaio isolado deste catálogo histórico; liberação de produção/PR permanece INCONCLUSIVA.**

Código aprovado: `7e506c22358aa3dfe585ac5b891f80a3fe735062`.

| Execução                                                                                                | Resultado                                                                                  |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [Restore e migração histórica](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38211490095) | PASS: 28 verificações históricas + 177 verificações de restore/segurança; cleanup aprovado |
| [Matriz Auth/PostgREST/MFA](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38211490180)    | 268/268 aprovadas; classificação de release deliberadamente INCONCLUSIVO                   |
| [CI push](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38211490123)                      | lint, 32 testes, build, formatação aprovados                                               |
| [CI PR](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38211494418)                        | quatro checks aprovados                                                                    |

Stack efetiva: CLI 2.120.0, PostgreSQL/pg_dump/pg_restore 17.11, imagem `supabase/postgres:17.11.0.004`, GoTrue v2.197.0, PostgREST v16.4, Node v22.23.3. Não houve contratação nem criação de projeto remoto.

**Origem/destino:** dez categorias de fingerprints de estrutura/ACL idênticas; propriedades adicionais de funções/defaults/tipos/índices/sequências/event triggers idênticas; conteúdo de **85 tabelas** e estado de sequências idênticos; **88 FKs** sem órfãos. Os três pedidos, três itens e três registros iniciais de histórico fictícios foram recuperados; os testes de status autorizados acrescentaram um histórico CONFIRMED por pedido somente no destino. A origem permaneceu inalterada durante os testes HTTP do destino. Settings/zones conservaram todos os campos e instance_id, com três lojas em duas organizações.

O destino iniciou GoTrue próprio, autenticou as quatro contas recuperadas e emitiu JWTs aceitos por seu PostgREST. As requests de autorização usaram JWT authenticated (superuser=off) ou anon, nunca service_role. A matriz completa de checkout/tracking/append/MFA foi executada no job separado; a matriz do clone restaurado cobriu leituras/RLS, negativas de escrita e RPC de status/histórico.

Evidências sanitizadas em `audits/rehearsal/evidence/`: report do restore, report histórico e matriz completa. Hashes do archive e companion constam do report. O companion é necessário: não apresentar o `.dump` sozinho como recuperação completa de ACLs. Logs privados, passwords, JWTs e dumps não foram incluídos nos arquivos versionados.

### Riscos restantes e recomendação

- **Alto — implantação:** captura histórica não comprova catálogo atual, dados/backfill ou consumidores atuais. Reconciliar esses fatos antes de aplicar candidatos em qualquer projeto real.
- **Alto — recuperação integral:** roles globais/memberships não foram restauradas em cluster independente; configuração externa do projeto não faz parte do dump. Este é um ensaio lógico dentro da plataforma local, não certificação de desastre total do projeto.
- **Alto — rollback do cutover:** o snapshot é pós-cutover. Não foi testado retornar à PK organization_id depois de novas gravações por loja. Não usar este resultado como aprovação de downgrade/rollback de produção.
- **Limitado ao caminho antigo:** a camada exata que gerou header 72 não pôde ser demonstrada pelos logs históricos. O caminho atual não transporta archive binário pelo relay, e o relay passou teste real de integridade de bytes.

Recomendação: **manter PR #37 em draft**, preservar estes checks e fechar os gates de catálogo atual/backfill/consumidores/rollback antes de decisão de implantação. O erro do ensaio foi corrigido com restauração real e evidência verificável; não autoriza merge, deploy ou escrita em produção.

### Commits desta revisão

`b19fb4b`, `f14f6ae`, `1002f90`, `eb2e4ec`, `d2e386e`, `8589a75`, `aaa6f16`, `7e506c2`: restauração, Auth destino, executor nativo, comparadores, ACL efetiva/companion e sequências. Histórico publicado não foi reescrito.

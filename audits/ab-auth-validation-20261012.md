# Validação real A/B — PR #37

**Classificação final geral: INCONCLUSIVO para liberação/implantação.**

**Resultado executado: matriz isolada aprovada, 165/165 verificações, zero falhas.** Há evidência real de isolamento no catálogo histórico completo reconstruído. Falta comprovar que esse estado é o estado atual do Master e ensaiar o cutover de dados/consumidores existentes. Não se converte o resultado em certificação de produção.

Execução final: [GitHub Actions 38193749209](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38193749209), SHA `8ee9b6b253413b6b77100a5b863821937d3f0ee3`. Branch `audit/store-isolation-candidate-20261011`, [PR #37](https://github.com/luit77yak-dev/neroxa-master/pull/37). [Matriz com cada cenário/ator/HTTP/SQLSTATE](ab-auth/evidence/final-matrix.json), [falhas originais](ab-auth/evidence/before-runtime-fixes.json), [reteste intermediário](ab-auth/evidence/after-scope-fixes.json), [execuções](ab-auth/evidence/runs.json).

## Ambiente realmente executado

VM temporária `ubuntu-latest`, Node22.23.3, CLI **2.120.0**, **PostgreSQL17.11 / supabase/postgres:17.11.0.004**, **GoTrue2.197.0**, **PostgREST16.4**, Kong2.8.1. Imagens oficiais; registry Docker Hub selecionado pelo mecanismo suportado da CLI depois do limite comprovado no ECR público. Não houve rotação de identidade/IP nem novas tentativas no registry limitado.

Diretório `$RUNNER_TEMP/neroxa-ab-<run-id>` criado novo, sem migrations/seed de aplicação e sem project-ref remoto. Rede própria. A CLI tentava publicar portas em 0.0.0.0: o relay Unix privado em `tools/ab-auth/docker_loopback.py` força 127.0.0.1 antes da criação dos containers do projeto; o runner inspeciona todos os binds antes de criar usuários. Helpers temporários sem portas não são reescritos. O relay não modifica rotas, credenciais ou daemon Docker.

Cada execução removeu apenas sua stack/rede, incluindo execução final. Tokens, senhas, segredo TOTP e arquivos privados de status/startup não foram publicados como artifacts. Artifacts contêm apenas resultados sanitizados. Houve limitação de download do artifact pelo ambiente do assistente; os mesmos resultados foram coletados dos logs sanitizados do Actions, sem contornar o bloqueio de download.

`vercel.json` desabilita deployment Git **somente desta branch** para evitar preview automático durante os pushes; configurações de main/produção continuam preservadas. Não foi feito merge, deployment, contratação ou escrita em Supabase remoto. O worktree local anterior de hardening permaneceu intacto.

## Schema e dependências

Fonte: catálogo capturado **2026-10-09T18:21:56.532556+00:00**, existente nas evidências A07; cópia **somente estrutural** em `ab-auth/master-catalog-20261009.json`, origem/hash em `ab-auth/source.json`.

O replay não usa fixture mínima para substituir o Master: reconstrói **33 tabelas públicas e uma view, 438 colunas, dez enums, 145 constraints, 121 índices, 22 triggers, 50 funções e 99 policies capturados**, owners e ACLs explícitos. A execução confirmou contagens de 34 relações, 50 funções e 99 policies antes dos candidatos. FKs para auth.users usam o schema **real da plataforma**, preenchido pelo Auth real. Nenhuma auth.uid/auth.jwt fake, autenticação mockada ou JWT autenticado fabricado.

[Dependências por relação](ab-auth/evidence/dependencies.json) inclui FKs, triggers e dependências registradas no catálogo. Ordem: schemas/enums → todas as tabelas → constraints locais/unique/PK → FKs → view → funções → índices restantes → triggers → policies/RLS → ACLs/defaults de aplicação. Como no restore lógico, body validation é temporariamente adiada para resolver dependências entre funções; os caminhos efetivamente utilizados são compilados e executados pela matriz HTTP. Não se afirma que todas as 50 funções comerciais foram funcionalmente testadas.

Diferenças/limites conhecidos:

- Capture histórico não prova ausência de drift no Master atual nem fecha proveniência A07 dos CREATEs originais.
- Roles, memberships, Auth, JWT, extensões e serviços são os da plataforma CLI local. Defaults de `supabase_admin` registrados **não foram regravados**; equivalência exata desses metadados gerenciados com produção não foi declarada.
- Instalação sobre baseline estrutural vazio, com dados fictícios criados depois: não valida backfill de organizações reais com múltiplas instâncias ou dependências adicionadas após a captura.
- Um RPC **somente de teste**, `ab_runtime_identity()` SECURITY INVOKER, lê current_user/auth.uid/auth.jwt e comprova por HTTP que as sessões chegam ao PostgreSQL como `authenticated`, com UID correto, AAL1/AAL2 e superuser off. Não integra os SQLs candidatos nem a aplicação comercial.

## SQLs aplicados no clone, na ordem

1. instance-membership-foundation.candidate.sql
2. storefront-instance-phase1.candidate.sql
3. store-product-category-guard.candidate.sql
4. storefront-tenant-integrity.candidate.sql
5. storefront-parent-instance-guard.candidate.sql
6. store-isolation-policies.candidate.sql
7. storefront-instance-phase2-cutover.candidate.sql
8. storefront-settings-zones-rls.candidate.sql
9. storefront-admin-rpc.candidate.sql
10. storefront-rpcs-phase2.candidate.sql
11. store-isolation-prerequisites.assert.sql
12. **store-isolation-runtime-hardening.candidate.sql** — correções resultantes da matriz.

Hashes realmente executados constam em `final-matrix.json`. Qualquer falha de replay interrompe o runner antes da próxima fase, sem CASCADE ou supressão de erros. Esses arquivos permanecem candidatos em `audits/sql/`, fora de migrations automáticas.

## Identidades e dados fictícios

Uma organização, um sistema-base reutilizável fictício DELIVERY, lojas A/B desse mesmo sistema/organização; produtos/categorias/pedidos/itens/histórico/settings/zones separados por loja e domínios `.invalid`. Nenhuma cobrança ou pagamento real; pedidos CASH fictícios.

Cinco usuários criados por **Auth Admin local**, confirmados e autenticados por password login real: operador A/OPERATOR com grant A; operador B/OPERATOR com grant B; administrador de organização/ADMIN **com grant A somente**; administrador Neroxa/ADMIN; usuário externo sem vínculos. Anon é o cliente público, sem membership. Auth IDs fictícios e papéis constam no resultado final, sem JWTs/senhas.

Somente provisionamento de identidades usa service_role local; somente DDL/seed usa postgres. A seed abre `SET LOCAL neroxa.implementation_write_path='official'` na transação de fixture para respeitar o guard de INSERT de instâncias existente. Não desativa triggers nem injeta claims de autenticação. Todas as asserções de autorização usam HTTP/JWT real; não se apresenta a seed como teste do fluxo comercial de contratação/implantação.

## Matriz permitida/bloqueada — resultado real

| Contexto                   | Dados privados A                  | Dados privados B               | Escrita de catálogo/configuração                                        | Pedidos                                                              |
| -------------------------- | --------------------------------- | ------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Operador A                 | leitura permitida                 | leitura/escrita negadas        | catálogo próprio não editável pelo papel OPERATOR                       | RPC de status de A permitida; B negada; DML direto negado            |
| Operador B                 | leitura/escrita negadas           | leitura permitida              | restrições simétricas                                                   | RPC de B; sem acesso operacional a A                                 |
| Admin organização, grant A | leitura/escrita autorizadas em A  | negadas                        | produto/configuração/zona de A permitidos; sem grant silencioso B       | somente escopo concedido                                             |
| Admin Neroxa AAL1          | privilégios de plataforma negados | negados                        | settings de B e grant de membership negados                             | não transforma AAL1 em AAL2                                          |
| Admin Neroxa AAL2          | acesso administrativo previsto    | acesso administrativo previsto | leitura e operações permitidas; **transferências de tenant rejeitadas** | RPC administrativa permitida; sem DML direto                         |
| Externo autenticado        | negado                            | negado                         | sem grants/elevação                                                     | sem operações administrativas                                        |
| Anon                       | tabelas privadas negadas          | tabelas privadas negadas       | catálogo público pelo domínio exato                                     | checkout/append/tracking segundo contrato público, sem administração |

165 checks incluem: logins/JWTs, papel PostgreSQL efetivo, SELECT e tentativas de UPDATE/DELETE por ator/loja, INSERT estrangeiro, self-grant, categoria cruzada, RPC administrativa própria/estrangeira, leitura de itens/histórico, tenant/org imutáveis, checkout com preço adulterado recalculado pelo servidor, produto de B em pedido A rejeitado, org/instância divergentes rejeitadas, retry idempotente, tracking/append com contato incorreto, append positivo com total 60, append de produto estrangeiro rejeitado, TOTP/challenge/verify e AAL2 efetivo.

HTTP200 com `[]` pode significar bloqueio RLS; HTTP400/23514 pode significar bloqueio de integridade. Não foram classificados automaticamente como sucesso de mutação ou vulnerabilidade. Os controles positivos garantem que negar tudo não faz a matriz passar.

## Falhas comprovadas e correções

| Achado                                                   | Evidência                                                               | Correção / regressão                                                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Migrações versionadas sem fundação                       | Smoke antigo falhou por ausência de neroxa_organizations                | Bootstrap sem migrations do repo; reconstrução do catálogo completo separado. **Não declara cadeia histórica aprovada.**      |
| RPCs candidatas sem delimitador                          | Replay real parou no décimo arquivo com syntax error perto de CREATE    | Quatro terminadores `$function$;`, teste estático adicional e replay completo posterior                                       |
| Produto legítimo de admin A bloqueado                    | POST201 esperado recebeu403/42501                                       | SELECT de instância somente para membership explícita, requerido por WITH CHECK/guards INVOKER; A permitido/B continua negado |
| Itens/histórico próprios invisíveis                      | GET200 retornava[] para A                                               | Policies SELECT relacionadas ao pedido autorizado, incluindo acesso de plataforma AAL2; sem concessão pública                 |
| Transferência produto/categoria                          | PATCH de administrador AAL2 retornou200 e permitiu troca de instance_id | Triggers de instância imutável; chamadas posteriores rejeitadas, sem relaxar RLS                                              |
| Membership de plataforma com AAL1                        | POST201 no token AAL1 real                                              | Helper privado existente passa a exigir AAL2 no servidor; reteste403                                                          |
| Proteção direta de pedidos dependia de efeito incidental | Acesso ao pai corrigido poderia remover a negação incidental dos guards | DML direto revogado de anon/auth em pedidos/itens/histórico; RPCs SECURITY DEFINER continuam autorizadas e testadas           |
| Append válido ambíguo                                    | HTTP400/SQLSTATE42702                                                   | Alias `o` e subtotal/total/payment_method qualificados; mesma assinatura/precificação, reteste total60                        |
| Probe JWT chegava antes do cache REST                    | Cinco404/PGRST202 em execução intermediária                             | Readiness espera o RPC recém-criado, não apenas uma tabela já no cache; asserts de identidade mantidos                        |

Cinco negativas de INSERT receberam400/23514 em vez do403 esperado; outra tentativa de transferir pedido recebeu200/[] (nenhuma alteração). Eram expectativas de HTTP excessivamente estreitas, **não seis bypasses confirmados**. Foram corrigidas para aceitar negação estrutural/sem linhas, preservando os controles positivos. A evidência bruta sanitizada continua disponível.

## CI, arquivos e limites restantes

Além da matriz real final verde, os jobs **lint, test, build e format** da PR passaram no mesmo SHA. Vitest local passou **32 testes em quatro arquivos**; unit tests do relay passaram3. Os warnings ESLint e a dívida TypeScript já documentados na correção CI não foram ocultados. Não houve alteração de frontend/estética nesta tarefa.

Arquivos: workflow isolado refeito; relay/configurador/gerador/runner em `tools/ab-auth/`; snapshot estrutural/manifest/dependências/resultados; novo hardening candidato, terminadores do RPC existente e teste estático de regressão; este relatório e `local-ab-environment.md`; bloqueio branch-specific de deployment em vercel.json.

Antes de implantar, faltam somente decisões/evidências relacionadas ao corte:

1. **Alta — drift/proveniência:** comparar o catálogo atual autoritativo com a captura histórica completa, incluindo roles/defaults/ACLs gerenciados e consumers. Não assumir que CI local fecha A07.
2. **Alta — upgrade/cutover:** ensaiar dados fictícios históricos com settings/zones organization-scoped de organizações multi-instância; definir mapeamento explícito, writers e rollback. Não aplicar phase2 enquanto consumidores legados usarem organização como chave.
3. **Alta — gestão e APIs legadas:** implementar/aprovar concessão/revogação auditada de memberships por instância e reconciliar RPCs públicas ainda baseadas em UUID/telefone. A matriz verifica contato incorreto e isolamento dos itens, mas não certifica esse contrato como autenticação forte de cliente ou todos os cenários de replay/concurrency/adicionais/opções textuais.

Não testados: browser/fluxos comerciais completos, todos os 50 RPCs, todas as combinações de SUPPORT/FINANCE/OWNER/MANAGER, plano/assinatura, semântica completa de transições de status e atualização de dados históricos de produção. Não usar esse resultado como autorização de instalação/deployment.

A fundação A/B foi exercitada e corrigida com Auth real. A próxima ação é reconciliar o snapshot autoritativo atual e ensaiar o cutover legado; não repetir esta matriz sem alterações ou novos riscos relevantes.

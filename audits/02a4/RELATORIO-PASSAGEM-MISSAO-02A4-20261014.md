# RELATÓRIO DE PASSAGEM — MISSÃO 02A.4 — 14/10/2026

**AVANÇAR COM RESTRIÇÕES. F01/F02 abertos; comercial NÃO LIBERADO; Marco01 permanece0/7; Missão02B em planejamento.**

## 1. Resumo executivo

Os P0 anteriores foram reproduzidos sem mudar os candidatos SQL: staff sem grant alterou disponibilidade B e anônimo obteve objeto B por UUID+telefone. A correção específica de disponibilidade passou324 casos novos nas quatro famílias, incluindo os mesmos SELECT/PATCH antes vulneráveis, negações com estado intacto, positivos legítimos e revogação. Isso não certifica todas as superfícies privadas.

A substituição de tracking é preparatória e server-only. Em clone independente, capability válida obteve o resumo mínimo de A; token errado/expirado/revogado e cruzamento A→B foram negados. O gate offline revogou overloads por telefone e negou o mesmo tracking e append, este com loja comprovadamente aberta. Não é ainda fluxo comprador integrado: emissão/HTTP/Origin/domínio/cotas/recuperação e append seguro positivo continuam gates.

Não houve merge/deploy/SQL remoto, alteração de main, dados reais, credencial comercial ou restauração de privilégios inseguros. PRs pequenas e draft. Nenhuma autorização comercial decorre deste relatório.

A rodada final também validou eventos Realtime próprios, negativa B, grant revogado, logout com sessão removida e reconexão com JWT antigo. Uma falha de sessão descoberta no percurso foi corrigida na Master45 e reensaiada. Os resultados são do conjunto medido, sem encerramento automático de F01/F02.

## 2. Fontes, branches e SHAs

Referências iniciais atuais em evidence/references-start.json: Delivery38 b324c1499ff3feda7cb6b56fec3c2ac63bc56052; Delivery39 ad41822e4622e3b14bcb650d7be84126f78b80f6; Delivery40 7fe0e05ca899de3182872921591cbaccd840e58c; Master37 229059e5702bdad3ffa96d3373d878061ab90261; Master38 330520ade7abf297423d5ffeb24d406bc43f88ff; Master40 57e8930d9be66b51f28828fab2057b809dcc65a9. Todas draft; AGENTS.md lidos. O inventário Master é exclusivamente Master: nenhum código de pizzaria foi reintroduzido nele.

Novas PRs:

| PR draft | Branch/base | Candidato ensaiado |
|---|---|---|
| Master41 | security/mission-02a4-availability-20261014; base Master40 | 172abae4bc5dc41348202915e61e4f1fd8918ab2 |
| Master42 | security/mission-02a4-private-tracking-20261014; base Master40 | a642cd20a5fa6d371164a50bf2d3d3e587dedd7c; revisão de digest846e04090ccc29070525887f2ee29017fd019391 |
| Delivery41 | security/mission-02a4-legacy-replay-20261014; base Delivery40 | a99a7d743f9dbed8ece5d8b0880c4b9c543960c3 |
| Master43 | security/mission-02a4-compat-harness-20261014; base Master41 | 4f95a332cda60c4d24e0329b8df93ffec811c9fd (lotes);55dfd757410cf179e1e51744c6f15f224f26f810 (RT/logout marcado) |
| Master45 | security/mission-02a4-live-session-20261014; base Master43 | a189d67f1ea49dd4e2ac14679c9bbf9cbb16e1a0 |
| Master44 | security/mission-02a4-storage-20261014; base Master41 | bbfbfc35d3dfd566fcaa9bb50cce29e6f7ed941a |

Auto-deploy desabilitado em cada branch antes de publicá-la. O CLI GitHub perdeu autenticação durante a missão (401); a conexão GitHub disponível continuou autorizada e foi usada para commits aditivos por API, sem reescrita/force-push. Nenhum segredo foi inspecionado para contornar falha.

## 3. Ambiente e execução

Repositórios públicos confirmados novamente. Runner ubuntu-latest padrão, overlay2, gate28GiB livres/6GiB memória/2CPUs, estimativa26GiB incluindo margem. Valores efetivos e image IDs estão nos logs/summaries. Sem larger runner ou serviços pagos; documentação oficial de cobrança capturada. Runtime bloqueia saída host/containers fora de loopback/bridge, teste TEST-NET-2 recusado. Registries somente na preparação. Seis serviços reais; subir Realtime não certifica seu controle de acesso.

Node22.23.0, CLI2.120.0, PostgreSQL17.11, Auth/REST/Storage/Realtime conforme IDs do summary. SQL por docker exec/psql local com ON_ERROR_STOP=1; sem db push/reset. Fixtures idênticas A/B em O1 e C em O2. Seis identidades Auth reais, staffs AAL2, anônimo com chave anon local. service_role não simula usuário: bootstrap e contrato server-only são explicitamente separados.

Baseline e ensaios: tabela final gerada abaixo a partir dos logs. A primeira tentativa corrigida foi parcial e cancelada, mas executou482 checks (não foi bloqueada antes de todos os testes). A repetição registrou747 checks e resumo antes de cancelamento final; não tratar conclusão do job como PASS integral.

## 4. Antes/depois de F01

| Prova | Antes, SQL anterior inalterado | Depois, candidato disponibilidade |
|---|---|---|
| staff_A/sem grant SELECT disponibilidade/semana B | FAIL/P0, uma linha | PASS, zero linhas, digests intactos |
| staff_none PATCH B enabled=false | FAIL/P0, HTTP200/uma linha, digest alterado | PASS, HTTP200/zero linhas, digest intacto |
| admin_A e staff_A A | controles restritos anteriores | PASS SELECT/UPDATE e INSERT/DELETE filhos |
| famílias privadas | disponibilidade/semana expostas |324 PASS adicionais: quatro famílias, A/B/C e sete atores |
| membership revogada com mesmo JWT | pendência por família | PASS negativas das quatro famílias |
| CRM comercial legítimo staff_none | autorização global distinta | PASS preservado; não dá acesso privado Delivery |

Hash do SQL F01:67011e4dc707703f183e737852021a8b6e3ae26364056e86fe996f2998696264. Política RESTRICTIVE FOR ALL exige helper delivery explícito com OWNER/ADMIN/MANAGER, USING e WITH CHECK. As permissivas organizacionais/globais não conseguem OR fora do cap. Trigger existente impede trocar instance_id. RPC público de catálogo projeta horários deliberadamente; não autoriza consulta privada de tabelas. Não mudamos is_neroxa_staff.

## 5. Antes/depois de F02 e consumidores

Antes: run38627968576/job116071887601 reproduz HTTP200 com objeto B ao anônimo com UUID+telefone. Depois, perfil tracking separado M: SQL private-tracking hash7c1e7c5daf8588cc7eaeb8ad63825f15747c9660ab5391a8899697698e7112dd e gate hashb57a7082d603f1f2e15d9bc53487e47b8adb3188d8b8497332cbc76c06c47689.

O gate testa TODOS os overloads por nome e falha se restar EXECUTE herdado para anon/authenticated. Exige declaração explícita de consumidores migrados/desabilitados e clone descartável. Nunca foi aplicado remotamente. No clone os consumidores antigos foram conscientemente indisponibilizados; nenhum cliente real foi migrado.

O contrato seguro é exclusivo do servidor: hash privado, token32bytes, vínculo pedido/instância, validade24h/revogação, re-registro não reemite token. Projeção mínima exclui nome/telefone/endereço. Os testes backend_gateway usam a identidade real de backend service-only, não um usuário Auth simulado; chamadas diretas Auth/anônimas ao RPC privado foram negadas. **Não confundir com prova do endpoint HTTP comprador.**

Mapa completo em Master42/audits/02a4/CONSUMIDORES-F02.md: Storefront.tsx tracking/fallback em dois pontos; CheckoutPanel.tsx append por telefone; checkout-gateway.server.ts emissão amendment; order-amendment.server.ts caminho seguro existente. Flags de gateway/amendment existentes e proposta de flag tracking não habilitada. Consumidores externos desconhecidos ainda requerem inventário. Perda de token não pode voltar ao telefone; recuperação verificada e histórico continuam pendentes.

O append por telefone foi negado com open=true no banco, removendo a insuficiência423 anterior. **Append por capability com preço autoritativo, idempotência, estado e histórico como fluxo integrado: NOT RUN** nesta missão; candidatos amendment/group não estão nos19 predecessores de M. Não combinar SQLs sem manifesto formal.

## 6. Compatibilidade e reversão

M preserva contratos/assinaturas/instâncias/CRM; não há alteração de jobs ou schema comercial. Digests demonstram aplicação sem mutação dos dados existentes, mas fixtures comerciais não preenchidas não certificam T1/financeiro completo. Transição de pedido/histórico e preço de catálogo próprios passam na matriz exercitada.

Ensaio de erro injetado antes do commit compara dados, ACLs de tabelas e policies; atomicidade restrita não é prova de todos os metadados/funções/ACLs de funções. Não é rollback pós-commit nem restore após perda total. Recuperação admissível conserva contenção e aplica sucessor seguro; nunca StaffPanel ou GRANT por telefone/global. T1 continua gate independente.

## 7. Cobertura e limites

Nenhum TS/TSX comercial alterado: Node --check dos módulos modificados foi executado. Build/TypeScript/lint de aplicação e navegador não foram reexecutados nesta missão; evidência de browser02A3 é histórica explicitamente marcada, não novo PASS. Static checks não certificam RLS. Os casos principais são Auth/REST/SQL/Storage/Realtime reais.

A matriz não é universal para todos os views, funções diretas, roles herdados possíveis, jobs, memberships/autogestão, arquivos públicos legados ou restore. O caso INSERT400/23514 foi executado novamente com predicado semanticamente correto; não se transformou retroativamente FAIL02A3 em PASS. Perfis separados nunca são somados como candidato global certificado.

## 8. Storage — ensaio positivo real

Master44 revisão bbfbfc35d3dfd566fcaa9bb50cce29e6f7ed941a, run38630418859/job116080314404. Resultado **45 casos candidatos PASS**, seis probes Auth PASS e baseline1PASS/3FAIL (52PASS/3FAIL brutos). Não somar com tentativa parcial anterior. A tentativa anterior foi cancelada após327 checks, antes dos casos PNG; esses testes de imagem eram NOT RUN naquela tentativa.

Admin A e staff com grant A: upload, leitura com SHA256 do conteúdo, substituição e exclusão próprios PASS. A→B/C e staff_none/common→B/C: SELECT/INSERT/UPDATE/DELETE negados, incluindo DELETE200 apenas com lista vazia e digest intacto. MIME text/plain415, tamanho1048577bytes413, URL pública anônima400. Bucket privado, allowlistimage/png e limite1MiB comprovados por API. Não houve mudança de owner/roles, ALTER protegido ou remoção de RLS. Policies legítimas de Storage puderam ser criadas pelo executor normal.

Contrato ainda candidato: prefixo instanceUUID/filename.png; imagens públicas atuais precisam de proxy/URL assinada revisada antes de migração. Isso pode suspender imagens antigas; não declarar compatibilidade visual aprovada. Sanitização/decodificação de imagem não testada. Staff_none/common→A, todos os CRUD anon por endpoint privado, revogação de Storage e casos de paths alternativos não cobertos por este módulo permanecem NOT RUN. A prova é do conjunto exercitado, não certificação universal.

## 9. SQLs, pré-condições e integridade

SQLs candidatos versionados em PRs distintas e MANIFEST02A4 por perfil. A aplicação de cada extra tem ensaio de exceção antes de commit e comparação de dados/policies/ACLs de tabelas. O SQL de tracking cria uma tabela privada nova vazia; a primeira versão mantinha cache de snapshots público/Storage e não incluía essa tabela. A revisão846e0409 inclui public/private/Storage, invalida cache após criação e repetiu as18 provas candidatas: **18PASS**, nenhum FAIL candidato, digests privados das negativas intactos. Registro legítimo muda a tabela privada e não deve ser chamado de operação globalmente sem efeitos.

A aplicação só compara dados das relações existentes no snapshot; criação de metadados novos é intencional, não prova de igualdade de todo o catálogo. ACLs de funções e todos os metadados não fazem parte do fingerprint completo. Rollback transacional aprovado no recorte observado; rollback seguro pós-commit e T1 após perda total continuam NOT RUN.

## 10. Perfil legado L — evolução comprovada

1. Delivery7388038: replay literal das31 migrations PASS, bodies validados; executor postgres/superuser off, owner storage.objects=supabase_storage_admin, RLS=true. CREATE POLICY permitido sem ALTER protegido; aplicação da quarentena e atomicidade PASS restritos. Checkout mínimo retornou500/55000 e estado intacto. Dois P0 residuais pós-quarentena: drivers e loyalty_accounts legíveis por adminA/O1 em registros de linhagemB; o schema não tem instância nativa. 259PASS/5FAIL brutos; aprovação interrompida.
2. Deliverya99a7d7: além de v_crust, snapshot opcional v_size agora usa escalares tipados price/name; as duas tabelas residuais entraram na revogação de ACLs de tabela/coluna. Consumidores de motoristas/fidelidade ficam conscientemente suspensos no perfil de quarentena. Sem escalada de owner ou role, sem retorno de grants.
3. Run38647381181/job116137496298: replay literal PASS, checkout via Auth adminA PASS (HTTP200/uma ordem), financeiro PASS (um item, subtotal30, total30, taxa0, linha30). **254 casos candidatos PASS**, seis probes Auth PASS, baseline3PASS/1FAIL. O único FAIL bruto é a exposição antiga adminA→B antes da quarentena; depois drivers/loyalty e demais negativas exercitadas foram negados com digests intactos. Job success significa este perfil parcial, não produto homologado.

Hash do SQL de quarentena final:6cae854a1cffaa0c42a3ae227d29d24a2355662c39598fea6f6ce31c1ee619bf. Manifesto L fixa sourcea99a7d7 e todos os originais em ordem. O UPDATE histórico de imagem rodou sobre tabelas vazias antes das fixtures. Não usar este reparo histórico fresh como migration incremental de banco instalado.

Pizzas com tamanho/borda/meia-pizza/complementos, todos os consumidores históricos, functions/views externas à allowlist e URL nativa pública de bucket legado não foram integralmente homologados. Policies de Storage não garantem revogar URLs de bucket public; falta ensaio específico/precondição de bucket e substituto de imagens públicas no perfil L. Não promovê-lo sem esses gates. Realtime L é NOT RUN intencional após quarentena (acesso a pedidos foi suspenso); ausência de principal autorizado não é controle positivo válido.

## 11. Complementos e regressão Master em lotes

SQL addon hash:a066a7c92c783f9171a2ea7fc78248d835e06c3eb855148094bce4ed029aff49. Nova permissiva exige helper explicitamente escopado e continua limitada pelos caps RESTRICTIVE; resolve exclusão preexistente do staff legítimo sem grant organizacional/global.

Run38647381181, SHA4f95a33:

| Job/perfil | Resultado bruto | Resultado candidato e limite |
|---|---|---|
|116137496082 M admins |219PASS/4FAIL |212PASS/1FAIL; único FAIL candidato: own.txt Storage403, perfil sem SQL Storage |
|116137496353 M staff/common/anon |268PASS/4FAIL |261PASS/1FAIL; mesmo own.txt Storage403 |
|116137496339 complementos/RT |24PASS/4FAIL |17PASS complementos; join RT FAIL InitializingProjectConnection |

Os três FAIL de baseline Master repetem problemas anteriores ao scoped02A2 e não são regressões introduzidas. Não somar os lotes: repetem RPCs/controles auxiliares; os loops principais particionam atores preservando os mesmos asserts. Foram executados novamente os casos de categoria/instância adulterada, núcleo pedidos/itens/histórico, SELECT herdado, revogação REST, CRM global e PATCH B; nenhum P0 novo nesses casos. O conjunto não inclui o gate F02, portanto não elimina o caminho legado por telefone desse perfil. Storage tem perfil próprio validado separadamente, não corrigido por um deny-all.

Complementos17PASS: leitura própria de admin/staff e negativas B/C, INSERT/UPDATE/DELETE próprio staff, WITH CHECK para grupoB e revogação com mesmo JWT. Administração de link produto-grupo, políticas de todos os papéis e casos adicionais ainda não têm cobertura exaustiva. Tentativa anterior de M foi cancelada com533 checks, sem resumo final; preservada como parcial, nunca convertida em PASS integral.

## 12. Regressões, compatibilidade e gates remanescentes

- O defeito de complementos existia no baseline;17 positivos/negativos passaram após o allow escopado. Não foi criado pela contenção do painel.
- own.txt Storage403 permanece FAIL nos perfis M sem o candidato Storage. O perfil PNG separado passou45 casos e exige novo contrato de imagens; não inferir que o candidato de complementos resolveu Storage.
- Checkout L inicialmente tinha falha de compilação por v_crust, depois falha55000 em snapshot opcional. A revisão final teve prova financeira30/30/0/30. Não certifica sabores/tamanhos/bordas/misto/adicionais/cuponagem ou retry concorrente.
- Quarentena L interrompe deliberadamente catálogo/checkout/tracking/admin antigos. Até haver substitutos e todos os consumidores identificados, funcionalidade fica indisponível para piloto. O sucesso de negações não equivale a serviço comercial funcional.
- Perfis M de disponibilidade/complementos não incluem o gate de telefone; esse caminho inseguro conhecido só foi negado no perfil F02. Não existe um candidato combinado homologado.
- Contratos/assinaturas/jobs não foram alterados. CRM legítimo passou nos casos exercitados; fixtures comerciais vazias não provam recuperação de dados reais ou integridade de todos os cenários financeiros.
- O firewall host restringe também comunicação externa do supervisor do runner. Cancelamentos durante matrizes longas são compatíveis com perda de heartbeat, mas a causa exata não foi comprovada pelos logs disponíveis. Particionamento permitiu concluir lotes sem relaxar o isolamento. Para ensaios longos/T1, isolar a rede do processo de teste sem bloquear o supervisor requer revisão própria; nunca liberar egress comercial para contornar o problema.
- Dependências principais e actions fixadas; CLI em versão fixa com resolução transitiva ainda não congelada em lock próprio. IDs das seis imagens executadas coincidiram nos perfis comparados; validar drift antes de nova rodada.

## 13. Falhas e riscos

| Severidade | Achado | Estado |
|---|---|---|
|P0 | disponibilidade/semana B e PATCH sem grant | reproduzido no anterior; negado no clone F01 corrigido |
|P0 | tracking por UUID+telefone | reproduzido; negado no clone com gate F02; endpoint comprador ainda não integrado |
|P0 | drivers/loyalty residuais após quarentena inicial | reproduzidos no7388038; negados no clonea99a7d7 |
|P1 | logout com JWT antigo na versão55dfd75 | corrigido no clone45 com controles reais; outros canais/papéis ainda não exaustivos |
|P1 | HTTP comprador seguro, recuperação de token e append capability positivo/idempotência/preço/status | NOT RUN; F02 aberta |
|P1 | migração de imagens públicas, outros caminhos/roles/views/RPCs não exaustivos e legado sem instância nativa | bloqueiam piloto |
|P1 | restore T1 e rollback seguro pós-commit, dados comerciais preenchidos | NOT RUN; não substituir por atomicidade |
|P2 | cancelamentos/indisponibilidade de logs, limites operacionais do harness e lock transitivo CLI | discriminados; lotes/reprodução versionados |
|P3 | ajustes comerciais/UX fora da missão | não iniciados; nenhum bloqueio crítico rebaixado |

## 14. Próximo ciclo mínimo proposto

1. Formalizar um único manifesto candidato integrado, sem fundir cegamente perfis M e L; repetir a mesma matriz com cobertura restante e contrato de instância canônico.
2. Integrar tracking HTTP no servidor Delivery: contexto domínio/Origin confiável -> instância, cota antes da chamada, token opaco fora de URLs/logs, emissão única no checkout e política explícita de recuperação/perda/expiração. Manter flag desligada até validação. Migrar/remover os dois fallbacks Storefront e append CheckoutPanel.
3. Ensaiar o caminho de append capability existente com manifesto próprio, loja aberta, preço autoritativo, request_key idempotente, status e histórico. Não misturar seus candidatos SQL adicionais sem preflight e hashes.
4. Completar os demais papéis/canais/TTL Realtime, preservando os controles reais aprovados na Master45; completar Storage/catálogo público e funções/views/roles remanescentes.
5. Ensaiar recuperação T1 e permissões finais em dados fictícios financeiros preenchidos, mantendo painel suspenso e grants inseguros indisponíveis. Revisão da Coordenação e gates técnicos não autorizam rollout nesta missão.

## 15. Realtime — evolução e falha confirmada de sessão

Readiness do servidor foi efetivamente observada: duas mensagens `system/ok/Subscribed to PostgreSQL`, slots ativos e publication UPDATE=true. Esperar essa confirmação e a entrega real corrigiu a limitação do harness de apenas aguardar ACK/8s. Isso não transforma nenhum FAIL antigo em PASS e não prova causa única de todo timeout histórico.

No SHA55dfd757410cf179e1e51744c6f15f224f26f810/run38649645182/job116144980700: evento próprioA PASS (um); evento privadoB PASS (zero com pipeline positivo); revogação do membership com mesmo JWT PASS (zero). Auth signOut retornou sucesso e o verificador normal confirmou remoção de auth.sessions. Mesmo assim chegou o evento com marcador `Synthetic event after Auth logout`, produzido depois da barreira Auth. **FAIL de revogação de sessão**, não confundido com evento em voo nem deduzido só de contador. Token mantido deliberadamente em canal nativo, sem auto-disconnect da UI.

É acesso ao próprioA após logout, não vazamento entre lojas confirmado; classificado P1 bloqueante de sessão no candidato55dfd75. JWT permanece criptograficamente válido até expiração no modelo Supabase; o contrato privado exige consulta de sessão ativa, além de grant. Não rotacionar segredo global nem alterar Auth comercial para resolver esse recorte.

## 16. Sucessor de sessão ativa — Master45

PR draft Master45, branch security/mission-02a4-live-session-20261014, base Master43 SHA55dfd757410cf179e1e51744c6f15f224f26f810. Candidato a189d67f1ea49dd4e2ac14679c9bbf9cbb16e1a0. Helper mantém assinatura/owner/ACL/roles/MFA e adiciona lookup Auth session_id+user_id; nenhuma DDL em Auth, is_neroxa_staff ou CRM. JWT sem sessão passa a ser negado; compatibilidade/relogin de consumidores antigos é gate, sem fallback inseguro.

Manifesto formal separa M core (disponibilidade+addons+sessão) e M Storage (mesma cadeia+Storage). L e F02 permanecem independentes. Novo ensaio de atomicidade inclui prosrc/ACL de funções, além dos fingerprints anteriores. Não restaurar helper inseguro como recuperação operacional.

### Resultado da Master45 — execução encerrada

Run[38650424558](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38650424558), SHAa189d67f1ea49dd4e2ac14679c9bbf9cbb16e1a0; SQL sessão SHA256bac08110f829ebb518b491843319ddc80cbbb749ed4e9a28c9c5ac275170120e.

|Job|Escopo|Resultado bruto|Candidato|
|---|---|---|---|
|116147551800|quatro famílias de horários|331PASS/3FAIL baseline|324PASS|
|116147551927|complementos/sessão/Realtime|34PASS/3FAIL baseline|27PASS, inclui17 complementos|
|116147551762|Storage PNG privado com sessão ativa|52PASS/3FAIL baseline|45PASS|
|116147551885|núcleo admins|219PASS/4FAIL|212PASS/1FAIL own.txt sem candidato Storage nesse perfil|
|116147551564|núcleo staff/common/anon|268PASS/4FAIL|261PASS/1FAIL own.txt sem candidato Storage nesse perfil|

Não somar lotes/runs: controles auxiliares se repetem. Não esconder os FAIL de baseline nem o own.txt403 nos perfis sem Storage. No perfil com Storage o contrato PNG próprio tem prova positiva real, incluindo staff autorizado. Todos os ambientes foram limpos (CLEANUP=PASS).

Realtime: A recebeu um evento real; B zero com controle positivo; revogação do grant manteve zero. Auth API logout=sucesso, sessão real ausente; REST com o mesmo JWT antigo negado com estado intacto e canal mantido recebeu zero alterações novas. Reconexão: A com JWT antigo recebeu zero; B com sessão viva recebeu um. Verificação adicional dos frames por tópico (`verify-realtime-proof.py`) conferiu zero frames PostgreSQL no tópicoA e um no tópicoB: **PASS**, evitando confundir identidades na mesma conexão. Não usar apenas ACK nem ausência de eventos como evidência.

A regressão preservou os mesmos casos privados de A/B/C. Não cobre cada canal, papel, formato de token, TTL/expiração ou consumidor externo. Não prova logout global do Master: somente o contrato privado Delivery do helper foi alterado. Clientes antigos sem session_id exigem compatibilidade/relogin antes de qualquer implantação.

## 17. Matriz consolidada e funcionalidades indisponíveis

|Família/identidade|Resultado efetivamente demonstrado|Limite|
|---|---|---|
|Horários4, adminsA/B/C próprios|ALLOW; staff_A somenteA; staff_none/common/anon A/B/C DENY|324casos; demais papéis não exaustivos|
|Núcleo pedidos/itens/histórico/catálogo/settings/zonas|casos de escopo A/B/C, adulteração, RPCs, categoria cruzada, role herdado e revogação PASS|CRUD financeiro direto permanece RPC-only; nem todo endpoint/view foi ensaiado|
|Complementos|17PASS próprios/foreign/cross-parent/revogação|links produto-grupo e demais papéis pendentes|
|Tracking capability|18PASS contrato servidor; telefone DENY e append telefone DENY com loja aberta|HTTP comprador/Origin/cotas/emissão/perda de token NOT RUN|
|Storage|45PASS próprio PNG e negativas B/C, MIME/limite/URL pública|demais paths, public assets e cenários/papéis remanescentes NOT RUN|
|Realtime45|positivoA, negativoB, grant, logout, REST antigo e reconexão PASS|C/outros papéis/canais/expiração não exaustivos|
|LegadoL|replay/checkout/financeiro e254negativas pós-quarentena PASS|operações suspensas; schema sem loja nativa, funções/URLs restantes não certificadas|
|Atomicidade|dados/policies/ACLs; Master45 acrescenta prosrc/ACL funções|não é restoreT1 nem rollback pós-commit|
|Node sintaxe|PASS comandos registrados|sem prova RLS estática; build/TS/lint/browser NOT RUN nesta rodada sem alteraçõesTS|

Indisponíveis para piloto: painel legado; operações legadas quarentenadas; comprador sem token/recuperação verificada; append por capability ainda sem ensaio integrado; entrega pública segura das imagens novas; candidato único integrado/homologado; recuperaçãoT1 preenchida. A existência de PRs draft não libera nenhuma dessas funções.

## 18. Retorno A–H e decisão da Coordenação

**A — Sim no recorte ensaiado.** Os mesmos SELECT/PATCH B deixaram de reproduzir; PATCH retornou zero linhas e digest intacto, com positivos próprios aprovados.324 casos foram repetidos após a correção de sessão.

**B — Sim no clone com gate F02 e no contrato SQL servidor.** UUID+telefone negado; capability válida/errada/expirada/revogada/cruzada efetivamente exercitada. O endpoint comprador e seus gates HTTP ainda são NOT RUN; F02 não encerrado.

**C — Não universalmente.** Staff sem grant foi negado nas famílias e caminhos privados executados. Views/RPCs/roles/canais e superfícies restantes impedem afirmar cobertura total.

**D — Aprovação parcial, não integral.** L passou replay literal, checkout mínimo e negativas pós-quarentena separadamente; M tem os recortes comprovados e FAIL funcionais discriminados nos perfis sem Storage. Não há candidato completo M+F02+consumidores homologado nem compatibilidade operacional L integral.

**E — Sim nos casos registrados.** Storage45, complementos17 e controles reais Realtime/ revogação/logout/reconexão passaram na revisão45. Não estender esse PASS às combinações não executadas.

**F — Suspensões e lacunas permanecem.** Quarentena desabilita catálogo/checkout/admin antigos; imagens públicas e tokens antigos exigem migração. Checkout mínimoL foi corrigido; CRM e histórico passaram nos casos medidos. Contratos/assinaturas preenchidos e recuperaçãoT1 não foram ensaiados; não declarar ausência global de regressões.

**G — F01/F02 e Marco01 continuam abertos.** Faltam integração comprador por capability sem fallback por telefone, append seguro positivo/preço/idempotência/status, todas as superfícies privadas/consumidores/roles relevantes, imagens públicas, compatibilidade de sessões/SSO e recuperaçãoT1/rollback pós-commit. Não promover os perfis isoladamente como produto homologado.

**H — Coordenação deve manter o bloqueio comercial e priorizar integração/cobertura final.** Revisar os seis drafts, escolher o contrato canônico de instância e a política de emissão/recuperação/expiração de capability, aprovar plano de migração de consumidores/imagens e programar ensaio integrado maisT1. Próximo código recomendado: gateway tracking comprador e remoção coordenada dos fallbacks, após revisão dos candidatos SQL validados em clones.

**Parecer: AVANÇAR COM RESTRIÇÕES na engenharia. Comercial NÃO LIBERADO; Marco01 0/7; Missão02B somente planejamento.**

## 19. Arquivos, comandos e evidências

Alterados: SQLs/manifests sob audits/02a4 (e candidato/migration histórica somente na Delivery41); workflow de branch isolada; harness Node/Realtime e módulos específicos; vercel.json para impedir deploy da respectiva branch; documentos/evidências. Nenhum TS/TSX comercial, main ou PR original foi alterado. Função global is_neroxa_staff preservada.

Comandos reais: npm ci --ignore-scripts --no-audit --no-fund; CLI2.120 init/start/status/stop --no-backup em workdir novo; build_schema.py +19 predecessoresM; replay literal31 fontesL; docker exec/psql -X -v ON_ERROR_STOP=1; node tools/mission-02a3/run.mjs; Node --check e Python extração/verificação. Nenhum db push/reset/SQL remoto. Workflow/SHAs fixados são a receita exata; usar REPRODUCAO.md.

Logs e snapshots completos no pacote. Summaries/CSVs/antes-depois em evidence; `extract-evidence.py` regenera resultados dos logs. O formato MISSION02A3_SUMMARY/mission02A.3 é herdado do harness reutilizado: os commits, manifests e runs listados identificam as execuções02A.4. Não são relatórios antigos reciclados como aprovação atual. Hashes de todos os arquivos e fonte dos SQLs ficam no manifesto do pacote.

As conexões WebSocket com JWT antigo podem ser aceitas criptograficamente; a prova45 é de negação dos dados privados, não de fechamento físico do socket ou invalidação global da assinatura JWT. Quotas de conexão e demais modalidades continuam pendentes.

### URLs e SHAs das execuções

|Run|SHA|Tentativa|Estado CI|
|---|---|---|---|
|[38627968576](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38627968576)|284f05a0d6b39e737888365f184c9e0b504ea6a1|1|completed/failure|
|[38628192443](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38628192443)|172abae4bc5dc41348202915e61e4f1fd8918ab2|2|completed/cancelled|
|[38628979793](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38628979793)|a642cd20a5fa6d371164a50bf2d3d3e587dedd7c|1|completed/success|
|[38629775680](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38629775680)|846e04090ccc29070525887f2ee29017fd019391|1|completed/success|
|[38629490815](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38629490815)|59f5787eebad27800349a46d7783bfc21ccd46b1|2|completed/failure|
|[38647381181](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38647381181)|4f95a332cda60c4d24e0329b8df93ffec811c9fd|1|completed/failure|
|[38630418859](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38630418859)|bbfbfc35d3dfd566fcaa9bb50cce29e6f7ed941a|1|completed/success|
|[38647994280](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38647994280)|8e9ea1bf328a40868e470ea6a87d090cdcaba5a7|1|completed/failure|
|[38648588792](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38648588792)|c3e3d1137203b9f6b65467745220559be1a15ffc|1|completed/failure|
|[38649335058](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38649335058)|77c318f4f467d2c3b7621ceeba411a6fa66d3108|1|completed/failure|
|[38649645182](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38649645182)|55dfd757410cf179e1e51744c6f15f224f26f810|1|completed/failure|
|[38650424558](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38650424558)|a189d67f1ea49dd4e2ac14679c9bbf9cbb16e1a0|1|completed/failure|

CI success/failure/cancelled não substitui o veredito por fase/caso. Os testes de baseline inseguros e falhas funcionais discriminadas permanecem nos resultados brutos.

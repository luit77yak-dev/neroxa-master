# RELATÓRIO DE PASSAGEM — MISSÃO 02A.3 — 14/10/2026

**F01 permanece aberta. Comercial NÃO LIBERADO. Missão 02B somente em planejamento.**

## 1. Resumo executivo

O impedimento de ambiente foi superado: executamos PostgreSQL, Auth, REST, Storage e Realtime reais em VMs descartáveis GitHub-hosted padrão de repositório público. Foram criadas identidades reais pelo Auth local, incluindo MFA de staff; service_role foi usado somente para bootstrap de usuários/bucket/arquivos, nunca para simular atores.

**O candidato Master #38 foi reprovado por P0 confirmado.** Após aplicar seu SQL exato, staff com grant somente A e staff sem grant leram disponibilidade/horários semanais de B. Em ensaio posterior, o staff sem grant fez PATCH em B e alterou `enabled`. Houve HTTP200, uma linha retornada e mudança de digest somente na tabela de disponibilidade; o harness interrompeu novas escritas e a stack foi descartada. Não se trata de uma inferência de análise estática ou resposta vazia.

Há resultados positivos restritos no núcleo de pedidos/catálogo, mas não isolamento universal. O SQL legado Delivery #40 também não passou: replay normal encontra função com variável não declarada; em reconstrução estrutural identificada separadamente, a quarentena falha por ownership de `storage.objects` antes de commit.

Um ensaio focado adicional confirmou **P0 de leitura via RPC legada**: anônimo com UUID e telefone obteve objeto de pedido B por `get_public_order_status`, sem capability privada. A tentativa de append retornou423/PT423 por loja fechada, com todos os digests intactos; não houve mutação financeira comprovada nem validação da autorização com loja aberta.

No navegador, houve hidratação React real, ausência de StaffPanel na árvore montada e navegação funcional ao login de `/admin/pedidos`. Esse PASS não certifica Auth/RLS.

## 2. Runner, recursos, rede e custo

| Item | Evidência executada |
|---|---|
| Repositórios públicos | GitHub API: ambos `isPrivate=false`, `visibility=PUBLIC`; checagem repetida dentro do workflow |
| Elegibilidade sem nova despesa | Documentação oficial: uso de runner hospedado **padrão** é gratuito em repositório público; não usamos larger runner, cache persistente ou upload de artifacts |
| Runner utilizado | `ubuntu-latest`, GitHub-hosted, quatro CPUs, driver `overlay2`; cada perfil em job/VM próprio |
| Recursos do ensaio final Master | 91.588.243.456 bytes livres e 15.469.584.384 bytes de memória disponível; gate de 28 GiB/6 GiB/duas CPUs aprovado |
| Estimativa de pico | imagens/download/extração 8 GiB + serviços/volumes 5 + dependências/logs 3 + margem 10; gate 28 GiB adiciona folga. Não é medição contínua do pico real |
| Outros ensaios | preflight chegou a ~111 GB livres. O runner local anterior de 32 GB/vfs não foi reutilizado para pulls |
| Runtime sem saída comercial | host limitado a loopback/bridge exata do projeto, encaminhamento externo dos containers bloqueado, IPv6 restrito; controle negativo TEST-NET-2 recusado com código111 |
| Setup | registries e GitHub acessíveis antes do bloqueio; runtime dos testes bloqueado depois. Configuração Supabase unlinked, sem project-ref/migrations remotas, dados fictícios |
| Descarte | `supabase stop --no-backup` apenas do projeto; rede removida e ausência de containers checada no daemon real. Logs registram CLEANUP=PASS |

Fonte de cobrança consultada: https://docs.github.com/en/billing/concepts/product-billing/github-actions (captura no pacote). API de configuração administrativa de Actions retornou403; isso não comprova configuração administrativa, mas não impediu a execução pública padrão cuja elegibilidade foi verificada. Nenhum recurso pago foi solicitado ou contratado. Screenshots/trace e logs completos são entregues localmente, sem serviço de hospedagem novo.

Versões efetivas: Node22.23.0, CLI2.120.0, PostgreSQL17.11 (`supabase/postgres:17.11.0.004`), GoTrue2.197.0, PostgREST16.4, Storage1.79.36, Realtime2.140.10 e Kong2.8.1. IDs imutáveis das imagens executadas estão no summary final. A reprodução deve verificar esses IDs e interromper em caso de drift de imagem/tag.

## 3. Repositórios, SHAs e perfis

| Referência | Branch | SHA conferido |
|---|---|---|
| Delivery #38, draft | security/delivery-02a-panel-gate-20261014 | b324c1499ff3feda7cb6b56fec3c2ac63bc56052 |
| Delivery #39, draft, navegador | security/mission-02a2-validation-20261014 | ad41822e4622e3b14bcb650d7be84126f78b80f6 |
| Delivery #40, draft, quarentena | security/mission-02a2-legacy-quarantine-20261014 | 7fe0e05ca899de3182872921591cbaccd840e58c |
| Master #37, draft | audit/store-isolation-candidate-20261011 | 229059e5702bdad3ffa96d3373d878061ab90261 |
| Master #38, draft, autorização | security/mission-02a2-scoped-admin-20261014 | 330520ade7abf297423d5ffeb24d406bc43f88ff |

Repositórios: `luit77yak-dev/pizza-perfect-plate` e `luit77yak-dev/neroxa-master`. AGENTS.md de ambos foi lido. Nenhuma main ou PR SQL existente foi modificada; não houve merge, deploy, SQL remoto, dados reais ou reativação do StaffPanel.

- **M:** catálogo histórico estrutural completo de 09/10, sem linhas de clientes, reconstruído com Auth real; 19 predecessores na ordem do manifesto 02A.2, hashes verificados. Candidato aplicado: `scoped-order-access.candidate.sql`, SHA256 `648fcca5bdac67ba3879c0804189b204a53fc4f3b136646407b659ca5a62f23c`.
- **L:** 31 migrations do Delivery fixadas por hash, em outro job. Derivado de replay omite somente UPDATE histórico de URL de imagem, para não introduzir referências/dados de cliente. Seeds de permissões sistêmicas são mantidos. Original/derivado/ordem/hashes estão em `legacy-derived-manifest.json`.
- O perfil L não possui `instance_id` de pizzaria: A/B são linhagem explícita dos registros fictícios sob O1, sem adicionar coluna/tabela para fingir isolamento. Não é equivalente ao modelo nativo de instâncias de M e não certifica multiloja.
- Replay normal L: **FAIL** por `v_crust` não declarado. Reconstrução posterior adia validação de corpos, mantendo os corpos originais; não é replay normal aprovado. O defeito de checkout também é observado ao invocar a função.

## 4. Execuções e comandos

| Execução | SHA do harness / escopo | Resultado |
|---|---|---|
| [38618392768](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38618392768) | 95d10e9, preparação | falha de rede interna/porta publicada antes do SQL; restante cancelado |
| [38619093561](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38619093561) | 673dc84, matriz inicial | P0 de leitura observado; execução Master terminou cancelada; não somar como execução completa |
| [38619478040](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38619478040) | abbf4d7, matriz | Master: 391 PASS/8 FAIL brutos; quatro exposições de horários/disponibilidade, falhas positivas e timeout Realtime |
| [38620164304](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38620164304) | de35b49 | L reconstruído: aplicação da quarentena FAIL ownership de Storage; M reafirma bloqueios |
| [38620891096](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38620891096) | f845c82 | amplia arquivos, herança de papel, view e revogação REST; Master 407 PASS/9 FAIL brutos |
| [38621152498](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38621152498) | b7f3e20, transporte nativo RT | joins ACK ok, controle próprio A sem evento; cancelada antes de conclusão/revogação/logout. Sem aprovação RT |
| [38621636857](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38621636857) | ca9310e5a28d32e1271d91af74700f6c91741657, mutação dirigida | **407 PASS/12 FAIL brutos**, incluindo P0 de UPDATE; cleanup concluído |

| [38623751297](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38623751297) | d04dcf9ab23c15e41039658d74df2ddd7528ea34, RPCs diretas | 9 PASS/5 FAIL brutos; candidato 2 PASS/2 FAIL; tracking anônimo exposto, append423 sem mutação; cleanup PASS |

**Não somar os runs:** contêm reexecuções e refinamentos do harness sobre os mesmos candidatos. O run final da matriz tem seis probes Auth PASS; baseline um PASS/três FAIL; candidato 400 PASS/nove FAIL. Isso não é aprovação de produto nem 407 recursos aprovados.

Comandos efetivamente usados: `npm ci --ignore-scripts --no-audit --no-fund`; CLI2.120.0 `init/start/status/stop --no-backup`; reconstrução `python3 tools/ab-auth/build_schema.py`; SQL exclusivamente por `docker exec ... psql -v ON_ERROR_STOP=1`; `node tools/mission-02a3/run.mjs`; chamadas SDK/HTTP usando JWT de cada usuário. Não houve db push/reset. Instalação de dependências e preparação ocorreram antes da restrição de egress.

Arquivos executáveis na branch de evidências: `.github/workflows/mission-02a3-isolation.yml`, `tools/mission-02a3/{preflight.py,network.sh,run.mjs,native-realtime.mjs,legacy-derived.sql,legacy-derived-manifest.json}`. O workflow final tem modo de diagnóstico; usar o **SHA/run fixado** para reproduzir cada escopo, sem misturar resultados.

## 5. Matriz real A/B/C

O1 contém instâncias A e B; O2 contém C no perfil M. Há admin_A/B/C, staff_A (grant explícito ADMIN apenas A + AAL2), staff_none (plataforma ADMIN/AAL2, sem grant), common (sem membership) e anon. Seis logins Auth reais passaram no probe SQL como authenticated, UID correto e superuser off. Não há JWT autenticado fabricado nem service_role como usuário.

| Recurso / caminho | Resultado executado |
|---|---|
| Pedidos A/B/C via tabela e listagem admin | casos próprios e recusas fora de escopo passaram no conjunto exercitado; staff_none negado após candidato |
| Itens/histórico de B | admin_A, staff_A, staff_none/common/anon negados, com conteúdo/digests conferidos nos casos executados |
| Categorias/produtos/settings/zonas | consultas e negativas UPDATE/DELETE por loja no conjunto; preço próprio e transição de status próprios funcionaram |
| Complementos | admin de loja funciona; staff_A autorizado recebe vazio em A. A falha também existe no baseline, não é regressão nova comprovada do SQL |
| Categoria cruzada / adulteração de instance_id | rejeitados sem efeitos; INSERT estrangeiro retornou400/23514 e não mudou dados |
| Herança de privilégio | papel de teste NOLOGIN/NOBYPASSRLS com SELECT herdado não abriu pedidos B para admin_A |
| Revogação REST | membership explícito A desativado: o mesmo JWT deixou de ler A; controle PASS. Reativação apenas do grant legítimo A para continuar fixtures |
| Clientes/contatos | PII fictícia de compradores em pedidos sob escopo; contato CRM global permitido para staff comercial sem grant de loja, sem confundir com PII Delivery; common negado na view CRM |
| Disponibilidade/horários semanais | **FAIL/P0:** staff_A e staff_none leram B. **FAIL/P0:** staff_none alterou B |
| Storage | três arquivos fictícios criados no bootstrap; SELECT/INSERT/UPDATE/DELETE estrangeiros exercitados e negados no perfil M; upload próprio403 FAIL. Sem política operacional própria validada, não declarar isolamento funcional de Storage aprovado |
| Realtime | SDK timeout; transporte nativo teve ACK de join mas nenhum evento autorizado A. Negativa B sem evento reclassificada **BLOCKED**, pois faltou controle positivo. Revogação e logout de canal não foram concluídos |
| Quarentena L | **FAIL de aplicação** antes de commit; testes pós-quarentena NOT RUN. Baseline organizacional permite ler registro marcado B sob O1; não inventamos instância ausente no schema |

As matrizes CSV positivas e negativas contêm os casos reais do run final. Hashes/contagens de **todas as tabelas de aplicação e buckets/objects** antes/depois permanecem nos JSON/logs, incluindo efeitos indiretos. HTTP200 vazio só foi aceito com verificação de conteúdo e estado. O controle positivo de Storage falhou, então negar tudo não foi tratado como solução funcional.

Um teste exigia especificamente403 para INSERT estrangeiro. O banco retornou400/23514 com estado intacto: é **negação real pela integridade**, embora o veredito bruto seja FAIL por expectativa excessivamente estrita. Não é P0 nem acesso bem-sucedido. A correção de expectativa do harness não transforma retroativamente o raw FAIL em execução aprovada.

## 6. P0 reproduzível — escrita em B sem grant

Fonte: run38621636857/job116050361678, candidato M com hash acima, usuário **staff_none** Auth/AAL2, sem membership de instância.

```http
PATCH /rest/v1/neroxa_storefront_availability?instance_id=eq.91000000-0000-4000-8000-000000000200
Content-Type: application/json

{"enabled":false}
```

Esperado: negar/zero alteração. Observado: HTTP200, uma linha, mudança do digest em `public.neroxa_storefront_availability`; nenhuma outra tabela da aplicação/Storage mudou nesse pedido. A fixture criou as três disponibilidades com enabled=true. As novas escritas foram interrompidas; não houve aprovação, promoção ou alteração de serviço remoto.

`evidence/P0-confirmado.json` contém os digests anterior/posterior, ID de B, hash do candidato e origem. A causa observada combina regras antigas de disponibilidade com autorização global de plataforma; o candidato limita outras tabelas, mas não limita essa família.

### RPCs diretas — ensaio adicional separado

Run38623751297/job116057550466, mesmo candidato M exato em novo clone. Admin A obteve detalhe próprio (PASS); staff sem grant recebeu null ao pedir detalhe B (PASS). Anônimo chamou `get_public_order_status` com `p_order_id=91000000-0000-4000-8000-000000000203` e `p_customer_phone=00000000001`: HTTP200 com objeto identificado por id/order_id (**FAIL/P0**, estado inalterado). O log não persiste corpo completo; o classificador de exposição verifica objeto identificado, e o corpo SQL versionado documenta projeção de cliente/endereço/itens/valores. Pré-condição do abuso: conhecer UUID e telefone; não alegamos enumeração irrestrita nem leitura sem esses valores.

`append_public_order_items_with_payment`, anônimo, mesmo pedido/telefone, produto B e quantity1: HTTP423/PT423, estado intacto. Raw FAIL por exigir401/403. A recusa operacional foi executada; autorização com loja aberta é **BLOCKED por fixture de horário**, não P0 financeiro confirmado. Não reinterpretar erro operacional como controle de autorização aprovado. O ensaio focado contém ainda seis probes Auth PASS e baseline 1 PASS/3 FAIL. Não somar ao run da matriz. Evidências em run8-master-{checks,summary}.json e log.

## 7. SQL somente em clones e integridade

**Master:** SQL exato comprometido no clone após pré-condições/hashes. A aplicação preservou os digests de dados. O ensaio de erro injetado antes do commit provou atomicidade de dados e ACLs de tabelas (PASS restrito). Não é teste de todo metadado nem rollback operacional seguro completo. Contratos/assinaturas tinham zero linhas: integridade comercial de cenários preenchidos é NOT RUN, não presumida.

**Legado:** replay literal FAIL; reconstrução com corpos adiados explicitamente diferenciada. A tentativa de quarentena falhou com `must be owner of table objects` em ALTER de Storage. A transação não chegou ao commit; não afirmar que as revogações ficaram instaladas. Não elevamos privilégios, não alteramos ownership nem removemos a proteção nativa para forçar PASS.

O descarte das VMs encerrou os ensaios. Nenhum GRANT inseguro foi emitido como recuperação de serviço; nenhuma UI foi reaberta. O retorno atômico de uma transação abortada no clone é ensaio de atomicidade do baseline não aprovado, não estratégia de retorno operacional a permissões antigas.

## 8. Regressões e falhas funcionais

- Complementos para staff com grant A falham no baseline e após M: **falha funcional preexistente/compatibilidade de políticas**, não regressão nova demonstrada.
- Storage próprio não é autorizado nesse perfil; políticas Storage completas não estavam no catálogo público histórico. Não atribuir causalidade ao novo SQL sem baseline operacional correspondente.
- Replay L não permite instalação normal de checkout pela variável v_crust; reconstruir função sem validar corpo não resolve o defeito.
- Quarentena não aplicável com papel do executor testado; tampouco há substituto completo validado para catálogo/configuração/imagens/notificações legadas.
- INSERT400 foi erro de expectativa do harness, sem efeito indevido. Não confundir com autorização indevida.
- O plano de quarentena também prevê indisponibilidades legítimas intencionais; não testar sua aplicação completa significa que os impactos funcionais finais permanecem NOT RUN.

## 9. Navegador e hidratação

**PASS executado**, código Delivery #39 ad41822. Playwright-core1.58.2, Chromium154.0.8037.57, app Node22.23.0; controller Node24.19.0. `.env` comercial retirado temporariamente, modo homologation com sink loopback e chaves sintéticas inválidas para Auth. Esse teste não simula usuário para RLS.

- HTTP200; commit real de Fiber montou SuspendedLegacyPanel em ~5,6s; StaffPanel ausente em todos os commits observados.
- Link abriu `/admin/pedidos`, com AdminOrdersPage montado e campo E-mail visível (~2,5s nessa navegação).
- Nenhum pageerror; duas falhas de fonte externa foram bloqueios deliberados de Google Fonts. Zero chamadas ao backend-sink.
- Screenshots `painel-hydrated.png`/`admin-pedidos-login.png`, `browser-trace.zip`, console/requisições e commits em browser-result.json.
- O gate normalizado e o corpo StaffPanel têm o mesmo hash entre b324c149 e ad41822; não foi necessária correção funcional do produto para esse PASS.

O timeout anterior de Chromium --dump-dom/virtual-time não comprova defeito de React. A nova observação demonstra hidratação/navegação com esse código, mas não isola retrospectivamente a causa exata de cada timeout anterior. Não atribuímos uma causa específica sem prova. SSR não foi usado como substituto de hidratação.

## 10. Compatibilidade e reversão

A autorização comercial global do Master continua distinta: o staff de plataforma mantém o caso legítimo de CRM, mas deveria depender de grant para dados privados de Delivery. Não corrigir a falha concedendo membership organizacional amplo a staff.

Próximo SQL mínimo: substituir/quarentenar coordenadamente tracking/append por telefone, preservando consumidores por capability privada; repetir append com loja aberta. Cobrir disponibilidade, horários semanais, dias especiais e horários especiais com escopo explícito; revisar funções SECURITY DEFINER e policies permissivas relacionadas; alinhar leitura/escrita de complementos ao grant explícito. Não reescrever arquitetura nem reduzir o teste para fazê-lo passar.

Para L, corrigir instalação normal do checkout e alinhar executor/precondições de Storage ao contrato nativo; não mudar owner/usar bypass no teste para ocultar incompatibilidade. Campos/tabelas e consumidores legados não cobertos pela allowlist continuam relevantes; nenhum teste pós-quarentena os certificou.

Rollback admissível para implantação futura: congelar escrita no clone, manter painel suspenso e isolamento, preservar dados e usar sucessor seguro/roll-forward. Nunca retornar a StaffPanel ou restaurar grants amplos. Snapshot em novo destino descartável deve ser validado antes de qualquer recuperação. Rollback pós-commit seguro, restore T1 após perda total, contratos/assinaturas preenchidos e recuperação de permissões legítimas: **NOT RUN nesta missão**.

## 11. Riscos P0/P1/P2/P3

| Severidade | Achado | Situação |
|---|---|---|
| P0 | staff sem grant altera disponibilidade B; staff_A/sem grant leem B | confirmado no clone M; aprovação interrompida |
| P0 | RPC tracking legada retorna objeto B ao anônimo com UUID + telefone | confirmado no clone M após candidato; sem capability privada |
| P1 | candidato L falha ownership de Storage e replay normal falha checkout | confirmado; não instalável como ensaiado |
| P1 | Realtime sem controle positivo de entrega; revogação/logout não completos | FAIL/BLOCKED; zero evento B não certifica |
| P1 | Storage próprio e complementos de staff legítimo falham; substitutos incompletos | positivos FAIL; origem/baseline discriminados |
| P1 | funções legadas, caminhos alternativos e recuperação comercial não integralmente comprovados | não encerrados |
| P2 | expectativa HTTP403 excessivamente estrita; tentativas intermediárias de harness/rede | discriminadas; sem mascarar raw FAIL |
| P3 | refinamentos de UX fora do escopo | nenhum bloqueio crítico rebaixado para P3 |

## 12. PRs e evidências

Nova [Master #40](https://github.com/luit77yak-dev/neroxa-master/pull/40), **draft**, branch `security/mission-02a3-real-isolation-20261014`, base da Master #38. Contém workflow/harness/manifestos derivados e relatório/evidências compactas. Não modifica os candidatos SQL das PRs existentes. Auto-deploy da branch desabilitado antes do primeiro push.

Delivery #38/#39/#40 e Master #37/#38 permanecem draft. Sem merge/deploy, alteração de main ou operação comercial. Logs completos, fixtures, hashes e trace constam no pacote local; JWTs/status privados/dumps não foram publicados.

## 13. Retorno A–H e próxima decisão

**A. Banco descartável completo?** Sim, os seis serviços reais subiram; Auth/REST/Storage foram exercitados. Subir Realtime não equivale a comprovar entrega de eventos.

**B. Isolamento A/B/C comprovado?** Não integralmente. Há casos reais válidos no núcleo, mas P0 de disponibilidade/horários impede conclusão global.

**C. Staff sem grant negado?** No núcleo testado, sim. Na disponibilidade/horários de B, não; inclusive houve UPDATE confirmado.

**D. Dois perfis SQL passaram?** Não. M aplica, preserva dados na aplicação e falha em segurança/positivos; L falha replay/aplicação. Não promovê-los.

**E. Contenção após hidratação?** Sim, com Fiber, screenshots/trace e navegação ao login admin. Não é prova de backend.

**F. Regressões funcionais?** Há positivos que falham; complementos já falhavam no baseline e Storage não tem baseline operacional completo. Não atribuir toda falha ao SQL novo. Checkout L tem defeito real de instalação.

**G. F01 encerra?** Não. P0 de configuração e tracking confirmado e caminhos relevantes (Realtime, Storage operacional, legado, funções e recuperação) ainda não comprovados.

**H. Decisão da Coordenação?** Manter bloqueio de promoção/comercial, priorizar os ajustes mínimos de escopo e compatibilidade acima e novo ensaio dos mesmos casos. O runner adequado já foi viabilizado sem nova despesa; não é necessário contratar infraestrutura para repetir essa matriz. Missão 02B permanece em planejamento.

## Cobertura ainda pendente e arquivos alterados

Não houve cobertura exaustiva de todos os positivos INSERT/DELETE, dias/horários especiais, views e assinaturas de funções. Negativas de Storage sem positivo operacional, Realtime sem evento próprio, pós-quarentena L e recuperação preenchida não certificam isolamento. Os SQLs candidatos não foram corrigidos nesta missão: diagnóstico e prova precedem PRs de correção.

Arquivos alterados na nova PR: workflow, preflight/firewall, harness Node e Realtime, SQL/manifesto de replay derivado e documentos/evidências em audits/02a3. vercel.json somente desabilita auto-deploy da branch isolada. Nenhum código comercial Delivery ou candidato SQL existente foi alterado. Ajuste do predicado INSERT400/23514 foi checado sintaticamente e não reexecutado na matriz completa; os FAIL brutos foram preservados.

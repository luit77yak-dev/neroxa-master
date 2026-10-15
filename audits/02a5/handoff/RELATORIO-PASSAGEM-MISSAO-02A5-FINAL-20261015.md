# Passagem final — Missão02A.5 —15/10/2026 UTC

## Resumo executivo

**F02 P0 CONFIRMADO E ABERTO:** no mesmo clone que passou no recorte comprador, a RPC legada por UUID+telefone ainda devolveu ao anônimo o pedido B e seu telefone. Não autorizar homologação/merge/deploy. **F01 continua ABERTO por cobertura incompleta**, embora o PATCH indevido de staff_none em B tenha sido bloqueado no recorte, com controle próprio e digests preservados. Comercial NÃO LIBERADO; Marco01=0/7;02B somente planejamento.

Avanço comprovado: stack Supabase nativa completa em VM GitHub standard pública; Auth real; prefixo SQL candidato aplicado; checkout RPC confirmado e retry com1pedido; capability32bytes emitida uma vez; HTTP comprador real com projeção mínima; negações por token/domínio/Origin/proxy e por revogação/expiração; quota PostgreSQL atômica120/125 chamadas e HTTP429. **Isso não é checkout TanStack→confirmação React→tracking E2E**, nem M integrado liberável. O gate de telefone não foi aplicado, não foi fabricado CONSUMER-DISABLEMENT.json e --release-ready permanece BLOCKED.

## Repositórios, PRs, SHAs e arquivos

- [Delivery PR42](https://github.com/luit77yak-dev/pizza-perfect-plate/pull/42), branch security/mission-02a5-private-tracking-local-20261014, base security/mission-02a2-validation-20261014 / ad41822e4622e3b14bcb650d7be84126f78b80f6. Partida23069f2121e87f9d9a8574f606689458c06999b3; **HEAD de código testado4ce88959a751066f96da4cbab8d1fc9ac29bb320**.
- [Master PR46](https://github.com/luit77yak-dev/neroxa-master/pull/46), branch security/mission-02a5-integration-local-20261014, base security/mission-02a4-live-session-20261014 / a189d67f1ea49dd4e2ac14679c9bbf9cbb16e1a0. Partida888f6dafbe107be5f8f789f2d0e449ce64c24925; **HEAD do ensaio final4e570b8bd0b2460ce1242d2c1859aa88ac7b37c4**. Commit documental posterior não é novo teste; HEAD remoto final exato em FINAL-REFERENCIAS.json e descrição da PR.

AGENTS de ambos lidos, fontes e refs conferidos; branches existentes, pushes fast-forward, sem reescrita de histórico, bases preservadas e PRs draft. vercel.json não alterado: chave da branch exata=false e nenhum true concorrente. Consultas Vercel após cada push retornaram0deployments. Comprovações em evidence/vercel-*.json. is_neroxa_staff e StaffPanel gate preservados. Nenhuma PR nova.

Delivery: novo src/server/private-tracking-backend.ts; adaptador private-tracking.server.ts ligado às RPCs reais; checkout-gateway.server.ts permite emissão somente no contrato descartável local;9 testes adicionais em private-tracking-backend.test.mjs. Dois commits pequenos: c63d491 e4ce8895 (formatação). Interface/estética/painel/02B não ampliados.

Master: SQL tracking-ingress-quota.candidate.sql, manifesto BUYER-PRE-GATE, EXPECTED-IMAGES, documentação, generator/harness/network e workflow específico. Commits a3f47c6, c0ca915 e4e570b8; documentação posterior. SQL é candidato em audits, não migration de produção.

## Estado real do componente comprador

O adaptador compartilhado usa get_public_storefront_context, neroxa_tracking_reserve_ingress e neroxa_track_order_with_capability. A quota é PostgreSQL com INSERT ON CONFLICT atômico, janela1minuto/120 por HMAC do domínio. Retenção cardinalidade controlada pela allowlist; ainda permite DoS do orçamento global da própria loja, sem isolamento por visitante. Não é rate limiting de produção.

Ativação exige simultaneamente flag privada=true, homologation, projeto local-disposable, URL backend http127.0.0.1 com porta e igualdade do backend esperado, contrato direct-canonical-host-v1, domínios exclusivamente *.synthetic.invalid e segredo de quota>=32bytes. Produção permanece fail-closed mesmo se a flag privada for true. Nenhum backend comercial pode satisfazer esse contrato.

Host/Origin são contexto, não autenticação. Token Bearer é obrigatório; RPC vincula order_id+instance_id+hash/TTL24h/revogação. Adapter resolve domínio no backend e nunca aceita instance_id do body. Headers forwarded não são confiados; handler os rejeita. O teste usa uma ponte HTTP loopback simulando uma borda direta que só aceita3hosts canônicos sintéticos; não certifica proxy/TLS hospedado.

Emissão CSPRNG32bytes após resposta efetiva do checkout RPC; banco recebe SHA256 e registra uma vez por pedido, condicionado ao checkout_key correto. Retry confirmado retornou o mesmo pedido,1linha para a chave e não reemitiu token. A primitive falha se registro falhar; o gateway devolve erro genérico, sem token/sucesso de tracking, preservando a chave de pedido. Falha de registro no caminho TanStack exato ainda não ensaiada com backend real.

Browser mantém token somente em memória, fora de URL/cookie/localStorage/sessionStorage e histórico. Reload, nova aba ou perda da resposta após registro perde acesso; não há reemissão UUID+telefone. Recuperação self-service BLOCKED; suporte assistido conforme contrato ainda a definir. Revogação e expiração foram simuladas por alterações administrativas na tabela privada do clone; **endpoint administrativo de revogação autorizado e recuperação forte não implementados**.

Dois consumidores Storefront e ramo de append por telefone permanecem removidos; recoverySnapshot não volta como tracking alternativo. Consumidores externos não verificados impedem gate coordenado. RPC antiga continua uma superfície perigosa, como comprovado ao final.

## Execuções e evidência

Workflow .github/workflows/mission-02a5-buyer.yml: gatilho somente na branch Master draft e paths específicos, sem main/alteração de bases. Node22.23.0, CLI2.120.0, PostgreSQL17.11.0.004, Auth2.197.0, PostgREST16.4, Storage1.79.36, Realtime2.140.10 e Kong2.8.1; seis imageIDs exatamente iguais ao manifesto anterior. Dependências Master por package-lock e npm ci --ignore-scripts; CLI versão fixa com instalação antes da restrição de rede. Transientes do instalador CLI não têm lock independente (risco P2).

| Run / job | SHA Master | Resultado real |
|---|---|---|
| [38664863661](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38664863661) /116194351317 | a3f47c681d387c7f9e50c945ee0e449c77759318 | FAIL: stack/imagens/rede iniciadas; harness sob UID separado não carregou módulo. Auth/matriz NOT RUN. Cleanup explícito FAIL, endpoints restantes na VM; não declarar descarte nativo aprovado. Runner era efêmero, sem recurso hospedado persistente. |
| [38665211605](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38665211605) /116195482660 | c0ca9153eaa34e571afe093cb5821126c6e8e6ea | FAIL do ensaio HTTP: Auth/SQL e F01 executados; cliente fetch alterou Host e ponte recusou, seguido de JSON vazio.11checks PASS/2FAIL baseline. Cleanup PASS. |
| [38665665942](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38665665942) /116196932383 | 4e570b8bd0b2460ce1242d2c1859aa88ac7b37c4 | Job SUCCESS **somente recorte comprador**;14checks PASS/3FAIL preservados (2baseline e F02 final),11casos buyer PASS. F02P0 e gate BLOCKED permanecem. Cleanup PASS. |

As duas falhas anteriores não foram convertidas retroativamente em PASS. Correção1 concedeu leitura/travessia do workspace ao UID de teste e restaurou acesso ao AB_WORKDIR no cleanup. Correção2 trocou apenas transporte do harness para http.request; reprodução local independente confirmou fetchHost127.0.0.1 versus Host canônico preservado por http.request. Não mudamos regras de autorização, removemos cobrança ou habilitamos flag comercial para tornar assert verde.

### Qualidade Delivery no SHA4ce8895

PASS: Bun1.3.14 --no-env-file install --frozen-lockfile --ignore-scripts;125/125 testes Node, build --mode homologation, tsc --noEmit e ESLint focalizado. Logs quality-*.log e quality-results.json. Os9 novos testes são unidades com dependências substituídas; não representam prova de banco.

Chromium após hidratação PASS: SuspendedLegacyPanel montado, StaffPanel ausente, navegação para /admin/pedidos e adapter off retornando503 com zero backend requests. Screenshots/trace anexados; fontes Google externas bloqueadas, pageErrors=[]; erros de recurso bloqueado não são erros React. Esse navegador usa sink local503, **não checkout comprador real nem RLS**.

Master: verificador de27unidades+tooling PASS;6testes fail-closed PASS; --release-ready BLOCKED/exit2. Build/TS/lint global Master NOT RUN: mudanças são auditoria/SQL/harness, sem UI Master.

## Matriz nativa e P0 antes/depois

Dataset fictício O1:A/B;O2:C; Auth real admin_A/B/C, staff_A com grantA+MFA, staff_none sem grant+MFA, common e anon.6identidades verificadas no PostgreSQL como authenticated/uid correspondente/sem superuser. service_role somente bootstrap e backend comprador, nunca usuário comum.

| Caso | Antes | Depois no prefixo candidato |
|---|---|---|
| staff_none PATCH enabled=false em B | FAIL P0:HTTP200,1linha, digest alterado | PASS da negativa:HTTP200,0linhas, digests iguais; admin_B SELECT e UPDATE idempotente próprios retornam1linha |
| admin_A pedidos A/B/C | não usado como reprodução baseline | A1linha positiva;B/C0linhas, dados preservados |
| anon UUID+telefone→pedidoB | FAIL baseline, resposta não nula | **FAIL P0 confirmado:**HTTP200, order_id91000000-0000-4000-8000-000000000203, statusRECEIVED, has_phone=true |
| HTTP comprador A com token | não existente no baseline | PASS200, total30, itemSyntheticA, sem campos de contato/endereço |
| sem token/incorreto; A-token em domínio B/C; Origin divergente; proxy spoof | — | PASS403 + snapshots negócio/capabilities iguais; quota contabilizada separadamente |
| RPC privada direta anon/admin_A, mesmo com token válido | — | PASS401/403 + digests iguais; backend autorizado200 é controle positivo |
| capability revogada/expirada | — | PASS403 e digests de negócio/capabilities iguais; revogação/expiração administrativas antes da chamada |
| quota durável concorrente125 | — | PASS120permitidas/5negadas; HTTP com quota esgotada429 |

17checks incluem6identidades,2FAILs baseline,8PASSs candidatos e1FAIL legado final.11casos buyer separados: não somar como nova suíte125. CSV derivado e JSON completos conservam status, HTTP, antes/depois e origem.

Snapshots incluem contagens+MD5 de todas tabelas public, private (exceto ingress), neroxa_private e Storage objects/buckets após reset da lista quando as tabelas privadas são criadas. Quota é efeito de segurança intencional e separado: somas antes/depois nos negativos gerais. Revogação/expiração têm snapshots de negócio, mas seus deltas individuais de quota não foram registrados; não alegar ausência de TODO efeito em todas tabelas. Os snapshots não incluem auth.sessions, cuja revogação não foi exercitada aqui. ACLs/triggers são versionados, mas não houve comparação dinâmica exaustiva de todos grants/owners antes/depois.

**O job verde não apaga o F02 FAIL.** A verificação desse P0 foi a última operação; não houve promoção ou teste de liberação posterior. F01 só comprova as operações acima, sem encerrar isolamento integral.

## Manifestos, composição e compatibilidade

INTEGRATED-MANIFEST original27unidades permanece inalterado e não aplicado por completo. BUYER-PRE-GATE-MANIFEST.json formaliza catálogo/19predecessores exatos→scoped→availability→addon→live-session→Storage→private-tracking→quota. **Não aplica phone-rpc-quarantine.release-gate.sql**, nem afirma consumidores desabilitados. Cada arquivo tem BEGIN/COMMIT e ON_ERROR_STOP=1; cadeia inteira não é transação atômica.

Quota SHA256 afb5c31c4588a26cc1e7c31cdc09d6f5360fce4fcef22281e5d3b80dcea60727. Bootstrap original SHA256 b3af7a3fbecf6bd648fa0433b43b1afd931ba48b54bf9fc688aefd4f27aa47ba. Demais hashes nos manifestos/sources. Mesmos prefixo SQL e imagens foram aplicados em clones frescos dos runs2/3; não é prova da composição com gate de telefone. Quota ainda requer incorporação formal no futuro manifesto de release completo. Perfis L e amendment não concatenados nem executados.

Normal executor PostgreSQL, sem alterar owners/roles nativos ou desabilitar RLS para passar. Builder histórico restaura catálogo de aplicação conforme fonte; não é migração remota. is_neroxa_staff, contratos/assinaturas/jobs e semântica comercial global não modificados; sua validação funcional integrada continua NOT RUN.

## Rede, capacidade, custos e descarte

Antes de cada run foi conferido repo público e runner standard ubuntu-latest; job revalida github-hosted/public antes de pulls. Fonte de cobrança arquivada: docs.github.com/en/billing/concepts/product-billing/github-actions, que declara uso gratuito de runners standard em repositórios públicos. Sem larger runner, cache/artifact pago, serviço novo ou contratação. Não estimamos prazos/custos não comprovados.

Preflights reais:4CPUs, overlay2, aproximadamente90–91GB livres e15GB RAM disponível; limiar28GiB/6GiB/2CPU atendido. Estimativa de pico8GiB imagens+5serviços+3dependências+10margem, não medição contínua do pico. Registro de todos imageIDs e medições por run no EXECUTION-INDEX.json.

Runtime sob UID neroxa_test recebe env-i, somente loopback em IPv4/6, forwarding externo da bridge dos serviços bloqueado; controle negativo TEST-NET-2 recusado. Heartbeat permanece sob UID do runner, sem regra OUTPUT global. Testes auditados têm socket Docker local para SQL, portanto não é isolamento contra autor malicioso do próprio harness. Instalação ocorre antes da trava e sem dotenv comercial. Portas publicadas somente127.0.0.1 por relay.

Runs2/3 removeram stack/rede e comprovaram nenhum container do projeto; sem backups/dumps/tokens publicados. Run1 teve cleanup FAIL e permanece registrado, sem inferir PASS pelo descarte automático da VM. Browser local encerrado, dotenv local restaurado após os testes e worktrees limpas no fechamento. Nenhum banco remoto, sandbox hospedada ou dado real foi utilizado.

## Pendências e riscos

- **P0 F02 confirmado:** acesso legado telefone continua; próximo bloqueador antes de qualquer piloto. Não revogar produção automaticamente: inventariar/migrar ou desabilitar consumidores comprovadamente, depois ensaiar gate só no clone com positivos privados preservados.
- **P0/F01 aberto por cobertura:** disponibilidadePATCH protegida no recorte, mas faltam quatro famílias completas, CRUD produtos/categorias/complementos/clientes/histórico, views/grants/overloads/caminhos alternativos, StorageCRUD e Realtime/logout/JWT antigo no candidato único.
- **P1:** TanStack checkout real→confirmação/hidratação/reload não executado; concorrência inicial de checkout, falhas reais de registro e token válido de B contra A não cobertos integralmente. Retry serial e emissão única passaram, sem prova de toda a concorrência comercial.
- **P1:** endpoint autorizado de revogação/recuperação forte, política de resposta perdida e recuperação browser pendentes. Memória perde token no reload; sem bypass por telefone.
- **P1:** quota global permite DoS local; proxy/TLS hospedado não validado. Produção segue tecnicamente bloqueada.
- **P1:** append com preço/histórico/pagamento, imagens derivadas públicas e T1/rollback pós-commit **NOT RUN**, planos anteriores separados, sem RPO/RTO.
- **P2:** falhas do harness/cleanup inicial preservadas e corrigidas; logs de todos runs incluídos. Proteções/testes de sesssão e Storage do02A4 não viram PASS atual.
- **P2:** instalador CLI transiente sem lock independente, ACL dinâmica completa e contabilidade de quota de todos negativos não exaustivos; inventário externo/SSO/logs de edge pendentes.
- **P3:** nenhum item de estética/painel/02B iniciado nesta rodada.

## Próxima ação exata e encerramento

CONTINUIDADE.md contém refs, comandos de inspeção e reprodução do run final. A Engenharia deve começar por ler o F02 FAIL e o inventário dos consumidores; produzir evidência legítima da migração/desativação, integrar quota no manifesto de release e preparar ensaio do gate com HTTP privado positivo e RPC legado negativo. **Não criar recibo de desativação/GUC de consumidores sem prova.**

Para reproduzir o recorte exato após revisar elegibilidade/custos: `gh run rerun 38665665942 --repo luit77yak-dev/neroxa-master`. Não executado novamente nesta passagem. Não mexer em main/bases para CI. Trabalho funcional encerrado para reservar passagem; nenhuma execução de teste fica em andamento.

**Confirmação:** nenhum SQL remoto, dado/pedido/credencial comercial, merge, deploy, contratação, restauração de grants inseguros ou StaffPanel. PRs continuam draft. F01/F02 ABERTOS; Marco01=0/7; comercial NÃO LIBERADO. A decisão de homologação pertence à Coordenação e não foi tomada aqui.

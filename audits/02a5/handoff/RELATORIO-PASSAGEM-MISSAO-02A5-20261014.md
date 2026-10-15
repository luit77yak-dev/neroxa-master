# Relatório de passagem — Missão 02A.5 — 14/10/2026

## 1. Resumo executivo

**Integração real BLOCKED. F01/F02 ABERTOS; comercial NÃO LIBERADO; Marco01=0/7; 02B somente planejamento.**

Entregues candidatos locais, manifesto integrado verificável, retirada dos fallbacks por telefone e recovery-snapshot do tracking, contratos HTTP/emissão preparados e bloqueados, testes e planos. Executados com aprovação:116 testes Node, build homologation, TypeScript, lint focalizado e Chromium após hidratação. Seis testes do verificador aprovados. **Nenhum SQL executado nesta missão.** Os resultados não homologam o candidato integrado.

Runner local vfs tem cerca de23GiB livres, abaixo do limiar28GiB utilizado anteriormente, sem margem de pico demonstrada. Não puxamos imagens. O anexo exige confirmação específica para publicação/runner; solicitada nesta sessão, sem resposta registrada até o fechamento. Nenhum push, nova PR, workflow remoto, merge, deploy, banco remoto ou serviço pago.

## 2. Repositórios, branches e SHAs

AGENTS de ambos repositórios lidos. Histórico Lovable e is_neroxa_staff preservados. Nenhuma modificação na main.

- Delivery local: `security/mission-02a5-private-tracking-local-20261014`, base PR39 `ad41822e4622e3b14bcb650d7be84126f78b80f6`, commits4f2191082889938eb1b67de04e1274e5202d2324 e **791eb010cc4ce1adee4cf5c20cf167ad364f3f26**. Último SHA de código testado.
- Master local: `security/mission-02a5-integration-local-20261014`, base PR45 `a189d67f1ea49dd4e2ac14679c9bbf9cbb16e1a0`. Commit inicial9ed2310 e metadata/documentação posterior identificados em patches/BASES.json. Não atribuídos testes de banco a esses commits.

Referências conferidas por API, todas as12 em draft e sem divergência da02A4:

| Repo/PR | SHA |
|---|---|
| Master37 | 229059e5702bdad3ffa96d3373d878061ab90261 |
| Master38 | 330520ade7abf297423d5ffeb24d406bc43f88ff |
| Master40 | 57e8930d9be66b51f28828fab2057b809dcc65a9 |
| Master41 | 1697ac3b3eab71041535bfb19d4dafc95f295ed6 |
| Master42 | 846e04090ccc29070525887f2ee29017fd019391 |
| Master43 | 55dfd757410cf179e1e51744c6f15f224f26f810 |
| Master44 | bbfbfc35d3dfd566fcaa9bb50cce29e6f7ed941a |
| Master45 | a189d67f1ea49dd4e2ac14679c9bbf9cbb16e1a0 |
| Delivery38 | b324c1499ff3feda7cb6b56fec3c2ac63bc56052 |
| Delivery39 | ad41822e4622e3b14bcb650d7be84126f78b80f6 |
| Delivery40 | 7fe0e05ca899de3182872921591cbaccd840e58c |
| Delivery41 | a99a7d743f9dbed8ece5d8b0880c4b9c543960c3 |

Master41 HEAD documental não herda aprovação; SQL availability vinculado à origem172abae4bc5dc41348202915e61e4f1fd8918ab2 e hash exato. Mapa /mnt/data/NEROXA-02A5-BASELINE-REFERENCIAS-20261014.json ausente; fontes alternativas: ZIP02A4, relatório e commits exatos. ZIP anterior SHA256 a0cc31f5462effcea9ca27539772f2b246c5365e68739af7d76a646f2b37b5bb é fonte histórica, não nova execução.

## 3. Ambiente, rede e versões

Workspace local,3 CPUs, aproximadamente9GiB de memória disponível,23GiB de disco livre, Docker vfs. Medições em evidence/preflight.json. Pico de extração NÃO medido; nenhuma extração iniciada. Node22.23.0, Bun1.3.14 congelado; versões Chromium/Playwright em browser-versions.json. CLI2.120.0 e imagens PG17.11/Auth/REST/Storage/Realtime são contrato histórico a medir na próxima stack, **não iniciadas novamente**.

Instalação pelo registry/proxy permitido; runtime Node com guarda fetch/net/DNS loopback. Chromium com proxy externo morto, interception loopback/data/blob e service workers off. Fontes Google bloqueadas; backendRequests=[] e pageErrors=[]. Chaves sintéticas inválidas são configuração de UI, não usuários Auth simulados nem prova RLS. Não afirmamos isolamento OS completo de stack não executada.

Primeiro build encontrou conflito com .env versionado. Esse arquivo deveria ter sido excluído antes do primeiro Vite: corrigido retirando-o da worktree runtime sem imprimir valores, e repetindo com configuração fictícia. Guarda de egress já estava ativa; nenhum acesso comercial comprovado. A tentativa rejeitada não virou PASS. Harness final bloqueia dotenv comuns; reprodução exige retirar todos dotenv pertinentes. Nenhuma alteração de .env comercial entra nos commits/patches.

## 4. Testes realmente executados

| Verificação | Estado | Evidência |
|---|---|---|
| SHA/draft das12 referências | PASS leitura | pr-initial-state.json |
| Bun1.3.14 --no-env-file install --frozen-lockfile --ignore-scripts | PASS431 pacotes; lock preservado | bun-install.log |
|27unidades + tooling, SHA256/origem Git/ordem | PASS artefatos somente | manifest-verification.json |
|6testes fail-closed do verificador | PASS | manifest-tests.log |
| --release-ready sem prova dos consumidores | BLOCKED esperado, exit2; contenção testada PASS | manifest-release-gate.json |
| HTTP/issuance unitário | PASS11, incluídos nos116 | private-tracking-unit.log |
| Node --experimental-strip-types --test tests/*.test.mjs | PASS116/116 | attempt3-quality-node-tests.log |
| Vite build --mode homologation | PASS | attempt3-quality-build.log |
| tsc --noEmit | PASS | attempt3-quality-typescript.log |
| ESLint focalizado TS/TSX alterados | PASS | quality-lint.log |
| Chromium commit React + StaffPanel ausente + navegação admin | PASS | browser-result.json/screenshots/trace |
| HTTP local real /api/order-track adapter off | PASS503 genérico e zero backend calls | browser-result.json |
| Banco M integrado/Auth ABC/Storage/Realtime/P0 | BLOCKED | preflight.json |
| L e amendment reais | NOT RUN/BLOCKED | manifestos separados |
| Checkout→capability→HTTP comprador/confirmação/reload | BLOCKED | adapter/quota/proxy incompletos |
| Imagens públicas derivadas | NOT RUN | proposta entregue |
| T1/rollback pós-commit/RPO/RTO | NOT RUN | plano separado |
| CI remoto atual | NOT RUN | nenhum dispatch |

quality-final.json aponta cada execução efetiva; tested-source.json vincula bytes ao SHA791eb01. Logs anteriores FAIL preservados: npm ci sem package-lock (projeto usa bun.lock);3 testes estáticos exigindo legado e erros TS no módulo novo, corrigidos; primeiro build com dotenv rejeitado; repetição após commit com seletor vazio de arquivos no harness causou formatter/lint amplo FAIL. Corrigido seletor base→HEAD e repetidos somente esses checks. Não alteradas assertions RLS, não alegado lint global aprovado. Qualidade final não homologa funcionalidades comerciais.

## 5. Manifesto e composição SQL

INTEGRATED-MANIFEST.json contém catálogo+19predecessores+scoped+availability+addon+live-session+Storage+tracking+gate telefone, com origem/branch/SHA/SHA256, predecessor, executor/owner esperado, objetos, testes, pré-condições, incompatibilidades, impacto e reversão. Tooling/harness também fixados por hash.

Verificador não conecta nem aplica SQL. CONSUMER-DISABLEMENT.json intencionalmente ausente: não fabricar evidência/GUC de liberação. Nenhuma prova de aplicação/repetição de clone. BEGIN/COMMIT são por unidade; cadeia inteira não atômica. Harness histórico aplica focos independentes e precisa adaptação antes de certificar M único. DEPENDENCIAS-E-APLICACAO.md descreve prosrc/session_id/Storage/CREATE OR REPLACE. Nunca ALTER OWNER, superuser ou desativação de RLS para fazer candidato passar.

L31migrations+quarentena separado, origem Delivery41. AMENDMENT-MANIFEST.json registra3SQLs extras e assinatura real `(uuid,uuid,text,uuid,jsonb)`. Hash estático do corpo anterior a store-availability-capability confere md5 a155f86d00edea3cf807723f7cac5838; isso não é invocação da RPC.

## 6. Comprador e consumidores

CONSUMIDORES-F02-FINAL.md detalha inventário/flags/ameaças. As duas leituras Storefront e o ramo append legado não usam UUID+telefone; recoverySnapshot também removido como tracking alternativo. Busca src excluindo tipos gerados não achou chamadas legadas executáveis. Apps externos e RPCs no banco não certificados por essa busca.

Emissão preparada: CSPRNG32bytes, SHA256 para RPC service-only, registro único por pedido/checkoutkey; conflito não devolve segredo antigo. Handler HTTP puro valida allowlist canônica/Host/Origin, rejeita proxy headers não contratados/query token/body adulterado, exige Bearer+quota antes do lookup e minimiza resposta com no-store/no-referrer. Piso80ms não comprova tempo constante sob carga.

**Integração runtime incompleta:** adapter enabled=false; flag privada true bloqueia checkout antes do DB. Quota durável e proxy confiável não validados. Nenhum token emitido por checkout real. Testes com dependências substituídas são unidades. Token browser só memória, sem URL/localStorage/sessionStorage/cookie; reload/nova aba perde acesso. XSS ainda pode roubá-lo. Sem fallback: suporte assistido; recuperação self-service e endpoint administrativo de revogação BLOCKED. UUID+telefone nunca reemitem token. Resumo/histórico local preexistente pode conter PII do comprador e requer revisão de retenção.

## 7. Matriz e regressões P0

MATRIZ-02A5.csv discrimina recurso/ator/loja/operação/expectativa/estado/evidência/antes/depois/efeitos/controle positivo. Linhas de banco planejadas estão BLOCKED, dados NOT CAPTURED/NOT VERIFIED. Não existe digest de banco atual nem controle positivo nativo. Matriz de planejamento não equivale à execução.

Antes histórico: F01 run38621636857 staff_none AAL2 alterou B; F02 run38623751297 anon UUID+telefone obteve pedido B. Recortes corrigidos02A4 e sessão/Realtime run38650424558 são históricos. **Depois02A5: BLOCKED**, casos não repetidos no candidato único. Nenhum HTTP200/lista vazia virou aprovação RLS.

## 8. Append, imagens e compatibilidade

Append: dependências/assinatura inventariadas; NOT_SETTLED preservado. Loja aberta, preços/opções/meia pizza, concorrência/histórico/pagamento NOT RUN. Flags off no ambiente testado; decisão de cobrança adicional pendente.

Imagens: proposta separa original privado de publicação derivada explícita; decode/limites/reencode/remoção de metadados, vínculo produto/instância, reads sem writes, revogação/cache/lifecycle. Nenhum bucket público/worker criado.45casos PNG02A4 são apenas fonte.

Master comercial/global intacto. Usuários sem session_id devem falhar fechados e fazer relogin/SSO seguro, nunca receber exceção global. Staff sem grant conserva somente funções comerciais globais legítimas; prova integrada pendente. Pedidos/histórico/contratos/assinaturas/jobs não migrados.

## 9. Recuperação e reversão

Planos T1 e compatibilidade anexados. Dataset fictício abrangente proposto, sem criar schema financeiro inventado. Nenhum T0/T1 restaurado, RPO/RTO não medidos. Terceiro destino/falha integral TARGET e replay durável pós-cutover NOT RUN. Rollback transacional não certifica recuperação pós-commit. Reversão nunca reativa StaffPanel/helper antigo/grants telefone; manter contenção e roll-forward.

## 10. Riscos P0/P1/P2/P3

- **P0 histórico aberto:** superfícies relevantes não comprovadas no M integrado, inclusive disponibilidade/horários/RPC telefone. Nenhum novo P0 observado porque não houve banco; ausência de ensaio não indica ausência de vulnerabilidade.
- **P1:** tracking runtime/quota/proxy/revogação/recuperação incompletos; retirada de fallback reduz funcionalidade. Não usar candidato em piloto.
- **P1:** append financeiro, imagens públicas, matriz completa/Realtime e T1 sem validação composta.
- **P2:** dotenv na primeira tentativa de build, corrigido; nenhum tráfego comercial comprovado. Não repetir harness inicial.
- **P2:** falhas TS/contratos estáticos/seletor de lint corrigidas, logs preservados. TS e lint focalizado final sem erros; global não aprovado.
- **P2:** supply chain da stack não reproduzido; versões browser inventariadas sem novo lock/digest. Consumidores externos/SSO e retenção PII local pendentes.
- **P3:** mapa /mnt/data ausente, suprido por commits/ZIP exatos.

## 11. Arquivos e PRs

Delivery: Storefront/CheckoutPanel, checkout-gateway.ts/server.ts e testes de consumidores alterados; adicionados issuance, contrato/adapter/rota tracking, memória browser e11 testes. Master: manifestos/validador/testes/dependências/proposta imagens e cópias exatas dos2SQLs tracking. Fontes e patches anexados, sem dotenv. PRs novas: **nenhuma**.12referências permanecem draft nos mesmos SHAs; não tocadas bases/CI para forçar testes.

## 12. Retorno A–J e próxima decisão

A. Manifesto aplicado e reproduzido? **Não, BLOCKED.** Artefatos/hashes/ordem PASS.

B. Checkout emitiu token sem fuga? **BLOCKED.** Primitive unitária PASS; runtime bloqueado.

C. HTTP comprador válido/negativos? **BLOCKED no backend real.** Unidades PASS;503 adapter off comprova somente contenção.

D. Fallback telefone desapareceu? **Nos consumidores locais inspecionados, sim, verificado estaticamente.** Fluxo comprador completo, RPC direta e consumidor externo não comprovados.

E. Append real preço/idempotência/histórico/pagamento? **NOT RUN/BLOCKED.**

F. Derivados públicos sem escrita? **NOT RUN; proposta entregue.**

G. F01/Realtime/sessão no candidato único? **BLOCKED; F01/F02 abertos.**

H. Build/TS/CI/Chromium? **Node116, build, TS, lint focalizado e Chromium de contenção PASS no SHA791eb01. CI NOT RUN; confirmação/reload comprador BLOCKED.**

I. T1/rollback pós-commit? **NOT RUN; planos entregues.**

J. Confirmar ou negar publicação exclusivamente draft e execução em runner público padrão elegível/verificado sem cobrança. Depois completar quota/proxy/capability/revogação e ensaiar M único. Separadamente decidir recuperação forte do comprador, cobrança NOT_SETTLED, migração de imagens e ensaio T1. Nenhuma dessas decisões autoriza produção.

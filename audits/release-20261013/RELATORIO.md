# Release multicliente — auditoria e execução de 13/10/2026

**Decisão: NO-GO comercial.** Correções candidatas e recuperação lógica aprovadas nos escopos abaixo; produção intocada e Master #37 / Delivery #36/#37 em DRAFT. Não houve merge, alteração de domínio, var de produção, migração remota, recurso pago nem teste com clientes/pedidos reais.

## Estado atual e evidências

- Master inicial `ad712e00fb51521b1eb4d96996221d5297277388`, com CI aprovado; evidência integrada anterior efetivamente conferida em Actions. Resultado histórico mais recente era **419**, não somente 354.
- Delivery #36 `afb26bc61d4309d73cfdbd1bfd2f687b11dc71b4`, #37 inicial `3f6d9edb4c64f6b63684098e62999b58ac5f3854`; draft confirmados por API.
- Projeto Master `iefaoaqzltvpfabyeelj`: consultas **somente SELECT** de agregados, catálogo/ACLs e índices; leitura do código dos seis Edge Functions. Nenhuma função operacional/financeira foi invocada.
- Vercel: metadata de produção READY, SHA `47e7d8aef66b0c458ed6f423cebeba99abfcc7a8`. Conferência de arquivos no Git desse SHA: checkout RPC sem instance_id, `/painel` legado presente, novas rotas gateway ausentes. Nenhum POST no deployment.
- Runtime/configuração do Vercel, domínio de teste homologado e consumidores privados fora das APIs acessíveis **não foram certificados**.

Inventário: [CONSUMIDORES.md](CONSUMIDORES.md), `consumers.generated.json` e `edge-functions-readonly.json`. São **1936 referências, 480 no código runtime e 43 funções históricas com símbolos relevantes**, não 1936 consumidores comprovados. Referências próximas de instance_id não são prova de isolamento. A matriz humana registra operação, escopo, backend, compatibilidade e dependências.

## Problemas demonstrados e correções

### Limite de corpo somente após leitura — corrigido no candidato Delivery

As rotas pure HTTP usavam `request.text()` antes de medir bytes. Content-Length ausente/mentiroso permitia consumir integralmente um stream acima do limite antes de rejeitá-lo. **Risco médio de disponibilidade na fronteira da aplicação**, sem afirmar exploração do Vercel publicado (que nem contém estas rotas).

`src/server/bounded-json.ts` agora lê até 64 KiB/32 KiB, cancela o reader acima do limite e rejeita UTF-8 inválido. Compartilhado pelo checkout e amendment; nenhuma RPC/quota é chamada nesse negativo. Quatro testes novos exercitam streams e cancelamento, JSON válido e encoding inválido. Limites/timeout do adapter e WAF continuam necessários: isto não comprova proteção da plataforma contra slowloris ou buffering anterior ao handler.

### RPC administrativa com EXECUTE anônimo — endurecimento candidato comprovado

SELECT confirmou EXECUTE anon/authenticated/service_role nas sete RPCs legadas, inclusive get_admin_orders/update_admin_order_status. **ACL ampla sozinha não prova leitura indevida**, pois verificações internas existem.

Novo `audits/sql/admin-order-rpc-acl.release-gate.candidate.sql`: confere assinaturas/overloads esperados, revoga PUBLIC/anon nas duas RPCs administrativas e preserva authenticated/service_role. Não modifica corpo, autorização, MFA, RLS ou papéis. Aplicado **somente nos clones**, com matrizes positivas/negativas aprovadas. Consumidores administrativos têm que usar JWT autenticado, nunca compensar o bloqueio com service_role no browser. Nenhuma revogação remota executada.

### Tipagem do painel — corrigida, sem mascarar lint

`src/routes/admin/pedidos.tsx`: removidos `any`/disable de ESLint; transport tipado por três nomes e resultados conhecidos, mantendo binding do SDK. CI passa, duas warnings de hooks preexistentes permanecem. Configuração de Auth/backend e UI completa ainda requerem teste integrado.

### Incompatibilidades não resolvidas

- **Alta / instalação:** schema de produção ainda não tem settings.instance_id; a linha órfã impede fase 2. Writer Master e checkout publicado não podem ser ativados em ordem arbitrária.
- **Alta / consumidor:** `/painel` utiliza tabelas/roles/realtime/storage legados por organização; não equivale ao contrato por loja. Não foi removido para ocultar o problema.
- **Alta / integração:** PR #36 tem migrations/ledger/aprovação/settlement/supplier e UI diferentes do caminho privado de capacidade #37; replay combinado e mapa de substituição faltam. Não aplicar ambas as cadeias indiscriminadamente.
- **Ingress pendente:** URL/Host/Origin consistentes não autenticam o cliente nem certificam roteamento confiável. Backend público fixo Master, client primário de painel e SUPABASE_URL de servidor precisam de configuração coerente. Não habilitamos flags.
- **Webhook / risco alto a validar:** código remoto Mercado Pago verifica HMAC, mas dedup usa body.id fora do manifesto assinado; não há freshness explícita do timestamp. Índice único é provider/event_id, não pagamento/sessão canônica. O código de APPROVED tenta novo provisionamento. **Não executamos replay financeiro nem afirmamos duplicação real**. Exigir teste isolado de assinatura/replay/concorrência/falha parcial e transação/idempotência canônica antes de mudar esse consumidor privilegiado.
- Tracking UUID+telefone, token perdido/response perdida, retry de checkout com intenção alterada, catálogo rico/GROUP_ADDONS_V1, meio-a-meio e regras de assinatura/entitlements não têm validação comercial integral nesta execução. Não converter IDs de produtos em IDs de adicionais.

## Configuração histórica — decisão humana necessária

Reverificado em SELECT: uma linha sem instância, active=true, organização CANCELLED, assinatura TRIAL, zero membros ativos e domínios; plano existente/ativo e zero períodos vencidos detectados pela consulta (datas ausentes não comprovam validade); **um contrato ACTIVE/SIGNED e um registro de faturamento**. Nenhum UUID, nome, documento ou valor de cliente exportado.

As entidades têm ciclos próprios; não escolher qual estado prevalece por suposição. Alternativas revisáveis:

1. **Preservar/bloquear:** manter linha e cutover bloqueado enquanto responsável verifica titularidade, contrato, status e provisionamento. Mais seguro imediatamente.
2. **Provisionar após autorização:** se contrato/assinatura justificarem loja operacional, criar instância e recuperar acesso do proprietário com mecanismo aprovado/auditado; depois mapear a configuração explicitamente. Não inventar owner nem copiar para primeira instância.
3. **Retenção histórica separada:** se encerramento for confirmado, definir arquivo/retention read-only com schema, grants, referências e backup preservados, antes de retirar a linha do caminho operacional. Requer plano/decisão; não excluir silenciosamente nem contornar NOT NULL com filtro.

Nenhuma alternativa foi aplicada. Contract SIGNED e billing reforçam que excluir “registro órfão” seria injustificado. Reexaminar agregados no cutover porque produção pode mudar.

## Recuperação operacional executada

[Workflow 38327968220](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38327968220), código Master `0a148602e074574394fe427ffdfe6f8019a93828`: **PASS, 192 checks de restore/segurança**; etapa histórica com escritas pós-cutover também aprovada.

Sequência real no clone:

1. Catálogo histórico completo, não fixture mínima; fase 1, bloqueio de fase 2 ambígua, decisão fictícia explícita e cutover.
2. A1/A2 recebem settings diferentes, zona A2 e pedidos/itens/histórico pós-cutover; B1 fica separado em outra organização. Colisão da PK por organização é demonstrada; nenhum downgrade realizado.
3. `recovery_freeze.sql`, **TEST ONLY** fora das migrations: gate de manutenção por trigger em tabelas neroxa_*, preservando os triggers existentes. Acesso JWT autorizado lê antes do incidente; após congelamento, RPC legítima de escrita recebe SQLSTATE 55000 e digest não muda.
4. Archive custom + companion ACL privados, SHA-256, restore em template0. **86 tabelas**, sequências, **88 FKs** sem órfãos; definições/propriedades/ACL/RLS de origem/destino equivalentes. Restore mantém gate congelado.
5. Auth próprio do destino autentica contas restauradas; tentativa autorizada de escrita continua bloqueada. Executor de recuperação retoma **apenas o destino**, origem continua congelada.
6. Matriz autenticada do destino passa. Roll-forward cria novo pedido de preço de servidor, retry gera somente um pedido, loja irmã não lê, operador legítimo consulta e avança status com histórico; settings A1/A2 seguem distintos e integridade passa.
7. Comparação confirma origem inalterada pelos testes do destino; contêineres/API/banco/archive/rede descartáveis removidos, cleanup verde.

**Limites:** falha simulada de caminho de escrita/manutenção, não crash físico nem perda de cluster; roles globais compartilhadas; drain de transações já em voo/consumidores implantados não foi exercitado. Gate TEST ONLY não deve ser instalado em produção. Auth pode continuar gravando sessões; congelamento demonstrado é das tabelas de negócio, não parada total da plataforma. Roll-forward core RPC é anterior à revogação comercial do checkout público; gateway privado é testado no outro job. Não certificar downgrade ou disaster recovery entre clusters.

## Testes realmente executados

| Check                                             | Resultado / evidência                                                                                                                                                                                                                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Master Vitest                                     | 33/33 PASS local                                                                                                                                                                                                                                                                             |
| Master lint/build/format                          | PASS local/CI; 12 warnings preexistentes no lint                                                                                                                                                                                                                                             |
| Master tsc --noEmit                               | **FAIL: 43 erros preexistentes**, mesmos módulos não alterados nesta tarefa. Não é coberto pelo build verde.                                                                                                                                                                                 |
| Delivery testes Node22                            | 37/37 PASS, quatro novos negativos do corpo                                                                                                                                                                                                                                                  |
| Delivery arquivos alterados lint                  | 0 erros, 2 warnings preexistentes de hooks no admin                                                                                                                                                                                                                                          |
| Delivery tsc/build                                | PASS local e [CI 38328351004](https://github.com/luit77yak-dev/pizza-perfect-plate/actions/runs/38328351004) no SHA `e8bd746bf6750057430a32baec54562cf06b09be`                                                                                                                               |
| Delivery lint global                              | **FAIL preexistente**: baseline 2870 erros/13 warnings; após primeiro ajuste 2815/13. Diferença de diagnósticos não-Prettier = zero novos. Não reformatamos o produto inteiro para ocultar o gate.                                                                                           |
| Auth/RLS/PostgREST + gateway + capacidade + HTTPS | [38328771985](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38328771985): **275 + 54 + 43 + 47 = 419 PASS, 0 FAIL**, com pin Delivery exato `e8bd746`                                                                                                                          |
| Recuperação/freeze/roll-forward                   | **192 PASS**, conforme workflow acima; sem DML remoto                                                                                                                                                                                                                                        |
| CI Master código final                            | [38328771975](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38328771975) e [38328775409](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38328775409) PASS; inventário [38328775406](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38328775406) PASS |
| diff --check                                      | PASS nos dois checkouts                                                                                                                                                                                                                                                                      |

CLI 2.120.0 / PostgreSQL 17.11 (`17.11.0.004`) / GoTrue v2.197.0 / PostgREST v16.4 / Node22 no Actions e contratos Delivery. Instalação local Delivery usou npm sem gerar lock novo (Bun indisponível), como CI atual; **não alegamos instalação reprodutível por lock**. Builds locais iniciais usaram Node24; CI Node22 aprovou ambos. Sem browser/celular real nesta tarefa.

Logs de jobs atuais foram lidos. JSON sanitizado de recuperação/Auth e resumos dos outros estágios estão neste diretório; artifacts privados/dumps não foram incluídos. Relatórios com classificação INCONCLUSIVO indicam release não certificado, não falha dos checks listados.

## Commits e arquivos

Master: `f48699e` freeze/roll-forward e gatilhos de dependências; `38ee887` inventário e pin; `0a14860` ACL admin + matrizes; `81f411b` pin final Delivery. Delivery: `8fe4b9f` bounded JSON/endpoints/testes/CI; `e8bd746` RPCs admin tipadas e lint de CI. Todos nas branches candidatas existentes; históricos publicados preservados.

Arquivos: tools/ab-auth/{operational_recovery.mjs,recovery_freeze.sql,restore_rehearsal.mjs,restore_security.mjs,run.mjs,inventory_delivery_consumers.py}; audits/sql/admin-order-rpc-acl.release-gate.candidate.sql; workflows históricos/integração; Delivery src/server/{bounded-json.ts,checkout-gateway.ts,order-amendment.ts}, src/routes/admin/pedidos.tsx, tests/bounded-json.test.mjs, workflow CI; documentação/evidências deste diretório. PR #36 e PR visual #35 não foram modificadas.

## Rollout coordenado e gates de aprovação

1. **Decisão comercial/titularidade da linha histórica**, reconciliação autorizada e nova leitura de catálogo/dados. Não instalar agora.
2. Selecionar contratos canônicos Master/Delivery, backend/identidades e destino do painel legado. Consolidar seletivamente #36/#37 numa branch de integração revisável; replay integral e testes ricos de catálogo/carrinho/checkout/painel. Não substituir componentes por versões antigas.
3. Homologar domínio de teste controlado e runtime efetivo Vercel, SSL/SNI/Host/Origin/forwarded headers, timeout/body/WAF/concorrência. Sem secrets públicos, sem fallback para loja real/primeira loja; verificar APIs e jobs acessíveis com seu owner.
4. Ensaiar backup restaurável, manutenção, pausa/drain de produtores/webhooks e **roll-forward**. Plano para roles/config externa e comunicação operacional; preservar pedidos antigos sem capacidade, sem reabrir append inseguro.
5. Após autorização separada: janela protegida, schema fase1/reconciliação/fase2/RLS/RPC/quotas/capacidades/ACL; deploys de leitores e consumidores compatíveis, flags privadas/públicas coordenadas, revogação das APIs antigas enquanto produtores estão congelados; smoke de duas lojas fictícias no ambiente autorizado. Não há ordem “SQL antes de todos os consumidores” segura sem janela/ponte ensaiada.
6. Retomar somente após matrizes/telemetria/integridade passarem; em falha, manter freeze, recuperar estado pós-cutover e corrigir adiante. Não voltar à PK de organização com A1/A2 divergentes. Não habilitar pagamentos nesta auditoria.

**Bloqueios decisivos:** linha histórica; consumidores/deploys legados e coexistência #36/#37; ingress/backend/autorização/abuso/integrações privilegiadas; catálogo/preços/assinaturas e recuperação operacional de consumidores reais; qualidade global Master tsc/Delivery lint. Até fechar esses gates, manter DRAFT / NO-GO.

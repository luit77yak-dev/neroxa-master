# NEROXA — Continuação da matriz F02

15/10/2026. **F02 FAIL P0: leitura e escrita anônimas confirmadas em clone. Aprovação interrompida. F01/F02 ABERTOS; Marco 01 0/7; comercial NÃO LIBERADO.**

## Resumo executivo

O pacote de origem foi recebido e validado: oito hashes SHA-256 corretos, manifesto e CSV avulsos idênticos ao ZIP. O bloqueio anterior de rastreabilidade foi resolvido. Executamos dois novos ensaios reais em Supabase descartável, sem SQL remoto. No segundo, a RPC legada permitiu ao anônimo acrescentar um produto ao pedido fictício de B por UUID+telefone, HTTP 200. Total/subtotal e soma dos itens passaram de 30 para 60; itens passaram de 1 para 2. O controle com telefone errado retornou HTTP 400/P0001 e não alterou os snapshots.

Preço adulterado 0,01 foi ignorado e o catálogo forneceu 30. Esse resultado comprova somente o preço dessa chamada indevida; não comprova fluxo financeiro legítimo, pagamento, retry de append ou recuperação. A leitura legada anônima também continuou retornando pedido privado de B, HTTP 200. Não houve nova tentativa de aprovação, compensação para ocultar a mutação ou alteração de grants. Após o probe terminal houve somente catálogo read-only e cleanup.

**Matriz final: 4 PASS parciais / 2 FAIL / 6 BLOCKED / 9 NOT RUN.** Workflow SUCCESS significa término do recorte forense, não aprovação de segurança.

## Repositórios, bases e fontes

- Master PR46, draft: branch `security/mission-02a5-integration-local-20261014`, base `a189d67f1ea49dd4e2ac14679c9bbf9cbb16e1a0`. Entrada confirmada `244bed564329fe11e4e0a3bec8bae69656e96fa6`.
- Primeiro executor: `ad3058765e6615008d2130033943b2b390f1f780`.
- Segundo executor/testado: `e86b182f0a3e4ad9c5c923be0863aa296e60af79`.
- Delivery PR42, draft, fonte fixada `4ce88959a751066f96da4cbab8d1fc9ac29bb320`, base `ad41822e4622e3b14bcb650d7be84126f78b80f6`. Nenhuma alteração nesta rodada.
- A referência Master `34de496` do pacote é histórica; a instrução posterior estabeleceu `244bed…` e a API confirmou essa entrada antes do trabalho.
- ZIP original SHA-256 `ad5ad50da872252026cdbd18d6a737fb3c6052e727015ba0a204c79687779f99`. Fontes e verificação acompanham a entrega.

## Execução e runner

| Run | Fonte Master | Resultado do executor | Resultado relevante |
|---|---|---|---|
| [38751666311](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38751666311) | ad305876… | SUCCESS; cleanup PASS | Append executado: HTTP400/22023, sem mutação; produto agrupado. Não prova autorização. Leitura F02 P0 preservada. |
| [38752338356](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38752338356) | e86b182f… | SUCCESS; cleanup PASS | Produto simples adicional na fixture, sem remover regras existentes: append anônimo HTTP200 e mutação P0. |

Repositório público verificado via API, workflow `ubuntu-latest` padrão e teste `RUNNER_ENVIRONMENT=github-hosted`. Elegibilidade sem cobrança de uso confirmada na documentação oficial GitHub Actions para repositórios públicos com runners padrão; nenhum larger runner, cache ou upload de artefatos. O workflow mede disco/RAM/CPU antes dos pulls e confere IDs das seis imagens. Node 22.23.0, CLI 2.120.0, dependências npm ci e actions por SHA.

Primeiro preflight: overlay2, 90.860.384.256 bytes livres, 15.548.817.408 bytes de memória disponível e 4 CPUs. Limite mínimo de disco 28 GiB; estimativa conservadora 26 GiB (imagens 8 + volumes 5 + dependências/logs 3 + margem 10). É estimativa de pico, não medição contínua da extração. Os dois runs passaram nos preflights.

Stack nativa: PostgreSQL, Auth, REST, Storage, Realtime e Kong, local à VM descartável, binds loopback. Testes sob UID separado com OUTPUT IPv4/IPv6 restrito a loopback e bridge Docker sem forwarding externo; controle negativo TEST-NET-2 bloqueado. Registries só na instalação anterior ao lock. Sem dotenv comercial no checkout efêmero, sem projeto Supabase remoto vinculado, sem dados reais. O processo confiável do harness usa o socket Docker para administração do clone; esse limite não isola código malicioso com acesso ao socket.

## Matriz e evidências

| Caso | Estado | Alcance comprovado nesta rodada |
|---|---|---|
| PG-01 | PASS parcial | SHAs fixados e manifesto Master, Delivery como fonte de código; não é schema unificado |
| PG-02 | BLOCKED | Catálogo Master real capturado; contrato integrado e adaptação enum/text não validados |
| PG-03 | FAIL P0 | Status privado de B acessível ao anônimo por UUID+telefone, HTTP200 |
| PG-04 | FAIL P0 | Append anônimo em B com mutação de pedido e itens, HTTP200 |
| PG-05 | PASS parcial | Checkout RPC efetivo → emissão de token → adapter HTTP; não TanStack E2E |
| PG-06 | PASS parcial | Onze cenários comprador: positivo, token ausente/falso, B/C, Origin/proxy, expiração, revogação e quotas |
| PG-07 | PASS parcial | Staff sem grant PATCH B zero linhas/digests estáveis; admin B SELECT/UPDATE próprios positivos |
| PG-08 | BLOCKED | Digests ampliados para o probe e sessões, mas sem cobertura integrada completa/T1 |
| PG-09 | BLOCKED | Backend efetivo e responsáveis de consumidores ainda UNKNOWN |
| GT-01..03 | BLOCKED | Sem recibos legítimos por owner+versão+ambiente; gate não aplicado |
| PO-01..09 | NOT RUN | Pós-gate não autorizado nem executado |

Os 17 checks herdados do recorte geraram 14 PASS/3 FAIL (incluem os ataques de baseline). Os onze cenários comprador tiveram PASS. O novo append é registrado separadamente em `append-summary.json`, não escondido nos totais herdados. A matriz de 21 casos é uma classificação de critérios, não contagem de chamadas.

Identidades reais Auth de teste: admin A/B/C, staff grant A, staff sem grant e comum, incluindo MFA dos staff; tokens não constam na entrega. O anônimo utiliza a chave anon descartável, nunca service_role. UIDs e respostas de identidade estão no resumo e CSV de operações. Service_role é reservado às ações de fixture e servidor, não simula usuários comuns.

Admin A: pedido próprio visível, B/C retornam zero registros com digests estáveis. Staff sem grant: PATCH B retorna zero registros; admin B autorizado retorna uma linha. Esses controles parciais não provam SELECT/INSERT/UPDATE/DELETE de todos os recursos nem substituem Storage/Realtime.

No append P0, somente `public.neroxa_orders` e `public.neroxa_order_items` mudaram nos digests de negócio; Storage e demais tabelas capturadas ficaram estáveis. `auth.sessions` também permaneceu estável. A quota durável é auditada separadamente nos testes comprador e excluída do digest de negócio; não afirmar ausência absoluta de efeitos em subsistemas não capturados.

## Catálogo e compatibilidade PG-02

Catálogo real Master confirma owner postgres e SECURITY DEFINER:

- `get_public_order_status(uuid,text)`: EXECUTE anon/authenticated/service_role.
- `append_public_order_items_with_payment(uuid,text,jsonb,text)`: mesmos acessos, com mutação anônima comprovada.
- `neroxa_recover_group_order(uuid,uuid,jsonb)`: somente service_role entre esses três papéis; wrapper ainda depende da função legada. Não foi exercitado funcionalmente nesta rodada.
- Registro e tracking por capability: service_role permitido, anon/authenticated negados no catálogo e no recorte de RPC direta.

ACL explícita, grants efetivos, herança, defaults e views constam em `catalog.json` e `PG02-CONTRATO-CANDIDATO.json`. Defaults de funções public continuam permissivos nos owners observados. Zero views encontradas no escopo literal da consulta não exclui SQL dinâmico.

No Delivery derivado histórico existem o append simples e o overload `public.payment_method`; no Master observado há o overload text. Ausência no Master não é revogação no Delivery. Não concatenamos migrations nem instalamos assinatura adicional para fabricar compatibilidade. O contrato preparado declara perfil Master + código Delivery fixado, mas sua integração completa permanece BLOCKED até resolver adaptação e consumidores/wrappers.

Migration 18: original `c8bd4de06fbc31d8b4c3b082e27c9b9da0dac58fcf2d2f238d68e01134b78668`; derivado `d2da1a67c5f7b7f9390f77c831a16b9a794b0e64d80a82e0ce33b07114cdd85a`. Derivação por `v_crust` inexistente reproduzida nesta rodada somente em memória para conferir hashes, sem SQL Delivery novo. O histórico foi preservado. Compilação não valida o caminho `v_size` ou financeiro.

## Consumidores e demos

Metadados Vercel atuais reconciliados: 14 aliases/11 deployments, dez previews adicionais (9 READY/1 ERROR), todos os IDs/SHAs do inventário encontrados. Creator-account confirmado não é responsável técnico. Backend binding, ambiente runtime e tráfego seguem UNKNOWN: não foram lidos secrets, valores de env, URL efetiva de banco, tokens, logs de aplicação ou dados reais.

food/mvp e dois aliases técnicos compartilham o deployment `dpl_7Ctmw4c8JgZEXh8qJVzW5jjqL4Ho`, SHA `47e7d8aef66b0c458ed6f423cebeba99abfcc7a8`. Demos internos legados, sem autorização para alterar. Opções documentadas: manter com restrição verificável, suspender coordenadamente, substituir após homologação. Decisão exclusiva do fundador por domínio; nenhuma opção executada.

As branches candidatas foram consultadas com filtros exatos: zero deployments observados nas verificações desta rodada. deploymentEnabled=false preservado. Outros deployments históricos não são novos deploys desta missão.

## Arquivos alterados e PRs

PR46 atualizada com dois commits, sem reescrever histórico:

- Workflow pré-gate: acrescenta probe terminal e proveniência SHA/run.
- `append-pre-gate.mjs`: fixture de produto simples, chamadas reais anon, antes/depois e preço.
- `extend_pre_gate.py`: extensão explícita do bootstrap gerado, sem editar o original.
- Emissor da matriz: PG-04 baseado em execução; falha funcional sem prova de autorização vira BLOCKED, acesso indevido vira FAIL P0.
- Contratos selecionados da Coordenação e escopo documentado; bytes originais preservados.

PR42 Delivery não modificada; nenhuma nova PR criada. As duas permanecem draft. Relatório e patch completos acompanham a entrega. Não houve SQL candidato novo nem alteração dos SQLs de gate.

## Testes locais e limitações

PASS: sintaxe Node do módulo e bootstrap gerado; compilação Python; integridade do manifesto (27 unidades, somente estático); hashes de origem/derivação. `git diff --check` sinalizou CRLF dos dois CSVs de origem, preservados para manter seus hashes; os demais arquivos passaram no check focalizado. Não normalizar fontes de auditoria silenciosamente.

NOT RUN nesta rodada: build/lint/TypeScript e suíte frontend completa (sem alteração de produto), Chromium/TanStack hidratado, checkout concorrente de primeira chamada, pagamento/append legítimo e seu retry, overloads Delivery, Storage upload/CRUD, Realtime/logout/reconnect e recuperação T1. Sem inventar bloqueio ambiental: a stack existe; a aprovação do candidato parou nos P0 e a cobertura ampliada ainda precisa de implementação/execução. O browser antigo não foi reativado.

Não há comprovação de isolamento integral A/B/C. Staff sem grant foi negado somente no recorte real registrado. Nenhum dos perfis foi promovido como candidato integrado aprovado.

## Riscos e correções prioritárias

- **P0 confirmado:** status por telefone revela pedido privado; append por telefone altera pedido/itens de B sem login. Não receber cliente real com esses caminhos acessíveis.
- **P1 bloqueio de prontidão:** compatibilidade integrada text/enum/wrapper, consumidores distribuídos e substituto financeiro seguro sem validação suficiente.
- **P1 cobertura pendente:** TanStack hidratado, Auth/Storage/Realtime e T1 completos. Não equivale a vulnerabilidade nova confirmada nesses recursos.
- **P2 operacional:** capability em memória e quota compartilhada por domínio continuam limitações conhecidas; não ensaiadas além do recorte descrito.

Menor próximo incremento seguro: definir o contrato único de backend/assinaturas e preparar operação de alteração de pedido por instância/capability com preço autoritativo, idempotência e histórico, sem reparar o legado de modo a ampliar sua exploração. Migrar o wrapper service-only e os consumidores com testes positivos/negativos. Somente após recibos legítimos discutir autorização separada de gate em clone. Não revogar RPCs nesta missão para simular encerramento.

## Recuperação e próxima decisão

Recuperação efetivamente executada: descarte dos clones, sem dumps, sem restaurar grants inseguros. T1, falha pré-commit e roll-forward pós-commit continuam NOT RUN. Não reativar StaffPanel como rollback.

Coordenação: atribuir responsáveis e obter provas não secretas de versão/ambiente/binding dos consumidores; priorizar substituto seguro para leitura e append e contrato integrado. Fundador decide separadamente os demos. Manter F01/F02 abertos e não liberar operação comercial. Nenhum recibo CONSUMER-DISABLEMENT, GUC artificial, gate, merge, deploy, DNS, SQL remoto ou dado real foi utilizado.

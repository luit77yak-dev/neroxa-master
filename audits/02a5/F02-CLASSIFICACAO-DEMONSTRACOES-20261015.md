# NEROXA — F02: classificação operacional dos domínios de demonstração

**Data:** 15/10/2026  
**Fonte da decisão:** Coordenação Geral, confirmação expressa do fundador quanto à finalidade dos domínios.  
**Escopo:** auditoria e documentação, **sem autorização** para alterar DNS, alias, domínio, deploy, banco, grants, PRs para review ou serviços contratados.  
**Resultado recomendado:** AVANÇAR COM RESTRIÇÕES na auditoria; **NÃO AVANÇAR** com cutover ou revogação.

## Decisão operacional confirmada

| Domínio | Classificação inequívoca | Finalidade reconhecida | Responsável decisório | Situação técnica |
| --- | --- | --- | --- | --- |
| `food.neroxa.ia.br` | **DEMONSTRAÇÃO INTERNA — LEGADO DISTRIBUÍDO** | Demonstração/testes internos, não pizzaria contratante | **Fundador da Neroxa** — autoriza qualquer alteração/desativação | Alias Vercel existente; versão legada no deployment associado |
| `mvp.neroxa.ia.br` | **DEMONSTRAÇÃO INTERNA — LEGADO DISTRIBUÍDO** | Demonstração/testes internos, não pizzaria contratante | **Fundador da Neroxa** — autoriza qualquer alteração/desativação | Alias Vercel existente; versão legada no deployment associado |

**A classificação comercial não equivale a ausência de visitas, pedidos ou vulnerabilidade.** Não houve consulta de telemetria, tráfego, pedidos, clientes nem logs contendo dados pessoais.

## Identificadores rastreáveis — metadados somente leitura

- Projeto Vercel Delivery: `prj_aQYU9XxLKwk8AkDIcOmkrLAwPfza`.
- Ambos os aliases são retornados sem `deletedAt` e apontam para `dpl_7Ctmw4c8JgZEXh8qJVzW5jjqL4Ho` / `pizza-perfect-plate-nn9wvv4h6-neroxa2.vercel.app`.
- Deployment etiquetado `production` e `READY` nos metadados do projeto, associado ao código Delivery `47e7d8aef66b0c458ed6f423cebeba99abfcc7a8`.
- No referido SHA, `src/components/storefront/Storefront.tsx` contém duas chamadas a `get_public_order_status` com `p_customer_phone` e `src/features/storefront/components/CheckoutPanel.tsx` contém chamada a `append_public_order_items_with_payment` com telefone.
- Os aliases de projeto/branch da Vercel podem compartilhar um deployment; não classificá-los automaticamente como clientes ou integrações externas independentes.
- **Não confirmado:** visitas recentes, consumo real de RPC, conexões terceiras, client versions fora da Vercel, redirecionamentos intermediários, tráfego ou ausência de dados reais.

## Diferença entre consumidor distribuído e candidato

- Código distribuído dos dois demos: **LEGADO DISTRIBUÍDO**, funções inseguras ainda referenciadas.
- Delivery [PR #42](https://github.com/luit77yak-dev/pizza-perfect-plate/pull/42), SHA `4ce88959a751066f96da4cbab8d1fc9ac29bb320`: substituição preparada no **candidato**, não implantada nos aliases.
- Master [PR #46](https://github.com/luit77yak-dev/neroxa-master/pull/46), SHA base documental `ad5343a73a0e153002c955862a33051d4efb4e59`: contém auditorias e candidatos SQL, todos em draft, sem merge/deploy.
- [Runner comprador pré-gate 38665665942](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38665665942): caminho privado aprovado no recorte sintético; chamada antiga anônima ainda reproduziu P0.
- [Runner catálogo pg_proc 38672488319](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38672488319): em clone Master `get_public_order_status(uuid,text)` e `append_public_order_items_with_payment(uuid,text,jsonb,text)` ainda concedem EXECUTE efetivo a anon/authenticated. Terceiro nome `append_public_order_items` ausente apenas nesse perfil. Não equivale a revogação do catálogo Delivery histórico.

## Inventário classificado e responsabilidade

| Grupo | Estado de consumidor | Evidência conhecida | Responsável |
| --- | --- | --- | --- |
| `food.neroxa.ia.br`, Storefront e checkout distribuídos | **DEPENDENTE — DEMONSTRAÇÃO INTERNA / LEGADO DISTRIBUÍDO** | Alias → deployment → SHA → calls históricas | Fundador para autorização de domínio; executor técnico do rollout A DEFINIR |
| `mvp.neroxa.ia.br`, Storefront e checkout distribuídos | **DEPENDENTE — DEMONSTRAÇÃO INTERNA / LEGADO DISTRIBUÍDO** | Mesmo deployment, consumidores antigos | Fundador para autorização de domínio; executor técnico do rollout A DEFINIR |
| Storefront no PR Delivery #42 | MIGRADO **no código candidato**, não em domínio | Chamadas `readPrivateTracking` no candidato | Engenharia Neroxa; implantação NÃO autorizada |
| CheckoutPanel no PR Delivery #42, append legado | DESATIVADO **no componente candidato**, não na versão distribuída | Sem fallback por UUID/telefone no componente auditado | Engenharia Neroxa; fluxos financeiros integrados pendentes |
| Testes históricos/ensaios de migração | DEPENDENTE de atualização ou fixture pré-gate | [Scanner 38670223632](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38670223632) | Engenharia Neroxa |
| URLs/instalações/integrações externas não identificadas | **UNKNOWN** | Nenhuma evidência completa de inexistência, operação ou migração | Coordenação deve identificar responsável |
| RPCs SQL, wrappers `SECURITY DEFINER`, overloads Delivery/Master | DEPENDENTE de revogação segura em perfil compatível | Catálogo Master parcial; código histórico Delivery e wrapper de recuperação | Engenharia Neroxa |

**Importante:** dois domínios que apontam ao mesmo deployment não representam duas versões de aplicativo. Não duplicar consumidor técnico ao contabilizar coverage.

## Gatilhos que permanecem bloqueados

- `CONSUMER-DISABLEMENT.json` **NÃO CRIADO**. Finalidade interna/ausência de contrato não satisfaz prova técnica de desativação.
- `neroxa.legacy_phone_consumers_disabled=on` **NÃO SETADO** para liberar gate.
- Revogação SQL no clone **BLOCKED pelas pré-condições de consumidores**; testes pós-gate **NOT RUN**.
- Alteração de domínios/deploys/serviços remotos **NÃO AUTORIZADA** e não realizada.
- Desligar a interface não impede chamadas diretas à API legada enquanto GRANT EXECUTE continuar existindo; mitigação de superfície de UI e fechamento do F02 são decisões distintas.

## Encaminhamento solicitado

1. Coordenação: confirmar responsáveis/versões/ambientes de **demais** consumidores externos. Ausência de comprovação continua `UNKNOWN`.
2. Fundador: autorizar **separadamente**, quando decidir, manutenção, desativação ou substituição de cada demonstração e o efeito sobre aliases/deploys.
3. Engenharia: ensaiar versões reais **exclusivamente** em clone com dados fictícios; validar pré-gate → gate → pós-gate só após prova verificável das pré-condições, incluindo positivos privados e integridade dos dados.
4. Se falhar pós-cutover, preservar bloqueio, corrigir por roll-forward seguro; jamais reativar RPC de telefone ou StaffPanel.

**F01/F02: ABERTOS. Marco 01: 0/7. Operação comercial: NÃO LIBERADA.**

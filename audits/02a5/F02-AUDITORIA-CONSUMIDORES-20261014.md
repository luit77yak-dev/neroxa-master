# NEROXA — Auditoria F02 de consumidores e plano de revogação (14/10/2026)
 
**Engenharia, revisão documental em draft. Não é homologação de banco.** F01/F02 ABERTOS; comercial NÃO LIBERADO; Marco 01 = 0/7. Nenhum SQL/deploy/merge nesta revisão.

## Fontes fixadas e evidências
- Delivery [PR #42](https://github.com/luit77yak-dev/pizza-perfect-plate/pull/42) HEAD `4ce88959a751066f96da4cbab8d1fc9ac29bb320`.
- Master [PR #46](https://github.com/luit77yak-dev/neroxa-master/pull/46) HEAD antes deste documento `6526c523c5c402cade46ab14e1353343d3edfeb7`.
- [Ensaio comprador 38665665942](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38665665942), Master código `4e570b8bd0b2460ce1242d2c1859aa88ac7b37c4`: tracking privado positivo no recorte, **F02 P0 confirmado** ao final via acesso anônimo UUID+telefone. CI success NÃO equivale a autorização de release.
- ZIP final Codex: 142/142 hashes locais conferidos. `INTEGRATED-MANIFEST.json`: 27 unidades passaram no verificador offline (sem comprovar origem Git no ZIP); `--release-ready` permanece BLOCKED pela ausência de `CONSUMER-DISABLEMENT.json`. Nenhum ensaio SQL novo.

## Consumidores conhecidos: situação atual
| Caminho/contrato | Situação, sem extrapolar |
|---|---|
| Delivery `Storefront.tsx` em 2 chamadas `readPrivateTracking` | SUBSTITUÍDO no candidato em fonte inspecionada; E2E comprador completo pendente |
| Delivery `CheckoutPanel.tsx` | Recebe `tracking_token` e o mantém em memória; append legado removido no componente; checkout flag/caminho alternativo e cobrança ainda não homologados |
| `checkout-gateway.server.ts` / `tracking-issuance.ts` | Emissão token 32 bytes e hash após pedido; positivo parcial em runner descartável; retry/perda de resposta e fluxo TanStack não completos |
| `private-tracking-backend.ts` / `private-tracking.server.ts` / `/api/order-track` | HEAD atual habilita **apenas homologação descartável**; inventário histórico em `handoff/CONSUMIDORES-F02-FINAL.md` que diz adapter OFF está desatualizado |
| `order-amendment.server.ts` / `/api/order-recover` | Contratos distintos; append seguro e recuperação de token de tracking pendentes; NÃO utilizar UUID+telefone como fallback |
| SQL Delivery `get_public_order_status(uuid,text)` | SECURITY DEFINER com comparação de telefone e GRANT EXECUTE a anon/authenticated no SQL histórico; exposição real no clone registrada |
| SQL Delivery `append_public_order_items_with_payment(uuid,text,jsonb,payment_method)` | SECURITY DEFINER e GRANT anon/authenticated no SQL versionado, chama `append_public_order_items`; descobrir assinaturas vivas no clone |
| Master `phone-rpc-quarantine.release-gate.sql` | Gate candidato ENUMERA overloads de tracking/append, revoga EXECUTE PUBLIC,anon,authenticated e verifica `has_function_privilege`. **NÃO APLICADO na revisão** |
| consumidores externos/aplicativos/URLs preexistentes | UNKNOWN / NÃO VERIFICADO. Proíbem emitir recibo universal de desativação |

## Gate de segurança — não falsificar
- `neroxa.legacy_phone_consumers_disabled=on` é uma **asserção** do executor, não evidência de que aplicativos externos migraram; não ajustar esse GUC ou criar `CONSUMER-DISABLEMENT.json` sem inventário real por consumidor, proprietário, deploy/feature flag e teste de substituto.
- Revogar todos overloads (não uma assinatura fixa) e verificar grants herdados, PUBLIC, funções/views definer e defaults. Não restaurar grants legados como rollback.
- Se não há alternativa homologada, manter consumidor antigo indisponível. Não acessar banco remoto.
- A varredura completa de todos os `src/` e scripts com `rg` e o levantamento de consumidores distribuídos ainda são **PENDENTES**; esta revisão inspecionou arquivos-chave e documentação, não todo o checkout executável.

## Ensaio mínimo a executar somente em clone
1. Fixar hashes/SHAs, stack local Auth/Postgres/REST/Storage/Realtime e identidades O1:A/B, O2:C. Sem service_role simulando usuário.
2. Baseline: anon UUID+telefone recebe B (falha histórica), buyer A capability recebe A com projeção mínima (positivo). Capturar digests.
3. Revisar inventário de consumidores. Se qualquer consumidor não comprovado, **BLOCKED**, sem fabricar recibo. Para um ensaio condicionado e explícito em ambiente inteiramente fictício, documentar a desativação real dos consumidores da fixture.
4. Aplicar gate apenas em transação local, verificar `has_function_privilege` falso para anon/authenticated em **todas** assinaturas; HTTP/RPC antiga negada sem efeito.
5. Preservar buyer privado A200 e negações A→B/C, token incorreto/expirado/revogado, quota separada. Confirmar F01 staff sem grant PATCH B zero linhas e dados intactos; positivos admin B.
6. Compatibility E2E checkout TanStack→confirmação→capability→HTTP; negação dos caminhos antigos, append desabilitado ou capability validada, Auth/Storage/Realtime conforme manifesto único.
7. Falha pré-commit: ROLLBACK transacional; pós-commit: manter isolamento/suspensão e roll-forward seguro, **nunca** grant inseguro/StaffPanel. T1 permanece plano separado.

## Veredito
**AVANÇAR COM RESTRIÇÕES.** Inventário estático e plano documentados; teste pós-gate, resultado integrado, consumidores externos e recuperação forte NÃO APROVADOS. A Coordenação deve validar plano de migração/consumidores e autorizar próximo ensaio isolado dentro das restrições existentes.

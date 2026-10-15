# NEROXA — F02: resultado SEC-17 e recuperação segura em clone (15/10/2026)

**Parecer:** AVANÇAR COM RESTRIÇÕES para preparação da correção. **F01/F02 ABERTOS; Marco 01: 0/7; comercial NÃO LIBERADO.** Não é cutover/homologação.

## Evidência executada (novo resultado)
- [GitHub Actions 38783768679](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38783768679) `SUCCESS`, SHA fonte Master de teste `429935588a10b1fabcf5e6cba939e9d8f493f9ec`; Delivery fixado `011275488660bfa1a9271b3e4c92e457f7638e34`. GitHub-hosted runner, PostgreSQL/Supabase/Auth/HTTP locais, lojas fictícias A/B/C, sem dados reais ou produção.
- Relatório provisório SEC-01..18: **15 grupos PASS, 2 FAIL (P0 de leitura e append por UUID+telefone), 1 BLOCKED (gate oficial)**. Total **44 observações de casos** incluindo repetições por ator e contexto, não 44 critérios de homologação.
- SEC-17: Host/Origin/forwarded inválidos negados com HTTP 403. Após migrar a fixture para o modo `GROUP_ADDONS_V1`, a **quinta solicitação válida HTTP 200** foi validada com `added_amount=31` e `payment_state=NOT_SETTLED`, incrementos de item/operação/histórico em uma unidade e reconciliação financeira. **Sexta solicitação válida, chave de idempotência distinta: HTTP 429**, com digests do negócio e sessão sem mudança.
- Recuperação sem telefone: REC-01 retorno legítimo service-only HTTP 200; REC-02 acesso direto anon HTTP 401 e admin_A HTTP 403; REC-03 troca para loja B HTTP 403; REC-04 adulteração de payload HTTP 403; REC-05 sessão expirada HTTP 410.
- SEC-18: `BLOCKED` verdadeiro; sem `CONSUMER-DISABLEMENT.json`, sem GUC artificial ou aplicação do gate; pós-gate **NOT RUN**.
- Cleanup do projeto descartável **PASS**.

## Limites materiais
1. Cinco unidades SQL do manifesto aplicadas a partir dos originais; a sexta, `audits/02a5/recovery-without-phone.candidate.sql`, foi corrigida em memória **somente neste ensaio** após SHA original verificado. Hash derivado registrado: `b1ef02f71a9d087ef5bec59e93406f142e2bad5bec0e870e2b652904c3c307c4`. **Não** é prova da instalação do SQL fonte exato nem da equivalência de release.
2. O ensaio valida adaptador HTTP e RPC em clone, **não** o fluxo checkout TanStack hidratado, Storage/Realtime/logout completos, migração de consumidores externos, perfis integrados completos, T1 ou compatibilidade pós-gate.
3. As RPCs antigas continuam permitindo leitura e alteração anônima no baseline fictício; `SUCCESS` do runner **não** significa segurança do legado ou liberação comercial.
4. Recuperação sem telefone legítima funciona no recorte do candidato, mas ainda depende da correção definitiva do SQL com atualização de manifesto e nova execução exata.
5. [Run anterior 38774169683](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38774169683): SEC-17 falhou com HTTP 400 porque a quinta requisição usou item plain quando `GROUP_ADDONS_V1` estava ativado. Não era prova da cota. Histórico preservado.

## Decisão seguinte da Coordenação / Engenharia
- Corrigir o **arquivo SQL candidato original** da função de recuperação (delimitador `$function$` extra), criar nova versão assinada/manifesto com SHA256 atualizado e executar **instalação exata** em clone. Não alterar migrations históricas nem remoto; não saltar hashes.
- Reexecutar SEC-01..18/REC-01..05 com SHAs fixos, checagens de autorização, pricing/idempotência/concorrência e reconciliação financeira. Preservar o P0 baseline até a correção e revogação coordenada verdadeiras.
- Preparar compatibilidade dos consumidores distribuídos e das RPCs/overloads/wrappers; com os backends efetivos dos previews e integrações extras ainda `UNKNOWN`, gate **BLOCKED** e pós-gate **NOT RUN**.
- Planejar mitigação dos demos sob decisão específica do fundador; não alterar domínios ou deploys.
- Continuar testes completos de checkout browser, Storage, Realtime/logout, F01 A/B/C e integridade/T1 em ambiente descartável. Não promover PASS parcial a homologação.

**Não executado nesta rodada:** merge, deploy, alteração DNS/aliases, SQL remoto, dados reais, contratação, revogação, reativação de grants ou StaffPanel.

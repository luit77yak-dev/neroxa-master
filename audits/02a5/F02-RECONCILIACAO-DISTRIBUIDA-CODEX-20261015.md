# NEROXA — F02: 10 previews, contrato SQL e ensaio integrado em preparação

**15/10/2026. Coordenação: AVANÇAR COM RESTRIÇÕES.** F01/F02 ABERTOS; Marco 01 0/7; comercial NÃO LIBERADO. Alteração **exclusivamente documental**, sem autorizar gate/cutover.

## Inventário distribuído, revisão read-only
- Projeto Vercel Delivery `prj_aQYU9XxLKwk8AkDIcOmkrLAwPfza`: **14 aliases / 11 deployments**, incluindo **10 previews separados** (9 READY, 1 ERROR). Metadados Vercel desses dez registram creator account `luit77yak-9747`; isso **não** confirma responsável técnico de cada aplicação.
- Duas demonstrações internas `food.neroxa.ia.br` e `mvp.neroxa.ia.br` e dois aliases técnicos compartilham o mesmo deployment `dpl_7Ctmw4c8JgZEXh8qJVzW5jjqL4Ho`, SHA `47e7d8aef66b0c458ed6f423cebeba99abfcc7a8`. Fundador decide qualquer alteração/desativação; nenhuma foi efetuada.
- No recorte dos arquivos `src/components/storefront/Storefront.tsx` e `src/features/storefront/components/CheckoutPanel.tsx` dos dez SHAs, **9/10** referenciam literalmente `get_public_order_status` ou `append_public_order_items_with_payment`. Isso não prova chamada ativa, operação, ou backend compartilhado. Em um SHA não foi encontrada referência nesses dois arquivos; não implica migração.
- Leitura do `src/integrations/supabase/client.ts` nos **10 SHAs** confirmou contrato de configuração com `VITE_SUPABASE_URL`, `SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_PUBLISHABLE_KEY` e fallbacks conforme fonte. **Binding efetivo por deployment é UNKNOWN**: não foram acessados valores de env, secrets, tráfego, dados reais, logs ou DB remoto; não presumir que os dez previews usam a mesma base.
- Alias técnico ≠ cliente; conta criadora ≠ owner funcional; deploy READY ≠ prova de uso ou exposição real. Outras integrações permanecem UNKNOWN.

## Diferença SQL Master × Delivery (provas anteriores)
- [Master run 38672488319](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38672488319), executor SHA `5b75620e6853b99c301cf10e177a7b8d3f78701f`, catálogo pré-gate real em clone: `get_public_order_status(uuid,text)` e `append_public_order_items_with_payment(uuid,text,jsonb,text)`, ambos SECURITY DEFINER e EXECUTE efetivo anon/auth. `append_public_order_items` ausente apenas nesse perfil. Wrapper service-only `neroxa_recover_group_order` menciona a RPC de status.
- [Delivery run 38678827509](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38678827509), executor SHA `fb0a3215ac3f40606250dac33ed8ca7c06b16150` e fonte PR42 `4ce88959a751066f96da4cbab8d1fc9ac29bb320`: catálogo de **clone derivado**, 31 migrations; `get_public_order_status(uuid,text)`, `append_public_order_items(uuid,text,jsonb)`, `append_public_order_items_with_payment(uuid,text,jsonb,public.payment_method)` com SECURITY DEFINER e EXECUTE anon/auth. **Não é replay literal e não substitui teste integrado.**
- Migration 18 original SHA256 `c8bd4de06fbc31d8b4c3b082e27c9b9da0dac58fcf2d2f238d68e01134b78668`; derivado in-memory `d2da1a67c5f7b7f9390f77c831a16b9a794b0e64d80a82e0ce33b07114cdd85a`. Preservar ambos e a falha original `v_crust`; não editar histórico como se fosse migration incremental.

## Próximo ensaio e gate
- Preparar candidato compatível sem concatenar perfis diferentes. Executar testes **pré-gate** em Supabase/PostgreSQL local descartável, identidades fictícias O1:A/B, O2:C, Auth real de teste, checkout → capability 32 bytes → tracking HTTP, negativas de token e F01, Storage/Realtime/logout, append/financeiro, digests e cleanup.
- Proteger de rede externa/serviços reais/custos; controlar SHA/manifesto/runner, logs sanitizados e rollback. Carimbar PASS/FAIL/BLOCKED/NOT RUN individualmente.
- Como consumidores instalados e externos ainda não têm recibos verificáveis, **F02 GATE = BLOCKED, pós-gate NOT RUN**. Não gerar `CONSUMER-DISABLEMENT.json`, não setar `neroxa.legacy_phone_consumers_disabled=on` sem prova, não revogar grants ainda nem recriar EXECUTE inseguro.

## Proposta de demos — não executar
Fundador decidirá **separadamente por domínio** preservar temporariamente sob restrição, suspender de forma controlada ou substituir após homologação e autorização expressa. Quatro aliases do deployment principal devem ter impactos avaliados. Suspensão da UI não remove permissões de RPC do banco.

## Integridade e limitações
Esta revisão consultou exclusivamente GitHub/Vercel metadata/source em SHAs fixos, e preparou plano/handoff para Codex. **Nenhum novo teste integrado PostgreSQL nem gate foi executado nesta rodada**. Não houve deploy, merge, DNS, SQL remoto, dados reais, cliente ou contratação.

**Recomendação:** CONTINUAR COM RESTRIÇÕES na engenharia; não abrir cutover, não fechar F01/F02.

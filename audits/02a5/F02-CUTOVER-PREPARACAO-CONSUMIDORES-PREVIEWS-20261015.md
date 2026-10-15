# NEROXA — F02: reconciliação de catálogo e inventário de versões distribuídas (15/10/2026)

**Parecer:** AVANÇAR COM RESTRIÇÕES na preparação. **Não autoriza cutover, deploy, DNS, merge, GUC artificial nem SQL remoto.** F01/F02 abertos; Marco 01 0/7; comercial não liberado.

## Evidências já executadas, sem extrapolar

- [Master pg_catalog pré-gate — runner 38672488319](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38672488319), source SHA `5b75620e6853b99c301cf10e177a7b8d3f78701f`: duas funções legadas com EXECUTE anon/authenticated, função de recuperação service-only menciona status antigo. Não houve revogação.
- [Delivery pg_catalog — runner 38678827509](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38678827509), executor SHA `fb0a3215ac3f40606250dac33ed8ca7c06b16150` e Delivery PR42 SHA `4ce88959a751066f96da4cbab8d1fc9ac29bb320`: 31 migrations **em perfil derivado**, três RPCs antigas com EXECUTE anon/authenticated. Não houve revogação.
- Replay **literal** Delivery [38678295109](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38678295109) FAIL na migration 18 por `v_crust` não declarada; replayer inicial [38678607741](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38678607741) FAIL por escape; replay DERIVADO bem sucedido preserva o original. SHA256 original migration 18 `c8bd4de06fbc31d8b4c3b082e27c9b9da0dac58fcf2d2f238d68e01134b78668`, derivado `d2da1a67c5f7b7f9390f77c831a16b9a794b0e64d80a82e0ce33b07114cdd85a` (valores dos logs, não recalculados aqui).

## Delta de assinaturas

| Objeto | Master em clone | Delivery derivado em clone |
|---|---|---|
| `get_public_order_status(uuid,text)` | definer + anon/auth EXECUTE | definer + anon/auth EXECUTE |
| `append_public_order_items(uuid,text,jsonb)` | ausente apenas neste perfil | definer + anon/auth EXECUTE |
| `append_public_order_items_with_payment(uuid,text,jsonb,text)` | definer + anon/auth EXECUTE | não observada neste perfil |
| `append_public_order_items_with_payment(uuid,text,jsonb,public.payment_method)` | não observada neste perfil | definer + anon/auth EXECUTE |
| `neroxa_recover_group_order(uuid,uuid,jsonb)` | wrapper service-only que chama a função antiga de status | não identificado no recorte |
| Default privilege FUNCTION no schema `public` | EXECUTE anon/auth observado | EXECUTE anon/auth observado |

Nenhum dos dois catálogos é prova de um perfil integrado aprovado. Não assumir que a ausência de um overload num perfil revogou outro. Não relatar teste pós-gate como realizado.

## Consumidores distribuídos: reconciliação adicional de metadados

- `food.neroxa.ia.br` e `mvp.neroxa.ia.br`: **DEMONSTRAÇÃO INTERNA — LEGADO DISTRIBUÍDO**, decisão do fundador exigida para alteração. Ambos e dois aliases técnicos de domínio Vercel apontam para **um** deployment `dpl_7Ctmw4c8JgZEXh8qJVzW5jjqL4Ho`, SHA `47e7d8aef66b0c458ed6f423cebeba99abfcc7a8`. Sem inferir atividade/tráfego.
- Consulta read-only ao projeto Delivery identifica **14 aliases → 11 deployments**. Dez aliases de preview correspondem a dez deployments adicionais; nove `READY`, um `ERROR`. No recorte de dois arquivos (`Storefront.tsx` e `CheckoutPanel.tsx`) dos dez SHAs, **nove versões mencionam pelo menos uma RPC antiga**. Isso não comprova uso, integração com o mesmo banco ou exposição efetiva do deployment atual.
- Não publicar aqui lista completa de URLs de preview; inventário detalhado de acesso controlado está no pacote de passagem da engenharia. Todo consumidor/integração não confirmado fica `UNKNOWN`, com dono, versão, ambiente e evidência pendentes.

## Plano de suspensão, nunca execução nesta fase

- Engenharia Delivery prepara três alternativas por demonstração: preservar temporariamente sob risco documentado, suspender com aviso neutro/segurança, ou substituir por candidato homologado. Rever efeito dos quatro aliases do deployment compartilhado e dos dez previews em decisões distintas.
- Fundador tem **autoridade exclusiva** de mudança de `food` e `mvp`; nenhuma autorização de alteração/domínio foi emitida. Engenharia de Segurança audita RPCs e ensaios; Coordenação acompanha riscos/homologação.
- Desligar um site **não** remove grants de Postgres nem revoga chamadas diretas à RPC.

## Gate e critérios estritos

- Inventário de apps externos, previews e outros consumidores ainda `UNKNOWN`; **não criar** `CONSUMER-DISABLEMENT.json` nem forçar `neroxa.legacy_phone_consumers_disabled=on`.
- Matriz preparada: pré-gate → gate → pós-gate em **clone descartável**; controle positivo tracking por capability, negativos das RPCs antigas em todos os overloads, Auth/RLS A/B/C, grants efetivos, wrappers/service-only, checkout/append financeiro, dados preservados, recuperação.
- `GATE=BLOCKED`; `POST-GATE=NOT RUN`. Nunca restaurar GRANT UUID+telefone ou StaffPanel como rollback. Cutover/prod e release comercial proibidos.

**Resultado desta rodada:** inventário de metadados e inspeção de fonte **read-only**, planejamento e documentação. Sem modificar aliases, deployments, SQL remoto, clientes reais ou custos adicionais.

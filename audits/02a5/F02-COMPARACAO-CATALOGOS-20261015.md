# NEROXA — F02 | Comparação de catálogos Master × Delivery e demos legados
**Data:** 15/10/2026. **Coordenação:** AVANÇAR COM RESTRIÇÕES. **Estado:** F01/F02 abertos; Marco 01 0/7; comercial NÃO LIBERADO.

## Identidade de distribuição e decisões
- Fundador: aprovação EXCLUSIVA de qualquer mudança em `food.neroxa.ia.br` ou `mvp.neroxa.ia.br`. Engenharia Delivery: plano de transição. Engenharia Segurança: ACL/RPCs e ensaios em clone. Coordenação: riscos e critérios.
- Ambos são DEMONSTRAÇÃO INTERNA — LEGADO DISTRIBUÍDO, aliases do MESMO deployment Vercel `dpl_7Ctmw4c8JgZEXh8qJVzW5jjqL4Ho`, SHA Delivery `47e7d8aef66b0c458ed6f423cebeba99abfcc7a8`. Existem também dois aliases técnicos `vercel.app` no mesmo deployment; não inventar consumidores distintos.
- No código distribuído, Storefront usa `get_public_order_status` com telefone; Checkout usa `append_public_order_items_with_payment` com telefone. Tráfego e outros consumidores continuam UNKNOWN.
- Delivery PR #42 SHA `4ce88959a751066f96da4cbab8d1fc9ac29bb320` só é candidato; não está distribuído nos demos. Nenhum domínio, deploy, main, SQL remoto ou cliente alterado.

## Evidências PostgreSQL dos dois perfis independentes
**Master** [run 38672488319](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38672488319), SHA `5b75620e6853b99c301cf10e177a7b8d3f78701f`: snapshot real READ ONLY em clone disposable; duas RPCs antigas e wrapper de recuperação.
**Delivery** [run 38678827509](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38678827509), executor SHA `fb0a3215ac3f40606250dac33ed8ca7c06b16150`, Delivery SHA `4ce88959a751066f96da4cbab8d1fc9ac29bb320`: 31/31 migrations instaladas em **clone derivado**, PG catalog READ ONLY, cleanup PASS. Este não é um replay histórico byte a byte.

| RPC | Master — clone real | Delivery — clone derivado |
|---|---|---|
| `public.get_public_order_status(uuid,text)` | SECURITY DEFINER, owner postgres, EXECUTE anon/authenticated | SECURITY DEFINER, owner postgres, EXECUTE anon/authenticated |
| `public.append_public_order_items(uuid,text,jsonb)` | AUSENTE apenas nesse perfil | SECURITY DEFINER, owner postgres, EXECUTE anon/authenticated |
| `public.append_public_order_items_with_payment(uuid,text,jsonb,text)` | SECURITY DEFINER, owner postgres, EXECUTE anon/authenticated | AUSENTE nesse perfil (assinatura enum no Delivery) |
| `public.append_public_order_items_with_payment(uuid,text,jsonb,public.payment_method)` | AUSENTE nesse perfil | SECURITY DEFINER, owner postgres, EXECUTE anon/authenticated |
| `neroxa_recover_group_order(uuid,uuid,jsonb)` | Wrapper service-only que chama função legado | Não visto como wrapper direto na consulta deste perfil; dependências dinâmicas não excluídas |
| `pg_default_acl` para funções `public` | `anon` e `authenticated` recebem EXECUTE padrão | Idem nos owners observados |
| Views referenciando literalmente os nomes legados nos schemas pesquisados | Nenhuma observada | Nenhuma observada |

## Proveniência: não apagar tentativas que falharam
- [38678295109](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38678295109) — replay **literal** falhou na migration 18/31, `20260927130000_delivery_minimum_fee_plus_one.sql`, por variável `v_crust` não declarada. Cleanup PASS, catálogo NOT RUN.
- [38678607741](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38678607741) — falha de escape no executor da correção; não atingiu o catálogo. Cleanup PASS.
- [38678827509](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38678827509) — SUCCESS restrito de replay **DERIVADO**: patch exclusivamente em memória no stream SQL da migration 18, conforme candidato Delivery PR41, de `SELECT c.* INTO v_crust` para `SELECT c.price,c.name INTO v_crust_price,v_crust_name` e uso de `v_crust_price`. Código SQL histórico no repositório INALTERADO.
- SHA256 original da migration 18: `c8bd4de06fbc31d8b4c3b082e27c9b9da0dac58fcf2d2f238d68e01134b78668`; SHA256 SQL derivado: `d2da1a67c5f7b7f9390f77c831a16b9a794b0e64d80a82e0ce33b07114cdd85a`.

## Fronteiras da evidência e critérios futuros
- Esses resultados são **catálogos pré-gate separados**, não o candidato integrado Master×Delivery com Auth/Storage/Realtime/checkout completo. A derivação conserta uma falha de compilação da migration, NÃO comprova operação funcional (o bug `v_size` continua sem ensaio aqui).
- Chamadas negativas UUID+telefone após gate e positivas de tracking privado **NÃO foram executadas depois de revogação**. `GATE=BLOCKED`, `POST-GATE=NOT RUN`.
- `CONSUMER-DISABLEMENT.json` não foi criado; variável `neroxa.legacy_phone_consumers_disabled` não foi forçada. Consumidores externos extras continuam UNKNOWN; os dois demos ainda distribuídos usam legado.
- Nenhuma alteração em DNS, aliases, projetos remotos, contratos, pagamentos, bancos externos, grants de produção, merges, deploys ou serviços pagos.

**Próxima decisão à Coordenação:** identificar consumidores adicionais, confirmar versões e responsáveis, decidir por domínio quando e como desativar/substituir as demonstrações (fundador exclusivamente), e autorizar futuro ensaio integrador pré-gate → gate → pós-gate apenas após pré-condições legítimas. Não restaurar grants inseguros no rollback.

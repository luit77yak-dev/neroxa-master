# NEROXA — Continuidade F02: responsabilidades, aliases e catálogo comparativo (15/10/2026)

**Coordenação: AVANÇAR COM RESTRIÇÕES.** F01/F02 abertos; Marco 01 **0/7**; comercial NÃO LIBERADO. Este commit é somente documental.

## Responsabilidades formalizadas
- Fundador: decisão exclusiva de alterar, substituir ou desativar domínios de demonstração; **nenhuma decisão operacional executiva foi concedida**.
- Engenharia Delivery: plano de transição dos demonstradores, preservação de aliases e substitutos.
- Engenharia Segurança: RPCs/ACLs/wrappers e ensaios pré-gate → gate → pós-gate em PostgreSQL descartável.
- Coordenação Geral: riscos, dependências e homologação futura.

## Um deployment, múltiplos aliases, sem confundir consumidores
- `food.neroxa.ia.br` e `mvp.neroxa.ia.br`: **DEMONSTRAÇÃO INTERNA — LEGADO DISTRIBUÍDO**. Finalidade/decisor confirmados; tráfego e ausência de exposição técnica **não comprovados**.
- Vercel project `prj_aQYU9XxLKwk8AkDIcOmkrLAwPfza`, deployment `dpl_7Ctmw4c8JgZEXh8qJVzW5jjqL4Ho`, código `47e7d8aef66b0c458ed6f423cebeba99abfcc7a8`. Ambos os domínios apontam para **esse mesmo deployment**, sem duas instalações independentes.
- Aliases técnicos adicionais desse mesmo deployment: `pizza-perfect-plate-neroxa2.vercel.app` e `pizza-perfect-plate-git-main-neroxa2.vercel.app`. Não inferir cliente/consumidor independente sem evidência.
- O SHA distribuído chama `get_public_order_status` por UUID + telefone duas vezes no Storefront e `append_public_order_items_with_payment` no CheckoutPanel. Versão distribuída continua **DEPENDENTE**, não migrada.
- Delivery PR42 `4ce88959a751066f96da4cbab8d1fc9ac29bb320`: migração do Storefront e retirada do append antigo no código **CANDIDATO**, sem deploy.

## Fronteira do catálogo
[Runner PostgreSQL do Master 38672488319](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38672488319), SHA `5b75620e6853b99c301cf10e177a7b8d3f78701f`, **READ ONLY em clone**:
- `get_public_order_status(uuid,text)`: PRESENTE, SECURITY DEFINER, EXECUTE efetivo anon/authenticated.
- `append_public_order_items_with_payment(uuid,text,jsonb,text)`: PRESENTE, SECURITY DEFINER, EXECUTE efetivo anon/authenticated.
- `append_public_order_items(uuid,text,jsonb)`: AUSENTE **apenas neste perfil**.
- `neroxa_recover_group_order(uuid,uuid,jsonb)`: wrapper SECURITY DEFINER, serviço autorizado, chama `get_public_order_status`; necessidade de compatibilidade pós-gate.
- `pg_default_acl` em `public`: concessões padrão EXECUTE a anon/authenticated por owners; revisão de novas funções é necessária, sem alterar ACLs agora.

**Delivery histórico versionado — NÃO equivale a leitura PostgreSQL executada:** `append_public_order_items(uuid,text,jsonb)` e wrapper com `public.payment_method` aparecem em migrations, ambos concedendo EXECUTE a anon/authenticated; `get_public_order_status(uuid,text)` também. **Clone do perfil Delivery e catalogação efetiva ainda pendentes**: contar overloads, owners, grants herdados, default privileges, SECURITY DEFINER, funções/views wrappers e assinaturas exatas.

## Plano de desativação, sem execução
1. Preparar opções por domínio: manter demonstrador sob risco documentado, suspender acesso autorizado ou substituir por experiência segura; avaliar impacto nos quatro aliases do mesmo deployment.
2. Mapear consumidores externos, proprietários, ambientes e versões por evidência verificável; `UNKNOWN` enquanto faltar.
3. Validar substituto e F01/F02 em clones descartáveis com controle positivo de tracking privado, Auth real, casos A/B/C, integridade de dados, checkout/append e recuperação.
4. Só em nova autorização específica do fundador alterar domínio/alias. Retirar interface não revoga a API antiga. Não fazer qualquer corte SQL real nesta fase.
5. Pré-gate → gate → pós-gate só se desativação dos consumidores **for comprovada**. Sem `CONSUMER-DISABLEMENT.json`, sem `neroxa.legacy_phone_consumers_disabled=on` artificial.
6. Rollback pré-COMMIT apenas transacional em clone; pós-cutover manter rotas inseguras desabilitadas e roll-forward; **nunca** restaurar grants por UUID/telefone ou StaffPanel.

**Executado nesta rodada:** documentação/planejamento e consultas de metadados read-only GitHub/Vercel; **NÃO executados** deploy, merge, alteração de DNS, alteração de Supabase, revogação SQL ou desativação.

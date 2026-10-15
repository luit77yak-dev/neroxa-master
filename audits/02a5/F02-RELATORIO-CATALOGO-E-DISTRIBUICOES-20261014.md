# NEROXA — F02: fotografia de catálogo PostgreSQL e consumidores distribuídos
**Decisão:** Coordenação 14/10/2026, AVANÇAR COM RESTRIÇÕES. Esta entrega é documentação de auditoria, não uma migração. F01/F02 ABERTOS; 0/7; comercial não liberado.

## Código e distribuições
- Master PR46 código/ensaio SHA `5b75620e6853b99c301cf10e177a7b8d3f78701f`, Delivery PR42 código SHA `4ce88959a751066f96da4cbab8d1fc9ac29bb320`; ambas draft, sem merge.
- Scanner offline [38670223632](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38670223632): 408 arquivos únicos (211 Master/197 Delivery), 284 ocorrências estáticas (121 símbolos antigos, 163 outras RPC). Não prova versões ativas.
- Vercel: projeto Delivery `prj_aQYU9XxLKwk8AkDIcOmkrLAwPfza`. Aliases `food.neroxa.ia.br` e `mvp.neroxa.ia.br` apontam, por consulta de metadados `get_alias`, para deployment `dpl_7Ctmw4c8JgZEXh8qJVzW5jjqL4Ho`; deployment marcado READY/production tem SHA `47e7d8aef66b0c458ed6f423cebeba99abfcc7a8` (2026-10-08T22:46:52Z).
- Fonte [Storefront no SHA de produção](https://github.com/luit77yak-dev/pizza-perfect-plate/blob/47e7d8aef66b0c458ed6f423cebeba99abfcc7a8/src/components/storefront/Storefront.tsx): duas chamadas de `get_public_order_status` com telefone. [CheckoutPanel no mesmo SHA](https://github.com/luit77yak-dev/pizza-perfect-plate/blob/47e7d8aef66b0c458ed6f423cebeba99abfcc7a8/src/features/storefront/components/CheckoutPanel.tsx): chamada de `append_public_order_items_with_payment` por UUID/telefone. É **dependência de versão distribuída real**, mas tráfego recente e flags não observados. Outros consumidores externos UNKNOWN.

## PostgreSQL nativo: catálogos reais de clone descartável
- [Run inicial 38671725823](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38671725823): FAIL por socket Docker privado para runner; recorte comprador pré-gate PASS parcial, cleanup PASS.
- [Run intermediário 38672147816](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38672147816): consulta SQL leu o catálogo, mas verificador assumiu sem fundamento três funções legadas; FAIL de validação, comprador PASS parcial e cleanup PASS.
- [Run final 38672488319](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38672488319): **SUCCESS no escopo de auditoria pg_catalog READ ONLY**, Master ensaio SHA `5b75620e6853b99c301cf10e177a7b8d3f78701f`; 17 verificações do comprador e 11 cenários buyer no perfil pré-gate, cleanup PASS. O P0 F02 continua em FAIL no baseline. Nenhum SQL de revogação aplicado.
- Presentes no Master BUYER-PRE-GATE: `public.get_public_order_status(uuid,text)` e `public.append_public_order_items_with_payment(uuid,text,jsonb,text)`, ambas `SECURITY DEFINER`, owner `postgres`, EXECUTE efetivo `anon=true`, `authenticated=true`, `service_role=true`.
- **Ausente neste perfil Master:** `append_public_order_items`. Isto NÃO certifica revogação nem corresponde a catálogo de Delivery legado, cujo wrapper de pagamento usa `public.payment_method` em vez de `text`; o corte precisa validar ambos os perfis separadamente.
- Novo contrato: `neroxa_register_tracking_capability`, `neroxa_track_order_with_capability`, SECURITY DEFINER, efetivamente acessíveis por `service_role`, não por `anon` ou `authenticated`.
- Wrapper dependente: `neroxa_recover_group_order(uuid,uuid,jsonb)` chama `public.get_public_order_status(o.id,o.customer_phone)` conforme `audits/sql/checkout-recovery.candidate.sql` linha 24; EXECUTE só por `service_role`. Necessita compatibilidade pós-gate sem restaurar acesso anônimo.
- `pg_default_acl`: grants padrão de função no schema `public` de owners `postgres` e `supabase_admin` incluem EXECUTE para `anon` e `authenticated`. Risco para **futuras** funções; não modificar ACL default de forma ampla sem migração/testes.
- `pg_auth_members` 9 vínculos de papéis observados; 0 views/materialized views citando literalmente as RPCs antigas nos schemas consultados. Não exclui SQL dinâmico nem outros schemas.

## Portão de segurança
- `CONSUMER-DISABLEMENT.json`: AUSENTE intencionalmente. Não fabricar documento nem ligar GUC artificial.
- Gate `phone-rpc-quarantine.release-gate.sql`: **BLOCKED**, pois versões distribuídas com RPC antiga existem e outros consumidores externos seguem UNKNOWN.
- Pós-gate: **NOT RUN**, sem prova de compatibilidade ou privilégios revogados.
- Nenhuma alteração em produção, domínio, cliente, infraestrutura paga, grants, main ou merge. Rollback seguro: rollback antes de commit; após commit preservar restrição e roll-forward/T1, nunca restaurar EXECUTE inseguro.
- **Decisão solicitada à Coordenação:** nomear responsável pelos aliases acima, mapear toda versão distribuída, comprovar rollout substituto, inclusive fluxo de append, e aprovar só depois o ensaio de gate com controles positivos e negativos em clone seguro.

**Parecer: AVANÇAR COM RESTRIÇÕES na auditoria; NÃO AVANÇAR no cutover/gate.**

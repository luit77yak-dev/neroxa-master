# F02 — corte legado pendente

**Remoto comprovado por leitura:** neroxa-solutions-hub / iefaoaqzltvpfabyeelj. A configuração atual Vercel do Delivery aponta a esse projeto em VITE_SUPABASE_URL (production/preview) e SUPABASE_URL (production); somente esses URLs foram recuperados, sem chaves ou senhas. Isso não autentica independentemente os bytes do bundle distribuído.

| Assinatura no remoto | Estado |
|---|---|
| public.get_public_order_status(uuid,text) | SECURITY DEFINER/postgres; EXECUTE efetivo anon/authenticated/service_role |
| public.append_public_order_items_with_payment(uuid,text,jsonb,text) | Idem |
| append_public_order_items(uuid,text,jsonb) | Ausente neste projeto |
| append_public_order_items_with_payment(uuid,text,jsonb,public.payment_method) | Ausente neste projeto |
| tracking/amendment/registro combinado/recovery por capability | Ausentes: backend novo não instalado/admitido |

Nenhum wrapper/view literal ou dependência de catálogo dessas funções foi observado. Dependências dinâmicas não estão excluídas. Seis Edge Functions ativas tiveram os fontes lidos: sem referência literal às RPCs legadas; não foram executadas. Outros consumidores externos e clientes já baixados continuam UNKNOWN. A suspensão dos seis endereços é recebida da Coordenação, não inferida como revogação de SQL ou eliminação de todos os consumidores. Inventário histórico dos 26 consumidores preservado.

**Candidato:** remote-cut.pending.sql, com inventário/corpos/ACLs vinculados à leitura e bloqueio antes dos REVOKEs se faltarem funções novas ou houver deriva. O fragmento retira EXECUTE de PUBLIC, anon, authenticated e service_role nas duas assinaturas observadas; create_public_order e capacidades novas são preservados. Defaults globais não são alterados: risco de reintrodução em migrações permanece explicitamente sujeito a nova verificação. Não é autorizado nem foi aplicado remotamente.

**Ensaio adicional:** [40214203640](https://github.com/luit77yak-dev/neroxa-master/actions/runs/40214203640), Master b4158a9422a0f8b4a1d059c2109fa3f9eb3acb8d / Delivery 7ca9376f29ee205d4063e46546f5070313ab78a0: SUCCESS. Duas novas negativas reais para service_role, HTTP 403 + SQLSTATE 42501, snapshots inalterados. Quinze casos antes e quinze após o corte, incluindo checkout/tracking/amendment, continuaram PASS. As seis negativas anon/authenticated anteriores e ACLs também foram reutilizadas no mesmo workflow. 130 testes Delivery e TypeScript PASS; cleanup PASS. O guard de preimagem remota não foi executado; o delta ACL exato foi testado no clone.

PRs #44/#48/#49, contenção Realtime e polling preservados. Não se retomou o projeto Delivery INACTIVE (uvyinrojuhizjqbuzdcy), nem se declarou cobertura de seus overloads; homologação hospedada não foi usada como executor. Somente SELECTs remotos em transações READ ONLY e leituras de metadados/fontes; sem deploy, merge, DNS, compra ou escrita remota.

**Menor impedimento:** admitir o backend real de capability e comprovar o destino/disposição dos consumidores restantes antes de solicitar o REVOKE. Existência de funções ou suspensão Vercel não substitui essa admissão. Recuperação em RECOVERY.md: STOP em falha/COMMIT incerto e roll-forward; nenhum GRANT inseguro como rollback. F01/F02 abertas, SEC-18 BLOCKED; comercial não liberado.

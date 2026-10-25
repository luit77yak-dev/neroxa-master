# F02 — integração executada em 25/10/2026

**Integração segura local PASS; F02 legado continua P0 ABERTO. Comercial NÃO LIBERADO.**

Base: Master PR46 `758d06f8e8d58e619150f77c1f070ea2f7bb5739`, Delivery PR42 `011275488660bfa1a9271b3e4c92e457f7638e34`. Drafts incrementais: [Master47](https://github.com/luit77yak-dev/neroxa-master/pull/47), [Delivery43](https://github.com/luit77yak-dev/pizza-perfect-plate/pull/43). Sem merge/deploy/SQL de produção.

Correção: o checkout registrava tracking e amendment em transações separadas. Uma falha na segunda podia consumir tracking sem entregar nenhum token. `buyer-capabilities-atomic.candidate.sql` reutiliza ambos os registradores em uma única transação e serializa pelo pedido; inconsistência prévia falha sem rotacionar segredos. `checkout-backend.ts` é o mesmo adapter RPC usado pela rota servidor e pelo ensaio HTTP; nenhuma autorização mockada no ensaio nativo. Os SQLs predecessores foram preservados.

## Evidência real

[Actions40148285090](https://github.com/luit77yak-dev/neroxa-master/actions/runs/40148285090), job121034237738. Master ensaiado `63fb6f9e0077eddb572e4c2806e515c205e05fc8`, Delivery `213e5231708eb2c2508f2fe2b96ba510db95a74b`. GitHub público standard, seis serviços Supabase locais não vinculados, imagens originais conferidas, Node22.23.0, Bun1.3.4/lock congelado, Auth real e restrição de egress do UID de testes. Recursos medidos:4CPUs,15.6GB RAM disponível,91GB disco livre; nenhum runner maior/cache/upload de artefato contratado.

- **130/130 testes unitários PASS; TypeScript PASS.**
- **15/15 casos novos PASS:** checkout HTTP pelo adapter real, total31 calculado no servidor apesar de unit_price0.01; tracking com token emitido; amendment com total62, soma das linhas62, uma operação e um evento de histórico adicional; retry sem duplicação/reemissão; B/C403; token trocado403; RPC de emissão negada anon401/authenticated403 com SQLSTATE42501.
- Primeiro checkout concorrente: doisHTTP200, um pedido e apenas uma emissão do par de tokens.
- Falha SQL real no segundo registro (trigger exclusivo de fixture, removido): HTTP503; um pedido já confirmado e **zero** registros tracking/amendment. Retry da mesma chave: HTTP200, mesmo pedido e ambos os tokens emitidos.
- Regressão de amendment já existente:41observações PASS,2FAIL legados,1BLOCKED; inclui concorrência/idempotência, preços, grupos, histórico, expiração/revogação, cruzamentos e recovery service-only. IDs SEC são mapeamento provisório, não homologação SEC18.
- **Cleanup PASS**, sem containers do projeto; não foi realizado restore de grants inseguros.

`F02-INTEGRATION-20261025.json` contém resumo sanitizado. As respostas completas/snapshots estão nos logs do job; credenciais/tokens não são publicados. Não é E2E de navegador hidratado, prova de produção ou suite integral F01.

## Falhas anteriores preservadas

40147018286:130 testes PASS, erro de fronteira TypeScript antes do banco; corrigido no módulo servidor. 40147124383/40147340731: guard bloqueou deriva da tag PostgreSQL; cleanup PASS. O registry republicou17.11.0.004: config novo c4be… diferente do aprovado94fe…. Fixado o **manifest original** `supabase/postgres@sha256:f2a84af37797675f0b27e27ea1fad2ebcd913ebf7ad60be05d7df0bcbd29e4b5`, cujo config94fe… foi conferido; EXPECTED-IMAGES e guard não relaxados. 40147510621: fixture de checkout sem expected_total agrupado obrigatório. 40147870563:11 casos integrados PASS, expectativa incorreta de403 para RPC privada anônima (401); ajuste exige42501 e ausência de mutação. Não foram transformados em PASS retroativamente.

## Bloqueio concreto de cutover

No ensaio, UUID+telefone ainda permite leituraHTTP200 e append anônimo com mutação, ambos P0. A revogação oficial não foi aplicada: nenhum recibo/GUC de consumidores desativados foi criado/forçado; pós-gate NOT RUN.

Metadados Vercel lidos em25/10 confirmam food.neroxa.ia.br e mvp.neroxa.ia.br no mesmo deployment READY `dpl_7Ctmw4c8JgZEXh8qJVzW5jjqL4Ho`, DeliverySHA `47e7d8aef66b0c458ed6f423cebeba99abfcc7a8`. Nesse SHA, Storefront121/899 usa get_public_order_status e CheckoutPanel140 usa append_public_order_items_with_payment. Isso comprova distribuição do fonte legado, não tráfego atual; consumidores adicionais continuam UNKNOWN. Nenhuma chamada de pedido ou banco hospedado foi feita.

Próximo passo: concluir ativação segura do gateway no ambiente-alvo (candidato continua local-only), decidir a migração/desativação dessas distribuições e comprovar consumidores. Só então ensaiar revogação coordenada mantendo os positivos. Essa transição/deploy não é autorizada por este trabalho. F01/F02 permanecem abertos; SEC18 BLOCKED; venda não liberada.

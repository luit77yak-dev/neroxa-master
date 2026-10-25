# F02 — consumidores legados: resultado restrito

Bases: Master PR #47 / 9d62d89803485821c01c2109918b3ea0fc7d3f3e e Delivery PR #43 / 213e5231708eb2c2508f2fe2b96ba510db95a74b.

- Delivery PR #44, commit 7ca9376f29ee205d4063e46546f5070313ab78a0: checkout sem gateway suspende; removido fallback direto de criação pública. Tracking/amendment continuam por capability.
- Master PR #48, código ensaiado 58d462f3aaaeae2028c9ec65d86e0d390e9f79fe: inventário dos dois sources exatos e ensaio dos gates SQL existentes, sem modificar seus bytes.
- Execução nativa [40152480607](https://github.com/luit77yak-dev/neroxa-master/actions/runs/40152480607): SUCCESS, 130 testes unitários PASS, TypeScript PASS, 15 casos integrados antes + 15 depois da revogação PASS, seis negativas diretas PASS, cleanup PASS.
- Negativas: create_public_order, get_public_order_status e append_public_order_items_with_payment, como anon (401) e admin_A autenticado (403), todos SQLSTATE 42501 e snapshots de negócio inalterados. Pedidos/produtos existentes e payloads válidos.
- ACL efetiva das três funções: anon/authenticated false; service_role true. Nenhum grant inseguro restaurado.
- Fluxos reais via HTTP e Supabase local: checkout, tokens separados, tracking privado, amendment, B/C cruzados negados, preços do servidor, idempotência, histórico e falha atômica de emissão preservados. Não é navegador hidratado ou prova de produção.
- append_public_order_items não existe neste catálogo: NÃO COBERTO; não contado como negativa PASS. Outras assinaturas/perfis não ensaiados.
- Primeira execução 40152071677: scanner bloqueou uma escolha condicional de RPCs de quota antes de qualquer revogação; 15 casos seguros passaram e cleanup PASS. Corrigido para enumerar os nomes literais de ambos os ramos; nomes não resolvidos continuam bloqueados.

O GUC de consumidores desativados foi usado exclusivamente após comprovar os consumidores deste clone isolado (fontes exatas, sem callers legados, um create server-side, seis serviços e nenhum wrapper SQL legado). Não representa desativação externa nem liberação SEC-18.

Metadados Vercel observados: food.neroxa.ia.br e mvp.neroxa.ia.br compartilham dpl_7Ctmw4c8JgZEXh8qJVzW5jjqL4Ho / 47e7d8aef66b0c458ed6f423cebeba99abfcc7a8, READY. Esse source contém leitura e append por telefone. Também há os aliases técnicos pizza-perfect-plate-neroxa2.vercel.app e pizza-perfect-plate-git-main-neroxa2.vercel.app. Código distribuído comprovado; tráfego não aferido. Nenhum deploy ou acesso SQL remoto realizado. Demais consumidores sem nova comprovação; inventário histórico não reclassificado.

Pendência mínima: decisão de substituição ou suspensão controlada dessa implantação compartilhada e comprovação dos demais consumidores antes da revogação publicada. A ativação fora do contrato local ainda exige revisão dos guards de ambiente e evidência específica; este ensaio não a admite. Gate 0 NO-GO; F01/F02 abertos; SEC-18 BLOCKED; comercial não liberado.

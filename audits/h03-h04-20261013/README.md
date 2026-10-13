# H03/H04 — candidatos Master e provas nativas

2026-10-13. Fonte testada Mastere338e4e, Delivery6f5b37e. GO restrito para homologação isolada; NO-GO sandbox e produção. PR37 original preservada DRAFT, sem merge, SQL remoto ou deploy.

Documentação canônica e evidências estão no [Delivery commit55a701f](https://github.com/luit77yak-dev/pizza-perfect-plate/tree/55a701fccbadc1687924456df563ef976806ddc7/audits/h03-h04-20261013): CONTRATO-DISPONIBILIDADE.md, CONTRATO-RECUPERACAO.md, RELATORIO-H03-H04.md e DECISAO-PROXIMA-HOMOLOGACAO.md. Incluem capturas, matrizes JSON, hashes e limitações.

SQLs revisáveis, fora das migrations automáticas:

1. Depois do catálogo completo/ACL/instância e GROUP pricing, aplicar store-availability.candidate.sql.
2. Aplicar checkout-recovery.candidate.sql; lease nullable sem backfill e contador de leitura privado separado do checkout.
3. Depois da capacidade privada e GROUP append, aplicar store-availability-capability.candidate.sql.

Arquivos em audits/sql/. Preflight exige os corpos anteriores esperados; uma incompatibilidade aborta a transação. Não são uma cadeia de instalação para o sandbox reduzido nem autorização de aplicação remota. Hashes no manifest.json; não alterar roles/default privileges gerenciados automaticamente.

[Workflow integrado38432605009](https://github.com/luit77yak-dev/pizza-perfect-plate/actions/runs/38432605009):493 verificações anteriores +40 PostgreSQL/Auth/PostgREST +21 browser, sem falhas. Chromium criou pedido de retirada com GROUP, revisou preço30→35, perdeu resposta depois do commit no banco, fechou/reabriu, recuperou mesma chave e acompanhamento, duas abas sem duplicação; estado alterado por proprietário com JWT local refletiu na loja. Timeout antes do transporte e storage negado também comprovados sem duplicação/escrita indevida.

[Restauração38431446701](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38431446701):193 verificações,92 tabelas,94 FKs, fingerprints de definição/RLS/ACL e dados, Auth/PostgREST do destino. Fonte b1fe649: definições SQL idênticas às da fonte integrada final. Roles globais são compartilhadas no cluster descartável; restauração de uma intenção GROUP populada e sua recuperação após restore ainda precisam cenário dedicado. Não expandir esta prova a produção.

Master local:33 testes Vitest e build passam;43 erros TypeScript preexistentes persistem. Nenhum componente TS/TSX comercial do Master foi alterado. Delivery:64 testes Node, TypeScript, lint dos arquivos afetados e build aprovados;31 checks browser mock de legado separados da prova de banco real.

Limites de release: limpeza/evicção integral do storage e reconciliação com fencing ainda pendentes; original payload precisa ser reentrado exatamente; token perdido não é reemitido; agenda comercial/editor, escala/retensão e pacote/backup sandbox exigem decisões próprias. Configuração histórica órfã preservada. Não habilitados pagamentos, Supplier, ledger, combos ou meio-a-meio.

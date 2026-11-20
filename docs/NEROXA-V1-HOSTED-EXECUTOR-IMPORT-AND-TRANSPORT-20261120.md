# NEROXA V1 — executor hospedado: fechamento de dependências e conexão | 2026-11-20

**Estado:** `HOSTED_EXECUTOR_IMPORT_CLOSURE=BLOCKED`, `HOSTED_PREFLIGHT=NOT_RUN`, `SQL_RELEASE=NOT_AUTHORIZED`, `COMMERCIAL=NO-GO`.

## Prova executada na branch de integração

- Verificação de closure: `tools/hosted-admission/import-closure-audit.mjs`. Analisa imports estáticos locais sem carregar módulos, abrir arquivos de credenciais, executar psql ou modificar o banco.
- Testes sintéticos: `tools/hosted-admission/import-closure-audit.test.mjs` — **4/4 PASS**, incluindo import inexistente, caminho externo e grafo cíclico.
- CI do Master: [workflow run 44790362557](https://github.com/luit77yak-dev/neroxa-master/actions/runs/44790362557), commit `914d1be94503c4bcbd84e95bc8933b9792a2fb4c`.
- Saída real da auditoria: `HOSTED_EXECUTOR_IMPORT_CLOSURE=BLOCKED`, `SCANNED_MODULES=4`, `MISSING_IMPORTS=["delivery-candidate/src/server/hosted-release-core.mjs"]`, `HOSTED_EXECUTION_AUTHORIZED=NO`.
- Tanto `tools/hosted-admission/session.mjs` quanto `tools/hosted-admission/readonly-preflight.mjs` importam um verificador/constantes de `../../delivery-candidate/src/server/hosted-release-core.mjs`. O Master versionado **não contém** `delivery-candidate/`; este é um bloqueio de reprodução **autônoma do checkout**. Não afirmar que o módulo está ausente de todos os ambientes Work externos: isso exigiria inspecionar o Work.
- CI `SUCCESS` indica que a auditoria detectou o estado e que os gates estáticos continuam fechados — **não** indica `HOSTED_EXECUTOR=READY`.

## Questões separadas e obrigatórias

1. **Fechar a dependência versionada sem recriá-la por conjectura.** Localizar a implementação original `hosted-release-core.mjs` e seus hashes/procedência em pacote preservado da homologação, comparar com contratos e negativos originais, revisá-la e incluí-la de modo imutável/reproduzível em uma release candidata. Não gerar um verificador de assinatura sintético no lugar da implementação.
2. **Alinhar transporte com política.** `preflight-policy.json` registra `SUPAVISOR_SESSION`, porta 5432 e host/role/CA/authority nulos. `session.mjs` contém host direto IPv6 em `openHosted`, embora `readonly-preflight.mjs` construa conexão Supavisor sessão. Não confundir os dois escopos.
3. **Rota de rede efetiva.** O GitHub Actions [run 44788991692](https://github.com/luit77yak-dev/neroxa-master/actions/runs/44788991692) demonstrou `DNS_A=0`, `DNS_AAAA=1`, `PG_TCP=NOT_VERIFIED` e `PG_TLS_HOSTNAME_CA=NOT_VERIFIED` no endpoint direto. O banco Supabase reporta `ACTIVE_HEALTHY`. Somente host de pooler exato do dashboard ou ambiente IPv6 demonstrado; não deduzir endereços regionais.
4. **Segredos fora do chat.** Exigir mecanismo autorizado de runtime/Work para credencial temporária; grant assinado `HOSTED_PREFLIGHT` separado de `SQL_RELEASE` e `HOSTED_SERVER`. Nunca promover env, log, teste offline ou conector SQL a evidência de TLS/libpq.
5. **Aceite da release SQL.** Manifesto das 33 unidades permanece `execution_authorized=false`, `approval=null`; `preflight-policy.json` permanece `CLOSED`. Iniciar somente após autoridade, rota, readiness e recuperação; manter role de runtime Hyperdrive distinta.

## Próximos passos concretos

- Buscar no Work Linux **já existente**, sem criar novo laboratório, o original `delivery-candidate/src/server/hosted-release-core.mjs` e a prova do SHA. Não publicar nem transferir segredos.
- Reconciliar os imports nas unidades de pré-execução e rodar `node --test tests/hosted-admission/preflight.test.mjs` e `node --test tests/hosted-admission/local.test.mjs` em executor reproduzível. Não interpretar fixture como conexão remota real.
- Obter hostname **exato** de `Session pooler` no painel **Connect** do Supabase comercial (não senha); comprovar `sslmode=verify-full`, CA, identidade de projeto e backend persistente em canal seguro.
- Só depois solicitar aceite de `HOSTED_PREFLIGHT` read-only e, se comprovado, aceite separado de `SQL_RELEASE`, mantendo `HOSTED_SERVER` e publicação fechados.

**Invariantes nesta auditoria:** nenhuma credencial acessada, nenhum SQL remoto de escrita, nenhuma alteração em contas Supabase, Cloudflare, DNS, banco ou LAB. Código de verificação e relatório alterados somente na branch de integração.

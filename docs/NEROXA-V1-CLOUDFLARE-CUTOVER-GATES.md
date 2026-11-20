# NEROXA V1 — Cloudflare-first | Master / Food integration gate

## Identidade de preflight comercial criada — sem senha (20/11/2026)

- **BOOTSTRAP ROLE PASS:** migração Supabase `20261120185812_neroxa_v1_f02_passwordless_preflight_login_20261120` aplicada no comercial `iefaoaqzltvpfabyeelj`. A role `neroxa_f02_preflight` tem LOGIN com `password IS NULL`, NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB/NOCREATEROLE/NOREPLICATION, no máximo 2 conexões e expiração em 15/12/2026.
- Uma consulta **pós-migração** comprovou 0 memberships, 0 privilégios de leitura/escrita de tabelas de negócio, 0 funções SECURITY DEFINER executáveis (de 19), 0 CREATE de banco/schema. O contrato legado de cálculo de preço teve **somente o GRANT a PUBLIC removido**, preservando EXECUTE explícito a anon/authenticated/service_role.
- O banco segue `ACTIVE_HEALTHY`, 59 migrações históricas (uma nova de configuração técnica, **não** uma das 33 SQLs V1), 0 pedidos e 18 planos-base. Veja [prova da role](./NEROXA-V1-F02-COMERCIAL-ROLE-PREFLIGHT-20261120.md).
- **Não confundir criação de LOGIN com sessão autorizada:** não existe senha provisionada, nem aprovação assinada/ambiente protegido verificado. `HOSTED_PREFLIGHT=CLOSED`, `AUTHENTICATED_PSQL=NOT_RUN`, `SQL_RELEASE=NOT_AUTHORIZED`, `COMMERCIAL=NO-GO`. Não reutilizar senha admin ou LAB; segredo novo somente em configuração privada autorizada.
- O transporte `aws-0-us-east-1.pooler.supabase.com:5432` já teve DNS/TCP/STARTTLS/TLSv1.3 com CA e hostname PASS; não comprova autenticação de banco/tenant, e Hyperdrive comercial continua separado.


## Atualização do executor hospedado — dependência recuperada (20/11/2026)

- O bloqueio `MISSING_IMPORTS=["delivery-candidate/src/server/hosted-release-core.mjs"]` descrito mais abaixo **foi corrigido** na branch do Master. O arquivo original foi recuperado sem alterações do Delivery histórico, com Git blob `394edd40004f259daa01ab95496ef8fc042416da`, e fixado por verificação no CI.
- [CI 44791409383](https://github.com/luit77yak-dev/neroxa-master/actions/runs/44791409383): imports resolvidos, **26 testes sintéticos de hosted admission passaram**, Master static guard PASS. A seção histórica anterior registra corretamente a falha encontrada naquele momento, **mas não é o estado atual do código**.
- **Próxima dependência:** obter rota real ao host/pooler da Supabase, identidade TLS/libpq com segredo protegido e autorização de `HOSTED_PREFLIGHT` somente leitura. **Nenhuma SQL foi executada, nem a política foi aberta; COMERCIAL NO-GO.**



> **STATUS ATUALIZADO — 20/11/2026:** o destino comercial foi reativado e está `ACTIVE_HEALTHY`. O LAB principal está `ACTIVE_HEALTHY`; os outros dois projetos estão `INACTIVE`. A organização permaneceu no plano Free. Os dados comerciais de teste foram eliminados em limpeza transacional autorizada: 24/24 tabelas vazias, 118 linhas removidas; catálogo e acesso administrativo preservados. [Evidência](./NEROXA-V1-COMERCIAL-TEST-DATA-RESET-20261120.md). O status comercial **CONTINUA CLOSED / NO-GO**, porque as 33 SQLs permanecem não admitidas, o Hyperdrive comercial não existe e as provas hospedadas não foram concluídas. As linhas cronológicas antigas abaixo são histórico e não prevalecem sobre esta atualização.


Estado: **CLOSED — NOT ADMITTED — NO COMMERCIAL GO**. Revisão em 2026-11-20.
Este registro é de planejamento e rastreabilidade, não é autorização de release.

## Bases verificadas

- Master PR #53 `be9ab894740b8298e540fa01d6d4f2a951e86241` permanece na branch de integração; `main` não foi alterada nesta onda.
- `audits/02a5/hosted-release/MANIFEST.json`: 33 unidades ordenadas, hashes SHA-256 validados 33/33, `execution_authorized=false`, `approval=null`, estado `CANDIDATE; hosted execution CLOSED`.
- `tools/hosted-admission/preflight-policy.json`: `state=CLOSED`; host, role, CA, ref, founder e autoridade não admitidos.
- O destino original do manifesto é `iefaoaqzltvpfabyeelj`, **distinto** do LAB R14 `gomexvhvecvvfbdzhjct`. No levantamento Supabase de 2026-11-20, o primeiro estava `INACTIVE`; revalidar a disponibilidade antes de uma futura admissão.
- Na candidata Food PR #45, `src/server/hosted-release-core.mjs` vincula `HOSTED_SERVER` a `VERCEL_DEPLOYMENT_ID`; isso **não é** uma admissão para Cloudflare Workers. Não trocar o identificador sem modelar nova prova de identidade.
- `audits/02a5/hosted-admission/README.md` registra TLS/libpq hospedados, cancelamento, quiescência e readiness positiva como NÃO executados. As provas privadas LAB não são equivalentes à instalação comercial dessas 33 unidades.

## Decisão de destino comercial — 2026-11-20 (registrada, não é execução)

- **Destino comercial explicitamente confirmado pelo solicitante:** projeto Supabase `iefaoaqzltvpfabyeelj` (`neroxa-solutions-hub`), organização `syexxzbppxwwzcrrczdb`.
- Conferência somente-leitura via integração Supabase: destino `INACTIVE`, região `us-east-1`, PostgreSQL 17; LAB R14 `gomexvhvecvvfbdzhjct` `ACTIVE_HEALTHY`, região `sa-east-1`. O outro laboratório `nvbmzdgfretwnkdfqcap` também se encontra ativo.
- Organização no plano `free`, com **dois projetos ativos**. O limite documentado de dois projetos Free ativos é impeditivo para a retomada do terceiro sem liberar uma vaga ou alterar o plano. Fonte: https://supabase.com/docs/guides/platform/billing-on-supabase
- Decisão de destino **não autoriza** pagamento, upgrade, pausa de laboratório, restauração do projeto, substituição de dados, SQL remoto, concessão de credenciais, execução `SQL_RELEASE`, ativação `HOSTED_SERVER`, alteração de DNS, merge nem GO comercial.
- Manter `tools/hosted-admission/preflight-policy.json` CLOSED e manifesto das 33 unidades imutável (`execution_authorized=false`, `approval=null`).
- Próximo bloqueio operacional: obter decisão orçamentária explícita e caminho de ativação do projeto sem degradar as evidências de laboratório; após a ativação, executar somente `HOSTED_PREFLIGHT` read-only, antes de qualquer autorização independente de SQL e publicação.

## Rota PostgreSQL comercial — prova sem credenciais (20/11/2026)

- Sondagem externa no GitHub Actions [run 44788991692](https://github.com/luit77yak-dev/neroxa-master/actions/runs/44788991692): `DNS_A=0`, `DNS_AAAA=1`, `DNS=PASS`, **`PG_TCP=NOT_VERIFIED` e `PG_TLS_HOSTNAME_CA=NOT_VERIFIED`**. O workflow concluiu `SUCCESS` apenas por executar a sonda; **não há prova de handshake TLS ou autenticação**.
- Divergência a resolver: `tools/hosted-admission/preflight-policy.json` cita `SUPAVISOR_SESSION`, mas `tools/hosted-admission/session.mjs` exige host direto `db.iefaoaqzltvpfabyeelj.supabase.co:5432`; não trocar por pooler sem revisar identidade, sessão persistente e CA. `SQL_RELEASE` continua bloqueada.
- Explicação técnica e opções de rota em [NEROXA-V1-COMERCIAL-POSTGRES-NETWORK-AND-TRANSPORT-20261120.md](./NEROXA-V1-COMERCIAL-POSTGRES-NETWORK-AND-TRANSPORT-20261120.md). Nenhuma alteração em credenciais/roles/Hyperdrive ou em produção.

## Empacotamento do executor — bloqueio verificado em CI (20/11/2026)

- O executor hospedado do Master **não tem fechamento autônomo de imports** na branch de integração: `tools/hosted-admission/session.mjs` e `readonly-preflight.mjs` importam `delivery-candidate/src/server/hosted-release-core.mjs`, ausente do checkout versionado. [GitHub Actions run 44790362557](https://github.com/luit77yak-dev/neroxa-master/actions/runs/44790362557) confirma `HOSTED_EXECUTOR_IMPORT_CLOSURE=BLOCKED` e informa exatamente esse caminho ausente.
- Os testes sintéticos do auditor de importação passaram **4/4**, mas a auditoria do executor real está **BLOCKED**. `SUCCESS` nesse workflow significa que o bloqueio foi detectado e os gates continuaram fechados, **não que o executor possa ser executado**.
- O arquivo original de autenticação/assinaturas precisa ser localizado no Work Linux/release preservada, verificado e versionado de forma reproduzível antes de conectar credenciais ou SQL. Não reconstruir `verifyGrant` a partir de suposições.
- A verificação de rede sem segredo também está `PG_TCP/TLS=NOT_VERIFIED`, como registrado na seção de transporte. Os bloqueios são **independentes**: resolver host/pooler não torna a release instalável com imports ausentes.
- Plano de recuperação completo: [NEROXA-V1-HOSTED-EXECUTOR-IMPORT-AND-TRANSPORT-20261120.md](./NEROXA-V1-HOSTED-EXECUTOR-IMPORT-AND-TRANSPORT-20261120.md).

## Contrato de integração proposto (ainda não implementado)

1. **Definir o destino comercial**: projeto/ambiente Supabase realmente aprovado, domínio do endpoint, função de cada conexão, limites e custos; proibir reaproveitar o LAB R14 como destino comercial por inferência.
2. **Revisar identidade de deployment Cloudflare**: vincular grant assinado ao account/Worker/version ID, hash da release e domínios, com TTL, nonce, assinatura/autoridade independente e recuperação. Não confiar em headers controláveis pelo cliente, flags ou `CF_VERSION_METADATA` isoladamente.
3. **Preservar fail closed**: checkout público `/api/checkout` e tracking `/api/order-track` ficam 503 até a admissão validada; flags isoladas, token de usuário ou frontend não podem habilitar negócios.
4. **Separar aprovações**: `HOSTED_PREFLIGHT` read-only, `SQL_RELEASE` sessão de instalação e `HOSTED_SERVER` runtime têm escopos e aprovações distintos. Nenhuma validação de CI substitui a autorização de execução.
5. **Validar readiness real**: instalação exata dos 33 SQLs somente em ambiente autorizado, permissões/RLS/ACL, revogação de RPCs legadas, controle de consumidores Storage/Realtime, TLS e identidade do servidor. Verificar efeitos reais, preservando estado intermediário e HOLD para ambiguidades.
6. **Testar em release imutável**: build e import SSR Cloudflare, 401/403/429/503, ausência de vazamento de PII, A1/A2/C1, checkout e tracking por capability, recuperação/rollback e integridade remota de assets; manter o R14 como evidência anterior, não como aprovação automática.
7. **Publicação separada**: somente após parecer SEC-18/F01/F02 e aceite humano, vincular DNS e rotas comerciais; manter plano de rollback e logs sanitizados.

## Regras desta branch

- Nunca editar o manifesto de 33 hashes nem preencher `preflight-policy.json` nesta etapa.
- Não conectar credenciais, criar grants, executar SQL, realizar merges ou produzir deployment comercial.
- CI verde significa somente **candidato estático/build aprovado** até haver testes hospedados e evidência de identidade da release final.

**Next gate:** revisão de contrato Cloudflare `HOSTED_SERVER` com negativos de identidade de Worker/version e compatibilidade de forma dos RPCs Food–Master. Não ativar produção neste documento.

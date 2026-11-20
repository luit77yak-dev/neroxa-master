# NEROXA V1 — F02 | Fallback de executor hospedado | 20/11/2026

**Classificação:** `WORK_LINUX=REUSED` / `WORK_F02_READINESS=BLOCKED_ENVIRONMENT` / `GITHUB_RUNNER_PSQL_TLS=PASS` / `AUTHENTICATED_PREFLIGHT=NOT_RUN` / `COMMERCIAL_GO=NO_GO`.

## Evidência do mesmo Work Linux

O Work existente encontrou o projeto Master e sincronizou a branch `integration/v1-cloudflare-master-20261120` em `afa1dc4e73b8837e977b7f633eeca2ba89a3f344`. Alterações locais preservadas, Node 24.22.3, certificado CA, integridade do módulo original e gates SQL fechados conferiram. A validação no Work ficou **bloqueada por infraestrutura do executor**, não por falha de schema, segurança ou SQL:

- `WORK_PSQL=BLOCKED_NOT_AVAILABLE`.
- `DNS=NOT_VERIFIED_RESOLUTION_FAILED`.
- `PG_TCP/STARTTLS/TLS=NOT_RUN`.
- `ENV_FILE_ACCESSED=NO`, `SQL_EXECUTED=NONE`, `MIGRATIONS=NOT_RUN`, `REMOTE_WRITES=NONE`.

**Não interpretar o Work como diagnóstico negativo do banco Supabase:** é uma rota de rede alternativa, distinta do runner CI.

## Fallback sem senha testado de fato

Em [GitHub Actions 44804176608](https://github.com/luit77yak-dev/neroxa-master/actions/runs/44804176608), utilizando a mesma branch e o host previamente confirmado pelo proprietário `aws-0-us-east-1.pooler.supabase.com:5432`:

| Verificação no GitHub Actions | Resultado |
| --- | --- |
| `RUNNER_PSQL` | `PASS` |
| `RUNNER_PSQL_VERSION` | `psql (PostgreSQL) 18.7 (Ubuntu 18.7-1.pgdg26.04+2)` |
| `RUNNER_OPENSSL` | `PASS` |
| DNS | `PASS` |
| TCP | `PASS` |
| PostgreSQL STARTTLS | `PASS` |
| TLS CA + hostname | `PASS` com CA pública SHA-256 pinada |
| TLS | `TLSv1.3` |
| Autenticação PostgreSQL | `NOT_RUN` |
| SQL remoto | `NONE` |

A versão do cliente 18.7, por si, não constitui evidência de uma sessão no servidor PostgreSQL comercial 17. A identidade de tenant e privileges precisa ser confirmada somente **após autenticação**.

**Conclusão:** este runner pode prover **transporte** para um futuro `HOSTED_PREFLIGHT`, sem necessidade de reinstalar Work, abrir o DNS isolado do Work ou duplicar o laboratório.

## Separação de autoridade

1. A identidade `neroxa_f02_preflight` já existe **sem senha**, foi conferida sem acesso a tabelas/funções privilegiadas, 2 conexões máximas e expiração 15/12/2026.
2. `tools/hosted-admission/preflight-policy.json` segue em `CLOSED`: host/role/CA nominal/grant/founder/aprovações ainda não foram admitidos.
3. A release `audits/02a5/hosted-release/MANIFEST.json` ainda possui `execution_authorized=false`, `approval=null`; 33 SQLs **não podem** ser executadas por esta liberação de transporte.
4. `tools/hosted-admission/preflight-entry.mjs` exige contexto manual de `workflow_dispatch`, proteção de branch e environment `f02-hosted-preflight`, assinatura de grant, senha protegida, CA e recibos privados. **Não inserir secrets antes de verificar/provisionar as proteções**, nem colocar valores em PR, chat, prompt do Work, .env, argumentos CLI, job output ou artifacts.
5. Necessidade separada para autorizar acesso: um operador privado deve configurar credencial temporária da role. `psql \password neroxa_f02_preflight` exige **sessão previamente autenticada como administrador** do projeto comercial. O Work isolado não atende aos requisitos de rede e CLI atuais; usar terminal privado comprovado e rede permitida. `ALTER ROLE ... PASSWORD 'plaintext'` no SQL Editor, público ou em GitHub Actions não é solução aceitável.
6. Até existir autenticador privado seguro e environment protegido auditado, manter `HOSTED_PREFLIGHT=NOT_RUN`, apesar de `RUNNER_PSQL_TLS=PASS`.

## Próximos passos sem redesenhar o laboratório

- **Work Linux**: continua como laboratório de código/source, sem tentar forçar DNS ou instalar pacotes em ambiente isolado para contornar segurança.
- **Runner GitHub**: validar proteção real de environment/branch e configuração da autoridade sem solicitar segredos.
- **Operador com sessão privada**: provisionar a credencial de `neroxa_f02_preflight` via terminal psql protegido e depois adicionar segredo apenas na interface restrita aprovada.
- Quando os gates estiverem satisfeitos, executar somente o **HOSTED_PREFLIGHT read-only** e confirmar `READ_IDENTITY`, `READ_CATALOG`, duas sessões/pids distintos, timeout e cancelamentos; revisar o resultado antes de **separadamente** autorizar `SQL_RELEASE`.

**Nenhum banco, Role, DDL, LAB, Cloudflare, Hyperdrive, DNS ou serviço comercial foi alterado por este fallback.**

# NEROXA V1 — retomada F02 no Work Linux existente (20/11/2026)

**Próximo passo ativo:** `WORK_F02_READINESS` — prova local de ferramentas/CA/TLS **SEM** acesso a credenciais. Não repetir LAB, homologações históricas, build ou migrações. **Comercial continua NO-GO.**

## Entrega atual

- Branch exclusiva: `luit77yak-dev/neroxa-master` → `integration/v1-cloudflare-master-20261120`; não editar `main`.
- Script read-only: [work-linux-f02-readiness.sh](../tools/hosted-admission/work-linux-f02-readiness.sh).
- Meta real, já conferida em Supabase: projeto `iefaoaqzltvpfabyeelj` ativo, role `neroxa_f02_preflight` com LOGIN mas `PASSWORD NULL` e privilégio zero em tabelas de negócio, 2 conexões permitidas, expiração 15/12/2026. São 59 migrações históricas; 33 da nova release **não aplicadas**.
- Endpoint fornecido pelo proprietário: `aws-0-us-east-1.pooler.supabase.com:5432` (Supavisor Session), banco `postgres`.
- Root CA público candidato, fornecido pelo proprietário, SHA-256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`; TLS1.3/CA/hostname PASS no GitHub Actions [44795571740](https://github.com/luit77yak-dev/neroxa-master/actions/runs/44795571740). Não é prova de login PostgreSQL.

## Instrução para o **mesmo** Work Linux

> Continuar **no Work Linux já existente**, sem criar ou restaurar laboratório, sem reinstalar dependências desnecessariamente, sem refazer o build ou os testes R14. Identificar o checkout de `luit77yak-dev/neroxa-master` e atualizar **somente a branch** `integration/v1-cloudflare-master-20261120`, preservando trabalho não commitado. No diretório raiz desse checkout, executar:
>
> ```sh
> bash tools/hosted-admission/work-linux-f02-readiness.sh
> ```
>
> **Não pedir, carregar, imprimir, copiar ou armazenar senhas, tokens, .env, PG*PASSWORD, arquivos pgpass ou credentials do LAB. Não abrir fluxo de migrações, criar contas, grants, Hyperdrive, Worker, URLs ou deploy.** Retornar somente os indicadores de status do script, sem IDs de sessão, credenciais ou logs integrais. Caso `psql`, OpenSSL ou TLS estejam indisponíveis, registrar `WORK_F02_READINESS=BLOCKED` e o marcador técnico, sem tentar usar fallback inseguro. Nenhum serviço externo exige reset.

**Saídas esperadas:** `WORK_PSQL`, `CA_SHA256`, `CA_CERT_FORMAT`, `HOSTED_CORE_BLOB`, `SQL_GATES_CLOSED`, `DNS`, `PG_TCP`, `PG_STARTTLS`, `PG_TLS_CA_HOSTNAME`, `POOLER_NETWORK_TLS`, `WORK_F02_READINESS`. O status só descreve disponibilidade de pré-requisitos. Nenhum login ou preflight autenticado é feito pelo script.

## Próxima fase após precheck PASS (não executada por esta entrega)

1. **Validar canal realmente privado**: o Work agent/chat/transcrição/terminal gravado não é automaticamente um cofre de credenciais. Nunca digitar senha em uma tarefa do Work, conversa, código, comando com argumento literal, CI ou log. Se o Work Linux não oferecer um terminal interativo comprovadamente privado, executar o passo de segredo em um terminal local sob controle do proprietário, mantendo o mesmo destino comercial.
2. Em terminal PostgreSQL autenticado como administrador do **projeto comercial** (não LAB), com libpq `sslmode=verify-full` e CA do Supabase, confirmar a identidade por consulta sem dados e só então usar `\\password neroxa_f02_preflight` para definir a senha **interativamente, sem echo e sem literais SQL**. A documentação PostgreSQL confirma hash no cliente; orientação Supabase 2026-11-04 alerta contra credenciais em erros e logs: https://supabase.com/kb/troubleshooting/provisioning-credentials-without-log-exposure. Esse comando **NÃO** deve ser colado no prompt de um agente automatizado que capture terminal.
3. A credencial de admin `postgres` é diferente da senha nova da role. Não resetar senha admin nem alterar `Enforce SSL` ou Temporary Access sem aprovação explícita. Não enviar senha ao ChatGPT.
4. **Antes de executar o HOSTED_PREFLIGHT real**, preparar policy nominativa e recibo assinado, evidence root privado, aprovação de ambiente/proteção, operador, nonce, commit e janela. `preflight-policy.json` permanece `CLOSED`, e a role sem senha atual **não consegue autenticar**.
5. Após autorização nominativa, executar somente as consultas fechadas de pré-flight por role `neroxa_f02_preflight` em Supavisor Session, duas conexões persistentes e `verify-full`; identidade PostgreSQL, ACL, timeout e cancelamento confirmados na captura. O preflight por si só **não autoriza** a release SQL.
6. A cadeia de **33 SQLs** requer **admissão separada SQL_RELEASE** e executor de migração reconciliado com transporte; a role de preflight **não** serve para DDL e não será utilizada como runtime Hyperdrive. Somente após aprovação, instalar release e testar a segurança.

## Segurança e invariantes

- O script contém **zero consultas SQL, zero solicitações de senha e zero operações de escrita remota**. Ele testa SHA-256 da CA, certificado, disponibilidade de ferramentas, módulo original recuperado, manifesto/policy fechados e DNS/TCP/TLS externo para host fixo.
- Um `WORK_F02_READINESS=PRECHECK_PASS_NOT_AUTHENTICATED` é progresso técnico, **não** prova de login ou liberação comercial.
- Nenhum segredo foi criado, lido ou transportado por esta entrega. **Nenhuma mudança adicional no banco comercial ou LAB**.

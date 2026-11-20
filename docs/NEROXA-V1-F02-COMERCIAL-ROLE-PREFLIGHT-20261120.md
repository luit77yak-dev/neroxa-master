# NEROXA V1 — identidade PostgreSQL exclusiva de preflight (20/11/2026)

**Resultado: ROLE_BOOTSTRAP=PASS / PASSWORD_AUTH=DISABLED / HOSTED_PREFLIGHT=NOT_RUN / SQL_RELEASE=NOT_AUTHORIZED / COMERCIAL=NO-GO.**

## Autorização e fronteira

Após o proprietário autorizar a continuação do preflight comercial, foi aplicada **somente** a preparação de uma identidade PostgreSQL de verificação técnica no projeto `neroxa-solutions-hub` (`iefaoaqzltvpfabyeelj`). Não se criou login do Hyperdrive, não se executou nenhuma das 33 unidades da release, não se alterou o LAB, não se fez deployment e não se solicitou ou expôs senha.

- Migração aplicada (API Supabase): `20261120185812_neroxa_v1_f02_passwordless_preflight_login_20261120` (`success=true`).
- SQL reproduzido como **evidência NÃO REEXECUTÁVEL**: [preflight-role-bootstrap-applied-20261120.sql](../audits/02a5/hosted-admission/preflight-role-bootstrap-applied-20261120.sql).
- Migrações comerciais totais após: **59** (58 anteriores + esta preparação administrativa), sem alterar o manifesto candidato imutável de 33 SQLs.
- Role criada: `neroxa_f02_preflight`, `LOGIN`, senha **NULL** (confirmada como `pg_authid.rolpassword IS NULL = true`), `NOINHERIT`, `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, `CONNECTION LIMIT 2`, `VALID UNTIL 2026-12-15T00:00:00Z`.
- O login PostgreSQL fica **incapaz de autenticação por senha enquanto a senha permanecer NULL**; esta é uma configuração preparatória, não uma prova da sessão autenticada.
- A função legada `public.calculate_public_order_line_price(uuid,uuid,uuid,text,text,jsonb,jsonb)` tinha EXECUTE para **PUBLIC**, além de concessões explícitas para `anon`, `authenticated` e `service_role`. Foi removida **somente** a concessão para PUBLIC. Uma leitura independente confirmou que as três concessões explícitas permanecem e que o papel de preflight não pode executar a função.
- Não foi alterada a definição SQL da função, regras RLS, objetos de clientes, dados ou acessos dos três papéis acima. Não concluir que os fluxos de checkout estejam homologados: somente as permissões foram reconferidas.

## Pós-verificação real de privilégios (consulta no comercial)

| Controle | Resultado |
| --- | --- |
| `rolcanlogin` | true (sem senha) |
| `rolsuper`, `rolbypassrls`, `rolcreatedb`, `rolcreaterole`, `rolreplication`, `rolinherit` | todos false |
| `rolconnlimit` | 2 |
| `rolvaliduntil` | 2026-12-15T00:00:00Z |
| Role memberships | 0 |
| Business table SELECT privileges | 0 |
| Business table write privileges | 0 |
| Owned business objects | 0 |
| Business schema CREATE privileges | 0 |
| Database CREATE privilege | false |
| SECURITY DEFINER functions found | 19 |
| SECURITY DEFINER executable by role | **0** |
| SECURITY DEFINER executable by PUBLIC | **0** |
| `anon`, `authenticated`, `service_role` EXECUTE on affected legacy function | **true / true / true** |
| Commercial project status | `ACTIVE_HEALTHY` |
| Orders | 0 |
| Base plans preserved | 18 |

## Transport already verified, but not database login

- Session pooler owner-supplied: `aws-0-us-east-1.pooler.supabase.com:5432`, database `postgres`, tenant `iefaoaqzltvpfabyeelj`.
- Root CA was supplied by owner, byte-equal to previously archived public `Supabase Root 2021 CA`. TLSv1.3 / CA / hostname verified in [GitHub Actions 44795571740](https://github.com/luit77yak-dev/neroxa-master/actions/runs/44795571740).
- **This does not prove auth or tenant binding**. Server backend identity, read-only transactional behavior, dual-session continuity and cancellation are still `NOT_RUN`.

## Remaining gate — secure password and protected admission (DO NOT paste secrets)

1. **Preferred no-password approach, subject to separate configuration approval:** Supabase now documents **Temporary Access** via personal/dashboard token with a team-member mapping restricted to a specific PostgreSQL role and expiration. Check the commercial project's **Database Settings → Enable temporary access** and SSL-enforcement status first. This feature is OFF by default and requires SSL enforcement and a supported PostgreSQL version (commercial 17.11 meets the stated 17.6 minimum). **Do not enable without assessing whether SSL enforcement would restart the database**; do not send or store a management PAT/token in chat or unprotected CI. No JIT feature was enabled or a mapping issued in this step. Documentation: https://supabase.com/docs/guides/platform/temporary-access ; https://supabase.com/docs/guides/platform/team-database-access.
2. **Alternative if Temporary Access cannot be safely used:** In an already authenticated, private `psql` terminal with admin authority, use the interactive `\\password neroxa_f02_preflight` command, which prompts without echo and hashes client-side. **Avoid a literal `ALTER ROLE ... PASSWORD 'secret'` in SQL Editor**; a failed SQL statement, extended logging or query history may expose the value. Never disclose a password/verifier in chat, source, public CI artifacts or logs. Official KB updated 2026-11-04: https://supabase.com/kb/troubleshooting/provisioning-credentials-without-log-exposure.
3. Provision **only** the resulting short-lived approved credential to the protected execution environment, if feasible, by its private UI (e.g. `F02_PREFLIGHT_PASSWORD` as a GitHub Environment secret with reviewed approval). Confirm the environment protection controls and token scope before storing anything. A management PAT may have permissions beyond SQL and must not be assumed safe as a general CI secret; a short-lived manually operated Work session is an alternative.
4. Admit a reviewed `tools/hosted-admission/preflight-policy.json` *only with founder/operator scoped approval*, pinned host `aws-0-us-east-1.pooler.supabase.com`, role `neroxa_f02_preflight`, CA exact SHA-256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`, protected GitHub environment `f02-hosted-preflight`, reviewed signing authority, bounded run ID/commit/time and recovery.
4. Run **only** the signed `HOSTED_PREFLIGHT` read-only via Supavisor Session using `sslmode=verify-full`. Capture evidence of `pg_backend_pid`, `backend_start`, actual identity, two distinct sessions, timeouts, cancellations and grants. No DDL/SQL release from that user.
5. Separately approve `SQL_RELEASE`, install 33 units with native PostgreSQL admin role under a second, separately authorized session/transport (the SQL installer still points to direct IPv6 and must be reviewed first). Only afterward create/configure a **different** minimum-privilege runtime Hyperdrive credential and perform F01/F02/SEC-18/E2E.

**Shipped gates intentionally remain CLOSED:** the policy file has `state=CLOSED`, `host=null`, `role=null`, `caSha256=null`, signing authority unset; `MANIFEST.json` remains `execution_authorized=false`, `approval=null`. The role bootstrap is not authority to change either.

**Rollback if ever specifically authorized:** first revoke any future password/access; no current password exists. If necessary after confirming no dependent grants/connections, `DROP ROLE neroxa_f02_preflight` and optionally restore EXECUTE TO PUBLIC only through a security review. No automatic cleanup or rollback was attempted.

# NEROXA V1 — transporte PostgreSQL comercial (prova sem credenciais)

Data: 2026-11-20 | Estado **NETWORK PARTIAL / AUTH NOT_RUN / SQL_RELEASE CLOSED / GO NO-GO**.

## Prova real: GitHub Actions sem senha

- Execução: https://github.com/luit77yak-dev/neroxa-master/actions/runs/44788991692
- Commit testado: `bb9c20efa793dc8665eb32faed208847d3fc7905`.
- Probe: `tools/hosted-admission/commercial-network-tls-probe.py` (SSLRequest PostgreSQL com `ssl.create_default_context()`, hostname e CA quando a conexão fosse possível).
- Projeto comercial aprovado: `iefaoaqzltvpfabyeelj`; host direto `db.iefaoaqzltvpfabyeelj.supabase.co:5432`.
- Evidência do log **do job**:
  - `DNS_A=0`
  - `DNS_AAAA=1`
  - `DNS=PASS`
  - `PG_TCP_IPV4=NO_ADDRESS`
  - `PG_TCP_IPV6=NOT_VERIFIED`
  - `PG_TCP=NOT_VERIFIED`
  - `PG_STARTTLS=NOT_VERIFIED`
  - `PG_TLS_HOSTNAME_CA=NOT_VERIFIED`
  - `PG_TLS_PROTOCOL=NONE`
  - `SQL_EXECUTED=NONE`
  - `CREDENTIALS_ACCESSED=NONE`
  - `AUTHENTICATED_LIBPQ_PREFLIGHT=NOT_RUN`.
- O workflow GitHub concluiu `SUCCESS` **somente porque executou a sondagem e registrou resultado**; isto **não** significa conexão TCP/TLS aprovada. Não há prova de erro ou indisponibilidade do banco: `get_project` Supabase o indica `ACTIVE_HEALTHY`.

## Divergência de transporte identificada

O arquivo `tools/hosted-admission/preflight-policy.json` declara `transport=SUPAVISOR_SESSION`, `port=5432`, `host=null`, `role=null`, autoridade/CA não configuradas, `state=CLOSED`. Porém, `tools/hosted-admission/session.mjs`, na versão atual, **codifica `host=db.iefaoaqzltvpfabyeelj.supabase.co port=5432 dbname=postgres user=postgres sslmode=verify-full sslrootcert=system`**, ou seja, **rota direta**.

Isso não é permissão para alterar o executor e escolher um pooler sem revisão: `SQL_RELEASE` exige conexão persistente, evidência de `pg_backend_pid`/`backend_start`, identidade, CA/hostname, reserva de sessão e recuperação. A correspondência entre **política aprovada, rota efetivamente discada e prova da conexão** precisa ser resolvida antes de preencher policy ou executar DDL.

## Rotas possíveis (nenhuma executada)

**Para `HOSTED_PREFLIGHT`/instalador SQL**, opções de admissão a revisar:
- **A. Hospedagem com IPv6 utilizável:** usar host PostgreSQL direto, `sslmode=verify-full` e CA confiável; preservar `session.mjs` se o destino e a identidade forem aprovados. O GitHub Actions hospedado neste ensaio não comprovou essa rota.
- **B. Supavisor em modo sessão (porta 5432, não transaction pooler):** obter **hostname exato do dashboard Supabase**, usuário formato apropriado e CA/hostname corretos em canal seguro; adaptar/revisar o executor para o alvo e identidade aprovados, demonstrar persistência de backend entre transações e testar negativos. **Nunca deduzir um hostname regional de exemplos**.

**Para Hyperdrive comercial**, permanece a recomendação Cloudflare de **conexão direta Supabase** independente, com user e password exclusivos de runtime, `verify-full`, cache desativado e RPC grants revistos. Essa conexão Cloudflare→Supabase não foi testada e não pode ser simulada por GitHub Actions.

## Observações independentes do problema de rede

- Após limpeza autorizada: 0 organizações, pedidos, configurações storefront, contratos e assinaturas de teste; catálogos e admins preservados.
- 33 tabelas `public` com RLS; 58 migrações antigas; release `neroxa_v1` não instalada.
- Manifesto `audits/02a5/hosted-release/MANIFEST.json`: 33 unidades, `execution_authorized=false`, `approval=null`.
- `preflight-policy.json`: `CLOSED`; nenhuma autoridade/host/role/CA aprovada.
- Hyperdrive atual `neroxa-v1-i04-lab` permanece vinculado ao LAB `gomexvhvecvvfbdzhjct`; não substituir ou expor.
- Suíte offline para identidade Cloudflare continua candidata apenas, ainda sem grant operacional/nonce ledger seguro/HTTP testes.

## Próximo gate

1. Obter por mecanismo seguro **host do pooler sessão e disponibilidade de rota** para o executor, se a opção B for aprovada, ou escolher host IPv6-capaz para opção A.
2. Fazer teste `sslmode=verify-full` real, com identidade de servidor, role e backend de sessão sem expor segredos; comparar com host/reference de aprovação.
3. Reconciliar concessões `service_role` da cadeia com a futura role Hyperdrive, antes de dar acesso à API comercial.
4. Apenas depois aprovar o `HOSTED_PREFLIGHT`, `SQL_RELEASE` e `HOSTED_SERVER` separadamente; executar negativos de RLS/SEC-18 e testes HTTP de checkout/tracking com rollback.

**Nenhum dado, role, grant, Hyperdrive, Worker, DNS, `main`, manifesto ou policy foram alterados por esta avaliação.**

Referências: https://supabase.com/docs/guides/database/connecting-to-postgres ; https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits ; https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/

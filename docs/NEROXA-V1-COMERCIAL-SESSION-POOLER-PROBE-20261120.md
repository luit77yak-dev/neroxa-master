# NEROXA V1 — Session pooler: sondagem sem segredo preparada (2026-11-20)

**Estado:** `POOLER_HOST=NOT_IDENTIFIED`, `POOLER_TLS=NOT_RUN`, `HOSTED_PREFLIGHT=NOT_RUN`, `SQL_RELEASE=CLOSED`, `COMMERCIAL=NO-GO`.

## Fonte do endereço exato

A integração conectada Supabase confirma o projeto comercial `iefaoaqzltvpfabyeelj`, `us-east-1`, `ACTIVE_HEALTHY` e host PostgreSQL **direto** `db.iefaoaqzltvpfabyeelj.supabase.co`, mas **não fornece o hostname do pooler compartilhado**. A documentação oficial informa formato genérico `aws-[region].pooler.supabase.com`, que **não basta para atestar qual pooler pertence ao projeto**.

Abrir somente **Supabase Dashboard → neroxa-solutions-hub → Connect → Session pooler**. Copiar **apenas o hostname**, sem o usuário `postgres.<project_ref>`, senha, URL de conexão ou token. A porta deve ser **5432**, não transaction pooler `6543`. Não derivar hostname nominal por região ou aceitar exemplo de documentação como identidade de origem.

## Sonda pronta e testada

- Script: `tools/hosted-admission/session-pooler-tls-probe.py`; recebe `--host <hostname_do_painel>`.
- **Sem credenciais** e sem leitura de `.env`, sessão SQL, modificações no banco ou releases.
- Valida hostname estritamente sob `.pooler.supabase.com` e apenas endereços IP globais resultantes de DNS; porta fixa `5432`; envia apenas `SSLRequest` PostgreSQL e negocia TLS com SNI, validação de CA e correspondência de hostname. Falhas retornam código `78` em vez de declarar PASS; verificação positiva retorna `0`.
- Testes sintéticos: `tools/hosted-admission/session-pooler-tls-probe.test.py` — **4/4 PASS**, cobrindo allowlist, rejeição de host malicioso/com URL, rede privada e porta fixa, executados no CI [44792467950](https://github.com/luit77yak-dev/neroxa-master/actions/runs/44792467950). **Nenhum teste real do pooler foi executado**, pois falta hostname confirmado.
- Comando a usar somente depois da confirmação do host:
  ```sh
  python3 tools/hosted-admission/session-pooler-tls-probe.py --host 'HOSTNAME_EXATO_DO_CONNECT'
  ```
- Este PASS, mesmo em rede, não demonstra vínculo da sessão ao projeto, autenticação, versão PostgreSQL, permissões, persistência de backend nem readiness. Essas provas exigem preflight de leitura `psql` autorizado com role própria, `sslmode=verify-full`, CA e documento `HOSTED_PREFLIGHT` assinado.

## Fronteira para liberar as SQLs

1. Receber hostname do **Connect → Session pooler** do projeto `iefaoaqzltvpfabyeelj`.
2. Executar a sonda em runner com IPv4 e verificar `PG_TLS_CA_HOSTNAME=PASS`; nunca usar DNS genérico como identidade única de projeto.
3. Reconciliar host e usuário com policy/recibo `HOSTED_PREFLIGHT`; obter credencial segura fora do chat, role mínima, CA e prova de autorização, ambiente protegido e recuperação. O executor de preflight atual tem testes sintéticos PASS mas o gate nominal permanece `CLOSED`.
4. Fazer o preflight autêntico **somente leitura**, observar backend persistente/cancelamento e as negativas. **Após** aprovação separada de SQL_RELEASE, executar as 33 unidades no executor de sessão revisado com integridade e rollback. Hyperdrive runtime comercial permanece etapa distinta e não substitui executor SQL.
5. Liberação HTTP real e `HOSTED_SERVER` somente após testes F01/F02/SEC-18, decisão operacional e rollback.

**Nenhuma alteração de dados SQL, grants, Supabase, Cloudflare, LAB, main, DNS ou deploy nesta etapa.**

Fontes: https://supabase.com/docs/guides/database/connecting-to-postgres ; https://supabase.com/dashboard/project/iefaoaqzltvpfabyeelj?showConnect=true

# F02 — adaptação focal do preflight (candidata, FECHADA)

Base: PR52, commit `0cb27bfe0a74babf2eba386a7fc52da231749b36`.
Implementação isolada de leitura; `session.mjs`, UnitAdmission, migrador,
Delivery, 33 unidades SQL e recuperação da PR51 não foram modificados.
Não há conexão hospedada, usuário, environment ou credencial provisionados.

## Delta

- `readonly-preflight.mjs`: escopo assinado **HOSTED_PREFLIGHT**, separado de
  SQL_RELEASE/HOSTED_SERVER. Liga projeto/release, host exato do pooler, role,
  hash da CA, commit/ref protegida, environment, operador/fundador, run_id,
  primeira tentativa, operações e janela. Revalida antes/depois dos awaits.
- `preflight-policy.json`: host, role, CA e autoridade continuam NULL; estado
  CLOSED. Não aceita autoridade ou permissão fornecida por flag de laboratório.
- `preflight-queries.mjs`: API de consultas fechadas. Identidade declarada precisa
  coincidir com a observada, PID/backend_start estáveis, usuário/session_user
  dedicados, sem SUPERUSER/BYPASSRLS/CREATE ROLE/CREATE DB/REPLICATION/INHERIT,
  sem memberships, ownership de tabelas de negócio, CREATE em schema/banco,
  SELECT/DML de negócio ou EXECUTE em funções SECURITY DEFINER da aplicação.
  Permissão via PUBLIC também causa BLOCKED. Não tenta corrigir grants sozinho.
- TLS libpq `verify-full`, CA com hash aprovado e hostname nominal do Supavisor
  session/5432. Login pooled usa role.project-ref, SQL confirma role dedicada.
  Não se exige `actor=postgres`; código de migração continua separado e fechado.
- Credencial somente em PGPASSFILE0600/diretório0700. Não passa em argv, logs,
  ambiente do subprocesso, JSON ou relatório. Nenhum fallback para postgres.
- Captura reutiliza criação exclusiva, stdout/stderr e limite65536 por resposta;
  preflight adiciona limite agregado65536, máximo32 respostas, releitura dos dois
  streams, correspondência com bytes interpretados e recibos encadeados locais
  antes do parsing. Custódia externa autenticada ainda não foi comprovada.

Timeout/cancelamento candidatos: A executa somente pg_sleep em READ ONLY, B
observa a própria role. Timeout exige57014 por statement timeout; cancelamento
exige alvo PID+backend_start+role e query de espera exata, retorno true,
57014 por user request e observação independente de sessão idle/sem transação.
Boolean/exit/timeout do processo não viram confirmação. Sem retry, compensação,
teardown ou encerramento remoto automático. Término local não confirma servidor.
Locale/mensagem de erro desconhecida, perda de sessão ou stdout/stderr tardio
implicam BLOCKED. Queries com efeitos de aplicação não são expostas pela API.

## Workflow candidato (não ativo)

`f02-hosted-preflight.workflow.yml` fica FORA de `.github/workflows`.
Somente workflow_dispatch; nenhum push/PR/schedule. Primeiro job sem credencial
confere metadata do environment EXISTENTE, política nominal, ref protegida,
primeira tentativa, repositório público e aprovação obrigatória exclusivamente
do fundador, sem bypass administrativo. Proteção desconhecida/ausente bloqueia.
Segundo job depende do primeiro e da aprovação real do environment.
O flag prevent_self_review observado é respeitado: se true, o operador que
aciona precisa ser outro usuário; se false, o fundador ainda aprova explicitamente.
Não se presume revisor independente nem aprovação pela revisão por IA.

Checkout de SHA exato e ações pinadas; segredo disponível somente no passo do
preflight; sem instalação, Docker, cache/artifact upload ou suítes antigas.
Usa o psql já disponível: ausência implica BLOCKED. Node22.23.0 configurado;
os novos testes foram executados localmente em Node24.19.0, não no runner.
Não há promessa de custo externo zero: runner padrão público tem computação
gratuita; conexões/franquia e custódia ainda exigem comprovação.

## Provisionamento e descarte — exigem autorização posterior

1. Aprovar host Session Pooler do Connect, CA/origem/hash, nome e validade da
   identidade de leitura, operador e limites. Administrador provisiona LOGIN
   NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT, sem
   memberships/ownership/grants de negócio; CONNECT e catálogo necessários,
   no máximo duas conexões. Conferir PUBLIC e direitos efetivos, não conceder
   pg_signal_backend/pg_monitor nem tocar ACL global para forçar admissão.
2. Criar/configurar environment `f02-hosted-preflight` e ref protegida, aprovação
   exclusiva do fundador e ausência de bypass. Depositar senha diretamente
   no secret F02_PREFLIGHT_PASSWORD; CA pública em F02_PREFLIGHT_CA_PEM; nunca
   no chat. Aprovar chave pública autenticada/política de validade, preencher
   política em revisão e publicar somente o workflow manual aprovado.
3. Autorizar uma execução específica. Ao dispatch, o job aguarda o environment;
   assinar HOSTED_PREFLIGHT ligado ao run_id/commit/ref/operador/janela reais,
   registrar no secret F02_PREFLIGHT_GRANT e aprovar explicitamente o job.
   Nenhum desses valores operacionais foi preenchido nesta entrega. Permissão
   deve cobrir READ ONLY, SET LOCAL transitório e cancelamento da própria espera,
   sem instalação de endpoint, migração ou RPC de negócio.
4. Descarte remoto separado e autorizado: verificar fim das próprias sessões,
   desabilitar LOGIN, remover secret/grants temporários e role somente após
   conferir ausência de dependências/ownership. NOLOGIN não termina sessões.
   Sem DROP OWNED/CASCADE ou cleanup remoto automático; incerteza mantém HOLD.
   O código remove apenas seu arquivo LOCAL de senha e fecha seus clientes,
   preservando capturas/recibos e registrando a limitação sobre o servidor.

O login de preflight não executa DDL. Privilégios/ownership da futura identidade
migradora precisam revisão e autorização próprias; não se resolve concedendo
postgres/BYPASSRLS. Este patch não adapta nem ativa a instalação da release.

## Validação e limites

18 PASS /0 FAIL no log final, somente testes focais novos, com duas instâncias
de Node artificiais em vez de libpq/banco. Importações foram testadas com spawn
e fetch proibidos; entry e gate reais com política fechada retornam78 sem senha.
Negativas cobrem assinatura/escopo/destino/identidade/CA/janela, privilégios,
troca de sessão, ambiente, SQLSTATE incompleto, false cancelamento e buffer alterado.
Um primeiro ensaio teve14 PASS/1 FAIL por classificação ambígua da fixture; foi
corrigida a identificação da espera artificial. Negativas finais verificam que
atingiram os caminhos de cancelamento pretendidos, não um timeout acidental.

TLS real, autenticação do login customizado, metadata GitHub com o token do job,
cancelamento hospedado, psql/libpq do runner, grants efetivos e custódia externa:
NOT RUN/BLOCKED, nunca PASS por fixtures. YAML parseado localmente; não houve CI.
F01/F02 abertos. Comercial NÃO LIBERADO. Sem autorização de implantação.

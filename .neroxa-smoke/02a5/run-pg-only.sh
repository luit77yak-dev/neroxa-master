#!/usr/bin/env bash
# NEROXA 02A.5 — PLANO preparado, NÃO AUTORIZADO para executar.
# Este executor só inicia um PostgreSQL nativo descartável e lê catálogo.
# Não aplica baseline, predecessores, overlays, DDL da Neroxa, dados nem SEC-18.
set -Eeuo pipefail

case "${1:---plan}" in
  --plan)
    cat <<'MSG'
PG_ONLY_02A5: PREPARAÇÃO ESTÁTICA.
Para uma eventual execução: autorização nova e específica da Coordenação,
checkout imutável Master, runner GitHub-hosted padrão GRATUITO, imagem ID exata,
Docker --network none, zero portas, SQL somente leitura, cleanup.
Este script não substitui Auth/PostgREST/Storage/Realtime da Supabase.
MSG
    exit 0 ;;
  --run-after-specific-authorization) ;;
  *) echo 'Uso: bash run-pg-only.sh --plan | --run-after-specific-authorization' >&2; exit 64 ;;
esac

if [[ "${NEROXA_PG_ONLY_AUTHORIZED:-}" != 'yes-explicitly' ]]; then
  echo 'STOP: execução não autorizada pela Coordenação Geral' >&2; exit 78
fi
if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted ]]; then
  echo 'STOP: somente GitHub Actions hospedado padrão' >&2; exit 78
fi
if [[ "${GITHUB_REPOSITORY:-}" != 'luit77yak-dev/neroxa-master' ]]; then
  echo 'STOP: repositório de origem incorreto' >&2; exit 78
fi
if [[ "$(git rev-parse HEAD)" != 'c149f802adf1922be588319cc98a798c7b387ea8' ]]; then
  echo 'STOP: Master não corresponde à fonte congelada da receita' >&2; exit 78
fi
if [[ "$(docker info --format '{{.Driver}}')" != 'overlay2' ]]; then
  echo 'STOP: Docker driver diferente de overlay2' >&2; exit 78
fi
if [[ "$(gh api "repos/$GITHUB_REPOSITORY" --jq '.private')" != 'false' ]]; then
  echo 'STOP: repositório não comprovado público' >&2; exit 78
fi
# PG-only: substitui o orçamento MULTISSERVIÇO de 28GiB do preflight 02A.3.
# Limiares candidatos (nao sao tamanho garantido da imagem):
# >=8GiB ANTES do pull; >=4GiB DEPOIS do pull, antes do start.
# Verifica ambos os filesystems: RUNNER_TEMP e DockerRootDir.
# Mantem Docker overlay2, >=6GiB de MemAvailable, >=2 CPUs e runner padrao.
pg_resource_guard() {
  python3 - "$1" <<'PYRESOURCE'
import json, os, pathlib, shutil, subprocess, sys
stage=sys.argv[1]
assert stage in ('before-pull','after-pull'), 'STOP: fase de guarda desconhecida'
assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('RUNNER_ENVIRONMENT')=='github-hosted', 'STOP: runner nao elegivel'
assert pathlib.Path.cwd().as_posix().startswith('/home/runner/'), 'STOP: workspace fora do runner'
driver=subprocess.check_output(['docker','info','--format','{{.Driver}}'],text=True).strip()
docker_root=subprocess.check_output(['docker','info','--format','{{.DockerRootDir}}'],text=True).strip()
assert driver=='overlay2', 'STOP: Docker deve usar overlay2'
assert docker_root.startswith('/') and pathlib.Path(docker_root).is_dir(), 'STOP: DockerRootDir desconhecido'
assert os.environ.get('RUNNER_TEMP') and pathlib.Path(os.environ['RUNNER_TEMP']).is_dir(), 'STOP: RUNNER_TEMP ausente'
free_temp=shutil.disk_usage(os.environ['RUNNER_TEMP']).free
free_docker=shutil.disk_usage(docker_root).free
mem=int(next(x.split()[1] for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))*1024
cpus=os.cpu_count() or 0
required=(8 if stage=='before-pull' else 4)*1024**3
passed=free_temp>=required and free_docker>=required and mem>=6*1024**3 and cpus>=2
print('PG_ONLY_RESOURCE_PREFLIGHT='+json.dumps({'stage':stage,'status':'PASS' if passed else 'BLOCKED','docker_driver':driver,'runner_temp_free_bytes':free_temp,'docker_root_free_bytes':free_docker,'required_free_bytes_each':required,'available_memory_bytes':mem,'cpus':cpus,'image_size_unverified':stage=='before-pull'},sort_keys=True))
assert passed, 'STOP: recursos insuficientes na fase '+stage
PYRESOURCE
}
pg_resource_guard before-pull

# Tags podem se mover. A comparação a seguir é com ID da IMAGEM LOCAL histórica,
# não com digest do manifesto de distribuição/arquitetura do registry.
img='docker.io/supabase/postgres:17.11.0.004'
expected='sha256:94fe95acfce6e1d41106ff2abd4c08e7932a6941d453499a56f8a620a473de1a'
python3 - <<'PY'
import json
p='audits/02a5/EXPECTED-IMAGES.json'
x=json.load(open(p))
assert x['supabase/postgres:17.11.0.004']=='sha256:94fe95acfce6e1d41106ff2abd4c08e7932a6941d453499a56f8a620a473de1a'
PY
# Baixar a imagem é atividade operacional: somente APÓS autorização específica.
docker pull "$img" >/dev/null
actual="$(docker image inspect "$img" --format '{{.Id}}')"
if [[ "$actual" != "$expected" ]]; then
  echo 'STOP: identidade de imagem diferente da evidência histórica' >&2; exit 78
fi
# A imagem efetivamente baixada pode consumir mais disco que a estimativa.
# Reserva pos-pull obrigatoria: STOP antes de criar qualquer container.
pg_resource_guard after-pull

umask 077
: "${RUNNER_TEMP:?}" "${GITHUB_RUN_ID:?}"
work="$RUNNER_TEMP/neroxa-pg-only-02a5-$GITHUB_RUN_ID"
name="neroxa_pg02a5_$GITHUB_RUN_ID"
[[ ! -e "$work" ]] || { echo 'STOP: workspace já existente' >&2; exit 78; }
mkdir -m 700 "$work"
started=false
cleanup() {
  local status=$?
  trap - EXIT
  # Só o container do preflight nomeado; não usar system prune nem supabase stop global.
  if [[ "$started" == true ]]; then
    docker rm -f "$name" >/dev/null 2>&1 || true
  fi
  if docker container inspect "$name" >/dev/null 2>&1; then
    echo 'CLEANUP=FAIL: container ainda existe' >&2
    status=78
  fi
  if [[ "$work" == "$RUNNER_TEMP/neroxa-pg-only-02a5-$GITHUB_RUN_ID" && -d "$work" ]]; then
    rm -rf -- "$work"
  fi
  echo "CLEANUP_FINAL_CONTAINER_ABSENT=$([[ "$status" -ne 78 ]] && echo checked || echo verify)"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Credenciais SOMENTE sintéticas e efêmeras; nunca imprimir ou fazer upload.
cat > "$work/pg.env" <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 32)
POSTGRES_USER=supabase_admin
POSTGRES_DB=postgres
PGDATA=/var/lib/postgresql/data/pgdata
EOF
chmod 600 "$work/pg.env"

# Um único container, com rede desligada DESDE a criação e zero portas,
# sem host bind, sem docker.sock montado, sem outras imagens ou serviços.
# --pull never impede atualização de tag durante o start.
# Se a imagem precisar de configuração/serviços adicionais, STOP, não improvisar.
started=true
docker run --detach --name "$name" \
  --label neroxa.mission=02a5-pg-only \
  --network none --pull never --restart no \
  --security-opt no-new-privileges \
  --memory 2g --cpus 2 --pids-limit 256 \
  --tmpfs /var/lib/postgresql/data:rw,size=2g \
  --tmpfs /tmp:rw,size=128m \
  --env-file "$work/pg.env" \
  "$img" postgres -c config_file=/etc/postgresql/postgresql.conf >/dev/null
mode="$(docker inspect "$name" --format '{{.HostConfig.NetworkMode}}')"
ports="$(docker inspect "$name" --format '{{json .HostConfig.PortBindings}}')"
image_id="$(docker inspect "$name" --format '{{.Image}}')"
if [[ "$mode" != none || ( "$ports" != null && "$ports" != '{}' ) || "$image_id" != "$expected" ]]; then
  echo 'STOP: rede/portas/imagem divergentes' >&2; exit 78
fi
ready=false
for _ in $(seq 1 30); do
  if docker exec "$name" pg_isready -U supabase_admin -d postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'STOP: postgres standalone não inicializa com a receita imutável' >&2; exit 78; }

# ÚNICO SQL: transação de catálogo read-only, nenhuma aplicação instalada.
docker exec -i "$name" psql -X -q -A -t -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  > "$work/catalog.READONLY.jsonl" <<'SQL'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT jsonb_build_object(
  'kind','PG_ONLY_PRECONDITION',
  'server_version_num', current_setting('server_version_num'),
  'database', current_database(),
  'current_user', current_user,
  'roles', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', rolname, 'super', rolsuper, 'bypassrls', rolbypassrls) ORDER BY rolname),'[]'::jsonb)
            FROM pg_catalog.pg_roles WHERE rolname IN ('postgres','supabase_admin','anon','authenticated','service_role')),
  'role_memberships', (SELECT count(*) FROM pg_catalog.pg_auth_members),
  'default_privileges', (SELECT coalesce(jsonb_agg(jsonb_build_object('creator', pg_catalog.pg_get_userbyid(defaclrole), 'schema', coalesce(nspname,'GLOBAL'), 'objtype', defaclobjtype, 'acl', defaclacl::text)),'[]'::jsonb)
      FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace),
  'auth_users', pg_catalog.to_regclass('auth.users')::text,
  'master_orders', pg_catalog.to_regclass('public.neroxa_orders')::text,
  'master_instances', pg_catalog.to_regclass('public.neroxa_system_instances')::text,
  'tracking_session', pg_catalog.to_regclass('private.neroxa_tracking_sessions')::text
)::text;
ROLLBACK;
SQL

# Não promover resultado de catálogo a F01/F02 PASS.
python3 - "$work/catalog.READONLY.jsonl" <<'PY'
import json,sys
rows=[x.strip() for x in open(sys.argv[1]) if x.strip().startswith('{')]
assert len(rows)==1, 'STOP: esperado um resultado JSON de catálogo'
x=json.loads(rows[0]);assert x['kind']=='PG_ONLY_PRECONDITION'
assert x['server_version_num'].startswith('17'), 'STOP: PostgreSQL diferente de 17'
print('PG_ENGINE_SMOKE=PASS; F01=NOT_RUN; F02=NOT_RUN; SEC18=BLOCKED')
print('INITIAL_STATE_CONTRACT=' + json.dumps({k:x[k] for k in ('server_version_num','database','current_user','roles','role_memberships','default_privileges','auth_users','master_orders','master_instances','tracking_session')},ensure_ascii=False))
PY

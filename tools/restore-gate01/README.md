# NEROXA — RESTORE-GATE-01: recuperação comercial isolada

> **ATUALIZAÇÃO OPERACIONAL — 25/11/2026**
>
> Este README documenta a preparação histórica do RG01. A afirmação antiga
> abaixo de que o procedimento “ainda não foi executado” **não representa o
> estado atual do RG02**. As execuções protegidas já restauraram o esquema
> com owner/ACL em PG17 descartável e sem rede; a última execução
> [#45620361672](https://github.com/luit77yak-dev/neroxa-master/actions/runs/45620361672)
> mediu **13.824** provas de privilégios no **destino local**, das quais
> **4.936** foram concedidas, e validou a matriz de evidências.
>
> **O fechamento comercial permanece bloqueado:** `GLOBAL_ROLES=NOT_VERIFIED`,
> `OWNER_ACL=NOT_VERIFIED`, `COMMERCIAL_GO=NO_GO`. Não há, no material
> auditado neste repositório, testemunho nativo dos direitos efetivos da
> origem vinculado à mesma preimagem. Não repetir o RG02 apenas para reproduzir
> este HOLD. Ver [RG02-SOURCE-WITNESS-CONTRACT.md](RG02-SOURCE-WITNESS-CONTRACT.md)
> para o gate de proveniência e o procedimento futuro **ainda não autorizado**.
>
> O fluxo RG01 de recuperação de conteúdo usa `--no-owner --no-acl`,
> enquanto o job **RG02 schema/metadata** usa `--schema-only` **com owner/ACL**.
> Não confundir os escopos nem declarar equivalência por uma restauração
> que suprima as ACLs.

---

Status: **preparado, ainda não autorizado nem executado com o backup comercial**.

Este procedimento NÃO conecta ao Supabase comercial ou LAB, não executa migrações, não altera produção, não publica artefatos nem carrega o dump no GitHub. Usa Cloudflare KV com TTL de 24 horas para o arquivo **já criptografado** no Termux, e um runner GitHub Actions Linux descartável. A extensão `supabase_vault` 0.3.1 foi instalada com sucesso em uma prova sem dados comerciais separada.

## Premissas verificadas

- `database.dump` custom do PostgreSQL (773.520 bytes) foi validado pelo Termux: `SOURCE_CUSTOM_DUMP=PASS`.
- `commercial-preimage.gpg` (174.388 bytes) foi criado localmente pelo utilitário v2; a descriptografia e o hash do conteúdo foram conferidos: `DECRYPT_VERIFY=PASS`.
- **Chave de 64 caracteres hexadecimais permanece privada no Termux** em `~/.local/share/neroxa/restore-gate01/one-time-key.txt` (modo 0600). Não a enviar no chat, em issues, no Git, no Drive público ou em logs.
- A cópia criptografada está no mesmo diretório privado; `local.json` guarda `cipher_sha256` e prefixo. O script `upload` transfere somente bytes criptografados para Cloudflare KV.
- Existe um namespace temporário `neroxa-restore-gate01-temp-20261124`; o teste de leitura/escrita/exclusão fictícia passou. Não existe dump comercial nesse namespace até autorização explícita.

## Pré-condições antes de qualquer upload comercial

1. O responsável deve inspecionar o código deste PR, aprovar explicitamente a transferência, e garantir que GitHub Actions hospedado por terceiros é permitido para essa cópia de recuperação.
2. Só integrar o workflow após revisão na branch protegida `main`. `workflow_dispatch` exige que o workflow esteja na branch padrão. **Não executar com segredos na branch `proof/*` ou qualquer branch sem proteção.**
3. No GitHub, criar **Environment `neroxa-restore-gate01`**; limitar a deployment branch à `main`; exigir **required reviewers** com conta diferente da que inicia a execução e **Prevent self-review** ativo; o operador controla ambas as contas e reconhece que essa verificação NÃO constitui revisão humana independente. Desabilitar bypass administrativo. Confirmar a política antes de adicionar segredos.
4. Criar **somente Environment secrets** (`RG01_KV_READ_TOKEN`, `RG01_DECRYPT_KEY`) e **Environment variables** (`RG01_ACCOUNT_ID`, `RG01_NAMESPACE_ID`, `RG01_REVIEW_GATE=ARMED_AFTER_OPERATOR_APPROVAL`). Não criar cópias de segredos no nível do repositório ou da organização.
5. `RG01_KV_READ_TOKEN` deve ter só a permissão **Workers KV Storage Read** na conta Cloudflare pretendida, com expiração curta. Separar totalmente do token de upload **Workers KV Storage Edit** usado manualmente no Termux. Revogar ambos após uso. Não usar token global nem token de produção.
6. Preencher `RG01_DECRYPT_KEY` **diretamente no GitHub Environment secrets**, consultando o arquivo de chave privado no próprio dispositivo; nunca enviar a chave por chat, workflow input, comando do shell com `echo`, parâmetro de URL ou commit.
7. Só fazer upload após configurar e revisar o destino. O upload usa TTL de 24h e a cópia permanece cifrada até o runner autorizado. Informar a `manifest_key` devolvida pelo upload e o `cipher_sha256` do `local.json` como inputs não secretos.
8. Iniciar **uma única execução manual** de `workflow_dispatch` na `main`, com `confirmation=RESTORE_ISOLATED_ONLY`. A conta autorizada distinta da que iniciou deverá liberar o ambiente. Como ambas são controladas pelo mesmo operador, isso é apenas uma barreira operacional; não é revisão independente.

## Prova e limites

- Verifica SHA256 antes de descriptografar e confere que o arquivo é formato custom PostgreSQL (`PGDMP`).
- Roda PostgreSQL 17.12 e Vault 0.3.1 em Docker `--network none`, sem portas públicas, sem credenciais Supabase e com arquivos temporários; o comando de restauração usa `pg_restore --no-owner --no-acl --single-transaction --exit-on-error` e **não imprime SQL nem dados de linhas**.
- O conteúdo é descarregado em sistema de arquivos temporário do runner e copiado para o contêiner descartável; portanto **GitHub Actions processará dados comerciais em infraestrutura de terceiros**. Criptografia em trânsito/repouso não elimina esse risco, exige autorização explícita.
- Limpeza local (`trap`) remove o contêiner e o diretório temporário; GitHub pode reter telemetria operacional, imagens instantâneas do runner, ou logs. **Não declarar apagamento forense garantido.**
- A prova cobre **conteúdo de banco sem proprietários/ACLs**. O arquivo separado `roles-no-passwords.private.sql` ainda **não foi restaurado**, e políticas/grants e contexto completo do Supabase exigem uma fase adicional. Mesmo se passar, `COMMERCIAL_GO=NO-GO` até os demais gates.
- Nenhum dado deve ser recuperado pela URL pública, artifacts, cache, workflow summary detalhado ou incident report.

## Segurança operacional

Caso qualquer verificação falhe: não reexecutar indiscriminadamente; preservar backup original, não imprimir log `restore.stderr` no GitHub público, registrar apenas códigos agregados e interromper a sessão. Expirar/revogar tokens e eliminar somente a cópia temporária após conferência. Não alterar os bancos Supabase comercial e LAB.

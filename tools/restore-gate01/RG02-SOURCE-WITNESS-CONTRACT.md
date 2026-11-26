# NEROXA V1 — RG02: contrato de testemunho de privilégios da origem

**Estado em 25/11/2026:** `SOURCE_EFFECTIVE_PRIVILEGES=NOT_MEASURED`, `GLOBAL_ROLES=NOT_VERIFIED`, `OWNER_ACL=NOT_VERIFIED`, **`COMMERCIAL_GO=NO_GO`**.

Este documento estabelece um requisito para uma futura auditoria aprovada. **Não autoriza acesso, leitura, alteração, migração, GRANT, restauração de globals, captura de credenciais, nova cópia de dados nem GO.** Não o executar como script.

## Atualização de autorização — 25/11/2026

O responsável autorizou **preparar** uma nova captura comercial sincronizada, **exclusivamente de leitura** e **somente pelo canal privado protegido**. Esta autorização **não inclui** concessão de privilégios, criação de roles, migrações, alteração do banco comercial, publicação pública nem liberação GO. A captura efetiva exige aprovação humana do GitHub Environment, assinatura/segredos privados de origem e recuperação externa da chave cifrante previamente confirmada.

A implementação candidata está em:

- `.github/workflows/rg02-source-synchronized-preimage.yml`
- `rg02_source_same_snapshot_capture.py`
- `rg02_source_globals_same_snapshot.sql`
- `rg02_source_tuple_same_snapshot.sql`

**Novo snapshot ≠ snapshot antigo.** Um exportador em `REPEATABLE READ READ ONLY` mantém aberta a transação de `pg_export_snapshot()`, enquanto um `pg_dump -Fc --snapshot` de banco inteiro e **dois SELECTs independentes** (catálogos globais + matriz de direitos) importam exatamente esse snapshot via `SET TRANSACTION SNAPSHOT`. A consulta global consulta `pg_roles`, `pg_auth_members` e `pg_parameter_acl` no snapshot — **não** presume que `pg_dumpall --globals-only` compartilhe automaticamente o mesmo snapshot.

A role exigida `neroxa_rg02_snapshot_reader` deve **já existir** e ter privilégio de leitura suficiente para o dump completo. Não promover `neroxa_f02_preflight`, `postgres` ou `service_role` para contornar a restrição. O script rejeita atributos de escrita, superusuário e CREATE; `BYPASSRLS` de leitura é registrado explicitamente caso tenha sido pré-autorizado. Sem leitura integral do dump, a execução falha, **nunca** muda para `--enable-row-security` ou para `--no-acl`.

O runner transmite stdout de `pg_dump` e das duas consultas **diretamente para GPG AES256**, sem dump/SQL privados em disco. Decripta e reconfere cada digest _dentro do runner_, sem publicar os bytes em logs, e armazena exclusivamente `*.gpg` em artefato privado GitHub de retenção 7 dias. `manifest.json.gpg` liga hashes, novo `capture_id`, commit e run. Credenciais/chave **não** entram no artefato. O upload **não** comprova custódia independente: é obrigatório baixar e verificar a recuperação em canal privado antes de classificar a evidência como durável.

### Configuração protegida necessária antes de executar

Criar/verificar **GitHub Environment** `neroxa-rg02-source-capture` com revisão humana obrigatória, sem autoaprovação, branch `main` protegida como única permitida, sem bypass. Um Environment inexistente pode ser criado sem proteção pelo GitHub; por isso o workflow exige vars/segredos explicitamente provisionados **somente nesse Environment**.

Vars:

- `RG02_SOURCE_GATE=OPERATOR_APPROVED_PRIVATE_CAPTURE`
- `RG02_ESCROW_RECOVERY=EXTERNALLY_RECOVERABLE_KEY_CONFIRMED`
- `RG02_SOURCE_HOST=aws-0-us-east-1.pooler.supabase.com`: host Session Pooler aprovado no F02
- `RG02_SOURCE_PG_USER=neroxa_rg02_snapshot_reader.iefaoaqzltvpfabyeelj`: role de captura dedicada e prefixo do projeto no Session Pooler

Secrets **somente de Environment**, nunca repositório/chat:

- `RG02_SOURCE_PG_PASSWORD`
- `RG02_SOURCE_CA_PEM`: bytes exatos da CA previamente aprovada no F02 (`SHA-256=700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`); CA diferente bloqueia antes de acessar a origem
- `RG02_CAPTURE_PASSPHRASE`: aleatória, 32+ caracteres, com cópia recuperável fora do GitHub aprovada previamente.

A execução requer `workflow_dispatch` na `main` com `confirmation=RG02_NEW_PREIMAGE_READONLY`. Se algum controle, certificado, privilégio, snapshot, espaço, tamanho, timeout, criptografia, reread ou upload falhar, registrar `BLOCKED` e **não repetir automaticamente**. Primeiro ensaiar código em PG17 sintético `--network none`. A PR de preparação é revisão de código, não é execução comercial. `GLOBAL_ROLES=NOT_VERIFIED`, `OWNER_ACL=NOT_VERIFIED`, `COMMERCIAL_GO=NO_GO` até auditorias e gates posteriores.

## 1. Evidência já produzida

Execução protegida [RG02 #45620361672](https://github.com/luit77yak-dev/neroxa-master/actions/runs/45620361672), no commit `fd19f6b4fca363336519668f4cc9f11baa53182f`:

| Evidência                                                                             | Observado                                          | Limite                                                 |
| ------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| Descriptografia, hashes, PG17, Vault 0.3.1 e restauração do esquema **com owner/ACL** | PASS                                               | Não reproduz direitos globais                          |
| Medidor nativo isolado `rg02_local_effective_rights.sql`                              | 13.824 consultas; 4.936 TRUE; 16 roles             | Somente **destino isolado**, não origem                |
| Matriz `rg02_proof_matrix.py`                                                         | `HOLD_CROSSCHECKED_NOT_EFFECTIVE_EQUIVALENCE`      | Coerência de contagens, não equivalência               |
| Memberships da origem decodificadas                                                   | 22/22; 18 observadas diretamente                   | 4 vínculos ausentes por política de não replay         |
| INHERIT declarado                                                                     | 14/14 caminhos localmente observados               | Não prova SET, ownership, RLS nem privilégio efetivo   |
| Flags de roles elevadas deliberadamente não importadas                                | 9                                                  | Não importar para forçar PASS                          |
| GRANT global sobre parâmetro                                                          | 1, não importado                                   | 0 entradas locais `pg_parameter_acl` nesta restauração |
| Divergência LOGIN                                                                     | 1                                                  | Não reconciliada                                       |
| Diferenças textuais GRANT/REVOKE                                                      | 51, consistentes com GRANT posterior no ACL direto | Não provam equivalência de direitos efetivos           |
| Políticas, RLS, owners e default ACL textuais                                         | 0 statements ausentes nos tipos reportados         | Contagem textual não prova equivalência operacional    |

A execução encerrou com `RG02_METADATA_COMPARISON=HOLD_REDACTED`, **como previsto**. Não repetir esse job apenas para obter os mesmos números.

## 2. Ponto que falta: _testemunho nativo da origem_

O dump custom `pg_dump` representa uma visão consistente **de um banco**, mas não contém um inventário pré-calculado de todos os resultados de `has_*_privilege` / `pg_has_role` por role e objeto. O arquivo `pg_dumpall --globals-only` contém SQL de objetos globais, memberships e privilégios sobre parâmetros, mas também **não é um testemunho nativo dos direitos efetivos**. Além disso, duas capturas realizadas separadamente não devem ser tratadas como a mesma transação de leitura só porque os hashes coincidem.

**Não há, nos artefatos auditados disponíveis ao RG02 neste repositório, um recibo de medição de privilégios efetivos da origem atrelado ao snapshot do dump.** Não inferir retrospectivamente esse recibo de logs, contagens, dumps ou de uma consulta feita agora.

Referências: [pg_dump 17](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_dumpall 17](https://www.postgresql.org/docs/17/app-pg-dumpall.html), [snapshots exportados 17](https://www.postgresql.org/docs/17/functions-admin.html).

## 3. Precondições obrigatórias para uma eventual nova captura

1. **Autorização separada do responsável** para leitura restrita da origem comercial. O RG02 anterior não concede autorização para consultar o banco vivo ou criar um novo backup. Usar identidades de mínimo privilégio e canais privados; nunca colar tokens, senhas ou texto de catálogo no chat, no Git, em logs ou artefatos públicos.
2. Verificar a procedência do banco comercial e o PostgreSQL real; não confundir Supabase LAB, comercial, pooler ou uma restauração. Se o canal read-only não for confiável, registrar `BLOCKED`.
3. Uma nova captura exige **nova preimagem** — não reatribuir a captura de 25/11 à versão anterior. Designar um identificador novo, registrar cadeia de hashes do novo dump e dos novos recibos, sem registrar valores sigilosos.
4. Para objetos _do mesmo banco_, uma sessão exportadora inicia `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, obtém `pg_export_snapshot()` e **permanece aberta** enquanto `pg_dump --snapshot=<id>` e a consulta de testemunho importam a mesma visão MVCC. Confirmar suporte da sessão/backend e que todas as conexões permanecem no mesmo cluster, sem perder o snapshot no pooler. **Não** executar automaticamente este protocolo nem inserir identificadores de snapshot no chat.
5. **Global roles/pg_auth_members/pg_parameter_acl**: capturar o catálogo global e as opções reais na mesma coordenação de snapshot, com consulta separada e controlada, em vez de presumir que `pg_dumpall --globals-only` aceita ou compartilha automaticamente `--snapshot`. Verificar a integridade de cada representação e de seu contexto de transação antes de alegar mesma preimagem.
6. A coleta deve ser **somente SELECT**, com limite de tamanho, lista explícita de catálogos, tempo de execução e rolês auditadas. Não executar SQL da origem, `SET ROLE`, GRANT/REVOKE, mudanças de atributos, `SQL_RELEASE`, migrações nem leituras de dados de linhas.
7. Preservar os testemunhos completos **privadamente**, cifrados e com retenção definida. Nunca colocar listas de grantees/objetos/ACLs, hashes reversíveis sem chave ou SQL privado em stdout, arquivos do repositório, uploads públicos ou summaries do CI.

## 4. Contrato de comparação — sem PASS por contagem

Para uma comparação futura, o recibo de origem deve conter uma matriz **por identidade canônica de role, classe de objeto, identidade estável do objeto, privilégio e resultado efetivo**, associada criptograficamente à **mesma preimagem** usada para restaurar o destino. OIDs não são identificadores comparáveis entre clusters. Normalizar nomes qualificados e assinatura de funções com a mesma versão de algoritmo dos dois lados.

Contagens globais `13.824 / 4.936` **não bastam**: distribuições idênticas podem esconder direitos trocados entre objetos ou roles. O comparador deve checar **cada tupla** (incluindo faltas/extras e opções `MEMBER`, `USAGE`, `SET`), os grantors, owners, default ACLs, RLS/policies e flags, sem aceitar apenas os totais.

- Fonte e alvo com **snapshots diferentes** → `SOURCE_PREIMAGE_PARITY=NOT_VERIFIED`.
- Sem testemunho da origem, sem ligação à preimagem ou sem prova da cobertura de roles/objetos → `SOURCE_EFFECTIVE_PRIVILEGES=NOT_MEASURED`.
- Diferentes direitos por efeito de memberships/flags deliberadamente não reproduzidas → registrar **diferença**, nunca equivalência fictícia. Exigir decisão explícita do responsável sobre o contrato de acesso aplicável; **nunca** importar privilégios elevados automaticamente.
- Funções `has_*_privilege` **não** provam comportamento de predicados RLS por linha, `SECURITY DEFINER`, acessos por coluna ou outros caminhos não medidos. Cada classe exige prova específica, sob `HOLD` até então.
- A fonte atual consultada posteriormente pode servir a uma **nova linha de base**, nunca comprovar exatamente o estado antigo sem vínculo sincronizado.
- A aprovação final exige também os demais gates F02/I04, integração e homologação do GO; mesmo um RG02 futuro completo não autoriza GO sozinho.

### 4.1. Pré-validação de testemunhos futuros (sem captura, sempre HOLD)

O script `rg02_tuple_witness_preflight.py` recebe **dois JSON privados futuros**, um com `scope=SOURCE` e outro com `scope=ISOLATED_RESTORE`. Não coleta dados nem conecta a qualquer banco. O formato v1 exige `capture_id` opaco de 32 caracteres hexadecimais, `source_dump_sha256`, `source_globals_sha256`, `declared_probe_kinds` com as 19 categorias já testadas, e `rows` como tuplas:

```text
[role_canonica, "TABLE", "schema_canonico.objeto_canonico", "SELECT", true]
[role_canonica, "ROLE", "outra_role_canonica", "SET", false]
[role_canonica, "PARAMETER", "parametro_canonico", "SET", null]
```

**Exemplos sintéticos**, nunca incluir identidades ou direitos reais em documentação. O último campo é `true`, `false` ou `null` (não medido). Os nomes e assinaturas permanecem em arquivos privados; stdout/recibo contém somente contagens permitidas e `NO_GO`.

O validador compara **cada chave role+classe+objeto+privilégio**, distinguindo direitos trocados com o mesmo total agregado, tuplas extras, faltantes e não medidas. Recusa duplicatas, escopos trocados e campos não esperados. Porém, igualar campos `capture_id`/SHA256 **não comprova por si só** que vieram do mesmo snapshot: são declarações de um arquivo de entrada, não assinaturas de um mecanismo de captura confiável. A cobertura total das roles, catálogos e objetos tampouco é demonstrada pelo nome das 19 categorias. Por isso **todo resultado é HOLD**, inclusive quando todas as tuplas coincidem.

**Proibição:** não passar à ferramenta recibos da preimagem comercial histórica supondo que ela já foi atestada; não publicar testemunhos reais em PR/issue; não executar a ferramenta como bypass do workflow protegido; não interpretar `common_tuples_equal_value` como certificado de autorização. A próxima fase precisará de produtor de evidência assinado/autenticado, associação transacional comprovada, cobertura por objeto e canal privado sob aprovação explícita antes de qualquer nova captura.

## 5. Ordem recomendada, sem repetir trabalhos aprovados

1. **Agora**: manter o backup original e os relatórios atuais preservados em seus destinos privados. Nenhuma restauração RG02 idêntica, nenhuma tentativa de replay global, nenhuma alteração no comercial.
2. **Gate de decisão**: responsável aprova ou não uma captura **read-only** de nova preimagem; confirmar privilégios do canal e desenhar a prova no ambiente de homologação existente.
3. **Antes de tocar na origem**: testar plano de snapshot/receitas e o verificador de identidades canônicas com bases e roles **sintéticas**, e validar a retenção privada/cifragem.
4. **Somente sob aprovação específica e no canal privado**: capturar novo dump e testemunho sincronizados; conferir os hashes/atestações, executar recuperação isolada sem rede, cruzar direito por direito e registrar diferenças.
5. Sem captura aprovada ou evidência suficiente, encerrar como `GLOBAL_ROLES=NOT_VERIFIED`, `OWNER_ACL=NOT_VERIFIED`, `COMMERCIAL_GO=NO_GO`. **Não converter HOLD em PASS.**

**Regras que permanecem:** preservar LAB; produção sem alterações; `REMOTE_WRITES=NONE`; sem `SQL_RELEASE`; isolamento `--network none`; revisões protegidas para futuras operações sensíveis.

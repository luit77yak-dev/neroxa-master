# NEROXA V1 — preparação de conexão Hyperdrive comercial (não executada)

> **ATUALIZAÇÃO — 20/11/2026:** a limpeza dos dados comerciais de teste foi **executada e conferida** (24 tabelas, 118 linhas removidas). Assim, o problema da configuração cancelada foi resolvido por descarte autorizado dos dados de teste; não subsiste conflito contratual real ou segregação pendente dessa linha. Ver [evidência da limpeza](./NEROXA-V1-COMERCIAL-TEST-DATA-RESET-20261120.md). **Continuam pendentes** credenciais dedicadas, grants de runtime, Hyperdrive comercial, TLS/readiness, 33 SQLs e testes; não houve criação de Hyperdrive, merge ou publicação. O histórico abaixo é pré-reset.


Data: 2026-11-20 | Escopo: branch `integration/v1-cloudflare-master-20261120` | Estado: **PREPARED / NOT_CONFIGURED / NO-GO**.

Este documento é especificação de aprovação, **não** contém credenciais, comandos de provisionamento ou autorização para ativação. Nenhum Worker, Hyperdrive, DNS, banco ou manifesto de release foi alterado por este documento.

## Esclarecimento do proprietário sobre o legado (2026-11-20)

Todos os registros históricos discutidos (organizações, contratos, propostas, assinaturas e configurações) foram classificados pelo proprietário como **dados de teste, não operações comerciais reais**. Por isso, a organização `CANCELLED` com contrato `ACTIVE` deixa de exigir uma resolução contratual de cliente real. Permanece **pendente o saneamento técnico** com backup recuperável, proteção contra acesso público, análise de FKs e autorização separada antes de quaisquer alterações. A declaração não equivale à identificação independente de cada registro e não autoriza exclusão.

## Identidade e separação de ambientes

| Item | Referência | Estado observado |
| --- | --- | --- |
| Supabase comercial | `iefaoaqzltvpfabyeelj` / `neroxa-solutions-hub` / `us-east-1` / PostgreSQL 17 | `ACTIVE_HEALTHY` |
| Host comercial proposto | `db.iefaoaqzltvpfabyeelj.supabase.co:5432` / banco `postgres` | Identificado por metadados; TLS/conectividade **não testados** |
| Supabase LAB principal | `gomexvhvecvvfbdzhjct` / `neroxa-f01-f02-sec18-lab` | `ACTIVE_HEALTHY` |
| Hyperdrive existente | `neroxa-v1-i04-lab` / `e7570caf4da24a53838d3cb9a234d9ac` | **Origem LAB**, cache desativado; preservar |
| Hyperdrive comercial futuro | Nome candidato `neroxa-v1-master-commercial` | **INEXISTENTE / não criado** |
| Role SQL própria para runtime | Role dedicada, de privilégio mínimo, identidade ainda não aprovada | Nenhuma role com prefixo `neroxa%` encontrada; **não criar/usar `postgres` por inferência** |
| Manifesto SQL | `audits/02a5/hosted-release/MANIFEST.json` (33 unidades) | `execution_authorized=false`, `approval=null`, hashes imutáveis |

Não reaproveitar senha, sessão, ID, binding, endpoint, Worker ou política Access do LAB. Destino comercial precisa de vínculo explícito a sua própria release e domínio. As evidências R14 continuam pertencendo ao LAB.

## Especificação candidata para revisão, sem segredos

- Serviço: Cloudflare Hyperdrive, **configuração nova**, origem Supabase comercial `postgres` **direct connection** (não a conexão pooler transacional).
- `origin.scheme=postgres`, `origin.host=db.iefaoaqzltvpfabyeelj.supabase.co`, `origin.port=5432`, `origin.database=postgres`.
- `origin.user` e senha ficam **pendentes** de role de runtime própria, com grants restritos aprovados; **não fornecer senha ao chat, GitHub, CI, URL ou artefatos**. Inserir apenas em canal secreto autorizado com proteção de acesso.
- `caching.disabled=true` para evitar cache de dados de pedidos, tracking, autenticação e preços. Revisar limite de conexões/uso do plano Cloudflare antes da criação.
- TLS obrigatório; preferir `verify-full` com CA confiável compatível e identidade do host. Certificado/CA, suporte da rota e handshake ainda exigem prova real. Não reduzir para `none`, `prefer` ou bypass de verificação.
- Uso do Hyperdrive exclusivamente como **binding de runtime comercial em Worker comercial próprio**, após gates `HOSTED_SERVER`. Não substituir `HYPERDRIVE` do `neroxa-v1-i04-api-lab` nem publicar novo Worker por mera configuração.

A criação da configuração Hyperdrive exige `origin.user` e `origin.password` válidos e testa conexão no provisionamento; o conector não dispõe, por si só, dessas credenciais. **Não realizar tentativa com senha de laboratório nem gerar credencial remota ad hoc.**

## Separar runtime de instalação SQL

O executor de **33 SQLs** requer sessão hospedada nativa com verificação TLS/libpq, identidade do servidor, autoridade `SQL_RELEASE`, orçamento/janela e recuperação. **Não usar Hyperdrive como executor de migrações**: o seu pooling não é substituto de sessão persistente e há limitações em estado de sessão, operações `PREPARE`, `LISTEN/NOTIFY` e advisory locks de sessão.

- `HOSTED_PREFLIGHT`: read-only e fechado; validar role/host/ref/certificado/relógio e inconsistências sem gravar.
- `SQL_RELEASE`: autorização **separada**, instalação ordenada exatamente conforme manifesto aprovado e preservação de preimagens e resultados; `approval=null` atualmente.
- `HOSTED_SERVER`: autorização **separada**, confirmar Worker/account/version/release/domínios, assinatura e TTL, runtime/ACL/RLS/SEC-18/F01/F02. Checkout `/api/checkout` e tracking `/api/order-track` continuam 503 em ausência de admissão.

## Impedimentos encontrados na leitura do comercial

1. 33 tabelas `public` com RLS; 58 migrações históricas; nenhuma prova de aplicação das 33 unidades da nova release.
2. Superfície legada: `SECURITY DEFINER` com `EXECUTE` em funções de checkout, tracking e admin para `anon`/`authenticated`. Não declarar GO sem revisão/corte e negativos reais.
3. Uma organização `CANCELLED` mantém `active=true` e configuração de storefront sem instância; vinculada a assinatura `TRIAL`, contrato e proposta. FK da configuração usa `ON DELETE CASCADE`. **Não excluir, reatribuir ou ativar**; exige cópia recuperável, análise de dependências e rollback testado antes de higienização de dados de teste. Informação agregada, sem UUIDs/dados pessoais no GitHub.
4. Nenhuma role PostgreSQL `neroxa%` encontrada na leitura. Não há role dedicada aprovada para Hyperdrive comercial.
5. O único Hyperdrive existente aponta ao LAB. Ainda não há configuração comercial.

## Critérios de avanço e recuperação

- Documento de aprovação de destino, administrador responsável, janela, custo/limites, papel de runtime e credencial segura sob custódia independente.
- Preparar e testar backup/restauração de configurações, contrato e proposta, preservando integridade de organização cancelada; classificar colisões e estados de assinatura antes de qualquer DML.
- Aprovar grants/ACL/RLS de role mínima e obter CA/identidade de conexão. Criar apenas Hyperdrive novo após as pré-condições; verificar host e TLS por consulta sem dados sensíveis e registrar origem/ID (não senha).
- Ativar o binding comercial somente na release imutável e isolada, depois dos gates de segurança e do aceite; executar testes HTTP reais 401/403/429/503, A1/A2/C1, checkout/tracking, bloqueio legado, recuperação, e origem/hashes Cloudflare.
- Rollback independente: desabilitar/travar apenas roteamento/binding comercial; revogar credenciais de runtime comercial; revalidar que LAB e versão preservada não foram tocados. Resultado ambíguo => **HOLD**, nunca tentativa automática.

## Referências oficiais

- Cloudflare Hyperdrive × Supabase: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/
- Cloudflare TLS: https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/
- Cloudflare Hyperdrive pricing/usage: https://developers.cloudflare.com/hyperdrive/platform/pricing/
- Supabase Postgres connections: https://supabase.com/docs/guides/database/connecting-to-postgres

**Invariantes:** nenhuma credencial em logs/chat/repo; sem DDL/DML; sem criação de recurso remoto Cloudflare; sem alteração de `preflight-policy.json`, manifesto de 33 unidades, `main`, merge, deployment ou DNS. Comercial permanece **NO-GO**.
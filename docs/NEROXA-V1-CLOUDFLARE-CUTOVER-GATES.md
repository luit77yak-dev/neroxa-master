# NEROXA V1 — Cloudflare-first | Master / Food integration gate

Estado: **CLOSED — NOT ADMITTED — NO COMMERCIAL GO**. Revisão em 2026-11-20.
Este registro é de planejamento e rastreabilidade, não é autorização de release.

## Bases verificadas

- Master PR #53 `be9ab894740b8298e540fa01d6d4f2a951e86241` permanece na branch de integração; `main` não foi alterada nesta onda.
- `audits/02a5/hosted-release/MANIFEST.json`: 33 unidades ordenadas, hashes SHA-256 validados 33/33, `execution_authorized=false`, `approval=null`, estado `CANDIDATE; hosted execution CLOSED`.
- `tools/hosted-admission/preflight-policy.json`: `state=CLOSED`; host, role, CA, ref, founder e autoridade não admitidos.
- O destino original do manifesto é `iefaoaqzltvpfabyeelj`, **distinto** do LAB R14 `gomexvhvecvvfbdzhjct`. No levantamento Supabase de 2026-11-20, o primeiro estava `INACTIVE`; revalidar a disponibilidade antes de uma futura admissão.
- Na candidata Food PR #45, `src/server/hosted-release-core.mjs` vincula `HOSTED_SERVER` a `VERCEL_DEPLOYMENT_ID`; isso **não é** uma admissão para Cloudflare Workers. Não trocar o identificador sem modelar nova prova de identidade.
- `audits/02a5/hosted-admission/README.md` registra TLS/libpq hospedados, cancelamento, quiescência e readiness positiva como NÃO executados. As provas privadas LAB não são equivalentes à instalação comercial dessas 33 unidades.

## Contrato de integração proposto (ainda não implementado)

1. **Definir o destino comercial**: projeto/ambiente Supabase realmente aprovado, domínio do endpoint, função de cada conexão, limites e custos; proibir reaproveitar o LAB R14 como destino comercial por inferência.
2. **Revisar identidade de deployment Cloudflare**: vincular grant assinado ao account/Worker/version ID, hash da release e domínios, com TTL, nonce, assinatura/autoridade independente e recuperação. Não confiar em headers controláveis pelo cliente, flags ou `CF_VERSION_METADATA` isoladamente.
3. **Preservar fail closed**: checkout público `/api/checkout` e tracking `/api/order-track` ficam 503 até a admissão validada; flags isoladas, token de usuário ou frontend não podem habilitar negócios.
4. **Separar aprovações**: `HOSTED_PREFLIGHT` read-only, `SQL_RELEASE` sessão de instalação e `HOSTED_SERVER` runtime têm escopos e aprovações distintos. Nenhuma validação de CI substitui a autorização de execução.
5. **Validar readiness real**: instalação exata dos 33 SQLs somente em ambiente autorizado, permissões/RLS/ACL, revogação de RPCs legadas, controle de consumidores Storage/Realtime, TLS e identidade do servidor. Verificar efeitos reais, preservando estado intermediário e HOLD para ambiguidades.
6. **Testar em release imutável**: build e import SSR Cloudflare, 401/403/429/503, ausência de vazamento de PII, A1/A2/C1, checkout e tracking por capability, recuperação/rollback e integridade remota de assets; manter o R14 como evidência anterior, não como aprovação automática.
7. **Publicação separada**: somente após parecer SEC-18/F01/F02 e aceite humano, vincular DNS e rotas comerciais; manter plano de rollback e logs sanitizados.

## Regras desta branch

- Nunca editar o manifesto de 33 hashes nem preencher `preflight-policy.json` nesta etapa.
- Não conectar credenciais, criar grants, executar SQL, realizar merges ou produzir deployment comercial.
- CI verde significa somente **candidato estático/build aprovado** até haver testes hospedados e evidência de identidade da release final.

**Next gate:** revisão de contrato Cloudflare `HOSTED_SERVER` com negativos de identidade de Worker/version e compatibilidade de forma dos RPCs Food–Master. Não ativar produção neste documento.

# NEROXA — F02: ensaio exato de recuperação e amendment (15/10/2026)

**Decisão:** AVANÇAR COM RESTRIÇÕES NA CORREÇÃO. **F01/F02 ABERTOS; Marco 01 0/7; comercial NÃO LIBERADO.** Sem corte/merge/deploy/SQL remoto.

## Execução independente e rastreabilidade

- [GitHub Actions run 38785111675](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38785111675) — **SUCCESS** no runner, scope **PASS PARTIAL PRE-GATE**, cleanup **PASS**.
- **Master efetivamente testado:** `c149f802adf1922be588319cc98a798c7b387ea8`. **Delivery fixado e usado:** `011275488660bfa1a9271b3e4c92e457f7638e34`.
- As seis unidades SQL previstas no `audits/02a5/F02-AMENDMENT-EXECUTION-MANIFEST.json` passaram na verificação SHA-256 e foram aplicadas **sem transformação de bytes em memória**, exclusivamente no clone PostgreSQL/Supabase.
- A correção de `audits/02a5/recovery-without-phone.candidate.sql` foi remover um único delimitador `$function$` incorreto dentro do bloco `$snapshot$`. SQL original anterior SHA-256 `46332b0bc0746a928143ca35c92ff957599f6f8693efec09beb3fd96efab067a`. **Novo SQL fonte SHA-256 `b1ef02f71a9d087ef5bec59e93406f142e2bad5bec0e870e2b652904c3c307c4`**, agora pinado no manifesto e comprovado no runner. Não é mais perfil derivado.
- **Fonte do hash:** manifesto e log de execução do run. A derivação histórica da execução 38783768679 permanece registrada e distinguida.

## Resultados individuais de segurança (contagem de grupos SEC, não critérios comerciais)

| Grupo | Status | Evidência observada |
|---|---|---|
| SEC-01 — leitura legada anônima | FAIL / P0 | Via UUID + telefone no baseline do clone; vulnerabilidade aberta |
| SEC-02 — append legado anônimo | FAIL / P0 | Alteração indevida com UUID + telefone no baseline do clone; vulnerabilidade aberta |
| SEC-03..SEC-17 | 15 grupos PASS restritos | Autorização/ACL negativa, append HTTP legítimo, preços servidos pelo servidor, idempotência, concorrência, isolamento A/B/C, tokens expirados/revogados, seleção de complementos, cota e digests |
| SEC-17 — 5ª requisição válida agrupada | PASS HTTP 200 | Preço, pagamento NOT_SETTLED e incrementos coerentes de item/operação/histórico |
| SEC-17 — 6ª requisição válida agrupada | PASS HTTP 429 | Sem mutação de negócio/sessão; request_key distinta |
| REC-01 | PASS HTTP 200 | Recuperação service-only legítima, sem RPC legada de telefone |
| REC-02 | PASS HTTP 401 (anon), 403 (admin A) | Recuperação direta não autorizada negada |
| REC-03 | PASS HTTP 403 | Recuperação com instância B falsificada negada |
| REC-04 | PASS HTTP 403 | Payload adulterado negado |
| REC-05 | PASS HTTP 410 | Prazo de recuperação expirado negado |
| SEC-18 | BLOCKED | Gate de revogação não autorizado |
| Pós-gate | NOT RUN | Nenhuma revogação aplicada |

Resumo oficial do runner: **15 PASS / 2 FAIL / 1 BLOCKED por grupos SEC**, **44 observações** discriminadas em log. RUNNER SUCCESS não equivale a todos os controles comerciais aprovados.

## Limites que permanecem

- Esse perfil valida RPC + adaptador HTTP usando PostgreSQL/Supabase/Auth e dados **fictícios** em rede descartável. **Não é checkout TanStack hidratado em Chromium**, nem validação integrada abrangente de Storage/Realtime/logout, financeiro de ponta a ponta, recuperação após restore T1 ou F01 integral.
- Consumidores externos e backend dos previews continuam **UNKNOWN**. Os aliases internos `food.neroxa.ia.br` e `mvp.neroxa.ia.br` compartilham deployment legado, mas não foram alterados.
- Não foi criado `CONSUMER-DISABLEMENT.json` nem forçada GUC artificial. **Gate F02 BLOCKED e pós-gate NOT RUN**. O baseline antigo mantém vulnerabilidades F02 leitura e escrita, sem evidência de uso em dados de cliente.
- Não houve merge, deploy, alteração de DNS/aliases, banco remoto, permissões reais, dados de cliente, serviço pago ou ativação de StaffPanel.

**Próxima missão:** entregar ao Codex/Coordenação os SHAs e este resultado, priorizar a matriz integrada browser checkout/Storage/Realtime/Auth/RLS/finanças com rollback e o inventário de consumidores. Manter as PRs draft e preparar revogação coordenada em clone só quando houver comprovantes legítimos de migração/desativação.

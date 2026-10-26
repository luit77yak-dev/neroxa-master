# F02-ACL-01 — adendo separado de drift

Estado: preparação estática; nenhum resultado de SQL ou Actions nesta missão.
Não altera nem substitui `audits/migration-bridge-v1-20261013/sql/A-preflight.candidate.sql`.

| Evidência | Candidato histórico A | Preimagem requerida neste ensaio |
|---|---|---|
| MD5 prosrc | ff3f732a3b15fcb1d2d2fdf9df4ddfe2 | bf8a60da54fda7d28e1003d892d7e116 |
| MD5 definição | d840292550213abb5401d57ccd3c33bf | b8fcc43700775f8600d52cbced33f189 |
| SHA256 definição | Não usado pelo gate histórico | 97be7523846e2095f5588936b13539ea8596baeef238c3a3c20cc4be25f111d5 |
| PUBLIC EXECUTE | Presente | Presente antes; ausente depois |

Há duas diferenças independentes: drift anterior do corpo em relação ao candidato A,
e delta intencional da ACL. O ensaio não corrige a primeira e não deve aceitar ambos
como uma exceção genérica. Reconciliação mínima proposta: registrar este adendo e,
numa decisão posterior, emitir novo gate versionado com a preimagem aprovada e a ACL
pós-REVOKE, preservando A congelado. Não executar A como gate desta versão.

Delta admitido: remover somente `=X/postgres` da função exata. Permanecem
`postgres=X/postgres`, `anon=X/postgres`, `authenticated=X/postgres`,
`service_role=X/postgres`; corpo, proprietário e `search_path=public` idênticos.
Isso bloqueia uma futura role sem memberships, mas preserva o acesso explícito dos
consumidores anon/authenticated/service_role e os wrappers SECURITY DEFINER.

Um PASS focal não libera provisionamento: ainda serão necessários decisão sobre o
gate, prova de execução do ensaio e de cleanup, confirmação contemporânea das ACLs
hospedadas e autorização específica para qualquer alteração hospedada.

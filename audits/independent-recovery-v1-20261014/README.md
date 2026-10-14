# Recuperação Independente V1 — somente descartável

- ARQUITETURA-RESTORE-INDEPENDENTE.md: fronteiras, clusters, roles e Auth.
- MANIFEST-BACKUP-RESTORE.json: pins, hashes, fases e evidências.
- RELATORIO-BACKUP-INDEPENDENTE.md: dados/estruturas e medições reais.
- MATRIZ-RECUPERACAO.md: escopos comprovados e pendentes.
- RELATORIO-DESASTRE-T0-T1.md: checkpoint, rollback bloqueado e limites de RPO.
- RELATORIO-AUTH-ISOLAMENTO.md: assinaturas independentes, identidades e grants.
- RUNBOOK-RECUPERACAO.md: execução local em runner, critérios de parada e cleanup.
- DECISAO-RESTORE-INDEPENDENTE.md: dez gates separados.

Não instalar remotamente. Dumps e segredos privados são removidos ao final; evidências são sanitizadas. Não confundir esta projeção operacional com todo o Master comercial.

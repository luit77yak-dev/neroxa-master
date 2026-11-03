# NEROXA — F01/F02 | admissão nominal de homologação (sem ativação)

**Decisão em 03/11/2026:** PREPARAÇÃO ESTÁTICA APENAS. O arquivo
`target-admission.CLOSED.json` é um registro fechado e um contrato de verificação,
**não** uma autorização, credencial, token, recibo operacional ou executor SQL.

## 1. Destino observado (sem SQL remoto)

- **Alvo:** `neroxa-homologacao`, `nvbmzdgfretwnkdfqcap`, sa-east-1, PostgreSQL 17.11.0.003, API de projeto `ACTIVE_HEALTHY`.
- **API de catálogo:** 0 relações de negócio em `public/private/neroxa_private`; 0 migrações reportadas; Auth/Storage nativos presentes. Extensões instaladas `pgcrypto 1.3` e `uuid-ossp 1.1` em `extensions`.
- Estas leituras não constituem autenticação TLS do SQL remoto, verificação de owners/policies, nem afirmam ausência de outras estruturas fora das consultas.

## 2. Fonte congelada e limitação de compatibilidade

- A base histórica da PR #51 (commit `b8a2087ad96dde4f90c04a7c10c31281d663e9f8`) tem 34 relações, 50 funções, 99 políticas (captura de 09/10; **não** é identidade do schema atual).
- Hash catálogo SHA256: `e7ed111d73ec8d63b514db8c39059d6b87ae97be74d54e0d682d38bc0e4cf858`.
- Release de 33 SQLs validada localmente em [40220240520](https://github.com/luit77yak-dev/neroxa-master/actions/runs/40220240520) mas **vinculada a `iefaoaqzltvpfabyeelj`**: não reutilizar guard, host, chaves, recibo, CA, sessões nem assinatura com `nvbmzdgfretwnkdfqcap`.
- O projeto novo não tem o catálogo base que a release espera. Uma avaliação de instalação deve considerar schema original, Auth e objetos gerenciados, extensões, ACL/owners, fixtures fictícias, recuperação por COMMIT, e prova de quiescência. **Não trocar ID com search/replace.**

## 3. F01 — isolado

Cenários mínimos pós-preparação: positivo A1 autorizado, negativa de SELECT/UPDATE para A2 e C, conta sem grant, política real Auth/AAL2, private DELETE não publicado, polling preservado, revogação/logout. Referência histórica [40212763636](https://github.com/luit77yak-dev/neroxa-master/actions/runs/40212763636): somente prova em clone descartável, não aceitação hospedada. Estado atual **BLOCKED_HOSTED**.

## 4. F02 — isolado

Cenários mínimos: negativas UUID+telefone (leitura e append); tracking e amendment por capability válidas; tokens inválidos/expirados/cruzados; checkout legítimo com preço/idempotência; consumidores legados migrados/desativados com recibos. Referência histórica [40214203640](https://github.com/luit77yak-dev/neroxa-master/actions/runs/40214203640). Corte remoto é **NÃO AUTORIZADO** e depende de verificação independente de consumidores. Estado **BLOCKED_HOSTED**.

## 5. Condições para eventual próximo passo

1. Preparar um ensaio de instalação **em clone efêmero separado**, sem dados reais, usando a fonte histórica congelada, runtime compatível e gates reais. O CI atual não executa SQL nem inicia serviços.
2. Preparar adaptação específica de admissão `HOSTED_PREFLIGHT`/SQL_RELEASE em ambiente próprio e separado; política **CLOSED**, nenhuma chave, environment, host TLS autenticado ou identidade migradora admitida. A proposta PR52/PR53 é referência, não autorização.
3. Garantir rollback/roll-forward diante de COMMIT intermediário e prova de estado do banco, sem ampliar ACL/permits; não reexecutar ações incertas automaticamente.
4. Somente após o founder autorizar **escopo, destino, risco, janela e execução SQL hospedada** considerar DDL no `neroxa-homologacao`. Não aplicar scripts no hub, não reativar serviços, não usar produção e não abrir comercial.

**Sem mudança do Master em `main` nesta branch.**

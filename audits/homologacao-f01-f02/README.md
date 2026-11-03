# NEROXA — F01/F02 | baseline estático isolado (03/11/2026)

**Decisão:** somente preparação/verificação de fonte. Nenhuma instalação, conexão SQL,
migration, ativação de serviço, deploy, dado real ou despesa autorizada aqui.

## Fonte congelada e alvo

- Repo `luit77yak-dev/neroxa-master`; ancestral congelado PR #51 `b8a2087ad96dde4f90c04a7c10c31281d663e9f8`.
- Catálogo histórico `audits/ab-auth/master-catalog-20261009.json`, SHA256 `e7ed111d73ec8d63b514db8c39059d6b87ae97be74d54e0d682d38bc0e4cf858`.
- Gerador original `tools/ab-auth/build_schema.py`: reconstrução de **34 relações, 50 funções e 99 políticas**, sem copiar linhas de negócio ou usuários Auth; não representa instalação atual.
- 33 unidades SQL da PR #51: manifestos e fontes com hashes, guard de admissão, originalmente endereçadas ao projeto **`iefaoaqzltvpfabyeelj`**. Não trocar os IDs e executar.
- Projeto destinado aos próximos testes: `neroxa-homologacao`, **`nvbmzdgfretwnkdfqcap`**, estrutura de aplicativo vazia na última inspeção, Auth/Storage nativos presentes.

## Verificação realizada por esta branch

`python3 tools/homologacao/verify_baseline_static.py` verifica todos os hashes de fonte/postimage, a base histórica, a ausência de colunas da fase posterior, a distinção obrigatória de projeto e **gera o SQL da base em arquivo temporário descartado**. Nenhuma linha SQL é executada. O SQL gerado nunca é enviado como artifact e não é promovido ao Supabase.

A execução do ensaio da release em clone descartável já foi aprovada em
[40220240520](https://github.com/luit77yak-dev/neroxa-master/actions/runs/40220240520),
com 33 unidades e recuperação de COMMIT parcial, mas isto não prova compatibilidade com um projeto Supabase novo nem admissão hospedada.

## Portões separados (após preparar um clone)

**F01:** verificar A1→A1 positivo, A1→A2/C negativo para SELECT/UPDATE, grants reais Auth, e ausência de DELETE privado em Postgres Changes com polling preservado. Reutilizar o ensaio [40212763636](https://github.com/luit77yak-dev/neroxa-master/actions/runs/40212763636); código-fonte `tools/f01/` já existe na fonte congelada. Não declarar `PASS` hospedado sem ensaio no alvo.

**F02:** sem reutilizar a sessão ou conclusões F01, verificar RPC UUID+telefone negativa depois do gate, capability válida para tracking e amendment, negações inválidas/cruzadas e recibo de consumidores migrados. Reutilizar [40214203640](https://github.com/luit77yak-dev/neroxa-master/actions/runs/40214203640) apenas como prova histórica em clone. Não executar revogação real.

## Bloqueio para uso de `neroxa-homologacao`

1. Definir um **contrato de admissão nominal separado** para `nvbmzdgfretwnkdfqcap`; nunca reutilizar assinatura/host/guard de `iefaoaqzltvpfabyeelj`.
2. Comprovar schema base e runtime do novo alvo sem criar grants abertos, dados fictícios apenas, sem uso de produção.
3. Obter autorização específica do fundador **antes de qualquer DDL/SQL hospedado**.
4. Não promover a correção com base apenas na geração estática. F01/F02/SEC-18 e comercial continuam bloqueados.

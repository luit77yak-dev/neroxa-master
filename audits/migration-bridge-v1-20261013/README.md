# Ponte V1 — candidata revisável, não instalar remotamente

- [Decisões e limites](DECISAO-PONTE-MIGRACAO.md)
- [Contrato canônico](CONTRATO-CANONICO.md)
- [Matriz campo/contrato](MATRIZ-PONTE-LEGADO.md)
- [Manifest de ordem e hashes](MANIFEST-PONTE.json)
- [Clean install](RELATORIO-CLEAN-INSTALL.md)
- [Upgrade legado](RELATORIO-UPGRADE-LEGADO.md)
- [Falhas/cutover/restore](RELATORIO-FALHAS-CUTOVER.md)
- [Segurança](MATRIZ-SEGURANCA-PONTE.md)
- [Evidências/hashes](EVIDENCIAS-PONTE.json)

Código em tools/migration-bridge-v1; cinco candidatos SQL em sql/, fora das migrations automáticas. F é verifier pós-cutover, não migração. Nenhuma autorização remota. Próxima missão: recuperação independente com anchors/GROUP/Auth e pacote final condicionado às decisões reais.

Capturas finais somente fictícias: evidence/final-clean/first-browser e evidence/final-upgrade/first-browser. Logs completos e artifacts originais no workflow38490640042. Relatórios JSON mantidos locais; PNGs não precisam ser publicados no Git. Auditorias anteriores não rastreadas foram preservadas fora deste commit.

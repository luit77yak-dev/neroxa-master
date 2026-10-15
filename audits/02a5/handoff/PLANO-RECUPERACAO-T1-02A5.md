# Recuperação T1 e rollback pós-commit — plano reproduzível, NOT RUN

Não há ensaio T1 nesta missão. Descartar clone ou provocar ROLLBACK antes do commit não prova esta recuperação. Não usar banco remoto.

## Pré-condições bloqueantes

Manifesto M integrado aplicado e validado; imagem por digest em três destinos PostgreSQL/Supabase independentes; orçamento de disco medido para 3 stacks+WAL+backups e pico de extração; egress restrito no namespace dos testes, preservando controle do runner. Auth/Storage/Realtime com versões compatíveis. Backup cifrado com chave fictícia efêmera, fora da VM TARGET. Binários pg_dump/pg_restore/psql compatíveis com PostgreSQL17 e versões registradas. Não inventar DDL financeiro para completar fixtures: mapear tabelas/colunas reais do catálogo antes de gerar dataset.

## Dataset e inventário

O1 com A/B; O2 com C. Identidades reais emitidas pelo Auth local, memberships/grants e sessões válidas. Produtos/categorias/addons/áreas/horários por instância; pedidos com itens/histórico e valores reconciliados; cliente→contrato→assinatura→instância, jobs de provisionamento com chaves idempotentes e cobranças/financeiro com estados explícitos. Registrar matriz FK, contagens e digest canônico por tabela, somas em centavos e relações. Contatos somente fictícios. Não incluir tokens/senhas nos logs; dumps Auth são sensíveis mesmo fictícios e não entram no pacote público.

## Execução proposta

1. SOURCE: preencher dataset e rodar controles positivos e negativos A/B/C; capturar catálogo/ACL/function bodies/policies/triggers e fingerprint da cadeia. Criar ledger de operações sintéticas com sequência monotônica e timestamp UTC fora do TARGET.
2. T0: parar entradas, confirmar transações encerradas, obter backup consistente de dados+schema com snapshot explícito e metadados. Capturar Storage original/derivado separado com hashes e vínculos. Não excluir SOURCE.
3. TARGET: restaurar backup T0 com política revisada que NÃO reimporte ACLs inseguras. Validar manifest e aplicar somente controles aprovados em ordem. Recriar identidades Auth conforme contrato de restore e forçar relogin se sessões não preserváveis. Antes do cutover, matriz e controles positivos devem passar.
4. Liberar somente produtor fictício no TARGET. Gravar T1 pós-cutover: novo pedido+itens+histórico, atualização autorizada de status, mutação financeira/assinatura/job definida por regra, revogação de um grant e de uma sessão. Confirmar COMMIT e persistir ledger+backup T1 incremental/logical event log durável fora do TARGET. Exigir mecanismo WAL/PITR ou replay idempotente validado; timestamp sozinho não recupera gravação.
5. Falha integral: parar/remover APENAS containers/volumes TARGET com nomes e labels conferidos. Não remover SOURCE nem backup. Marcar t_falha monotônico.
6. THIRD: independente de SOURCE/TARGET, restaurar T0 e aplicar o mecanismo T1 escolhido até último commit confirmado, preservando chaves e sem duplicação. Nunca recuperar com antigo helper, grants telefone ou StaffPanel.
7. Medir RTO=t_validação_e_reabertura−t_falha; RPO=último commit confirmado−último commit recuperado (também contagem/valor perdido). Não prometer RPO0 sem prova de durabilidade do ledger/WAL.
8. Comparar linhas/PK/FK, valores por pedido, soma linhas+taxas, financeiro, status/histórico e contratos/assinaturas/jobs. Rodar matriz A/B/C e restabelecer conexão Realtime com sessões revogadas negadas. Conferir capabilities expiradas/revogadas, originais privados e derivados revogados.
9. Falhas esperadas: backup truncado/checksum inválido, migration/hash divergente, evento T1 duplicado ou ausente, FK quebrada, ACL extra, sessão revogada recuperada como ativa. Cada uma deve bloquear reabertura; preservar evidências redigidas.
10. Descartar todos ambientes/credenciais sintéticas e registrar inventário vazio. Manter somente logs não sensíveis e hashes.

Scripts finais de backup/restore e fixtures financeiras dependem do inventário real das tabelas e mecanismo T1; ainda não estão validados. Coordenação deve escolher retenção/RPO/RTO e semântica financeira antes do ensaio. Não há estimativa de prazo/custo comprovada.

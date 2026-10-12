# Ensaio de migração histórica: duas lojas na mesma organização

**Estado:** preparado, NÃO executado. Exclusivamente clone isolado reconstruído do catálogo histórico. Não usar dados reais, nem credenciais de produção. PR #37 permanece draft.

## Fixture

`audits/sql/historical-two-store-rehearsal.fixture.sql` cria:
- Organização A: duas instâncias ACTIVE (A1 e A2), **uma** configuração legada compartilhada e duas zonas legadas sem instância.
- Organização B: uma instância ACTIVE (B1), uma configuração e uma zona legadas.
- UUIDs fictícios determinísticos; nenhuma associação com clientes reais.

**Antes de rodar:** confirmar que o clone está limpo, que a criação de instâncias ACTIVE é permitida pelos triggers do snapshot e que o fixture não conflita com slugs; caso falhe, corrigir a fixture no branch, nunca desabilitar segurança silenciosamente.

## Sequência obrigatória

1. Reconstruir clone descartável a partir do snapshot histórico; confirmar versão, 34 relações e constraints. Rodar fixture **antes** das migrações.
2. Capturar baseline: contagens, checksums lógicos das configurações e zonas, lista de instâncias, índices, constraints, triggers e grants. Guardar export lógico de dados fictícios e snapshot restaurável do clone.
3. Executar preflight de dependências e consumidores. **Nota:** `storefront-instance-preflight.sql` multiplica a contagem de settings ao fazer JOIN com instâncias; usar contagem de linhas independente.
4. Aplicar `storefront-instance-phase1.candidate.sql` em clone, separando DDL e backfill e auditando cada passo. Esperado: B1 recebe instance_id automaticamente; as linhas da Organização A ficam unresolved.
5. Tentar o gate da fase 2 com linhas A unresolved. **Deve falhar e reverter atomicamente**, sem perda de dados.
6. Decisão humana de mapeamento A: simular cenário (i) atribuir settings e ambas as zonas a A1, (ii) duplicar settings para A2 e copiar zonas apenas quando decisão explícita assim exigir. **Não assumir** que duplicar configuração implica duplicar zonas ou pedidos. Registrar matriz de origem → destino e IDs das cópias.
7. Reexecutar preflight. Conferir 0 NULL em instance_id, consistência organization_id ↔ instance_id, 1 settings por instância desejada, nenhuma zona atribuída duas vezes sem cópia intencional.
8. Ensaiar fase 2 no clone após verificar dependências da PK de settings, todos os escritores/leitores legados e as RPCs. Aplicar demais candidatos na ordem documentada no runner existente; não improvisar ordem de migrações.
9. Rodar testes reais com Auth/JWT/PostgREST: operador A1 não lê/altera A2, nem organização B; operador A2 não acessa A1; administrador de organização com escopo A1 respeita limites; Neroxa AAL2 conserva acesso autorizado; checkout por domínio/instância não resolve a primeira loja arbitrária; preços e zonas corretos.
10. Repetir ações após restart/cache de PostgREST; validar fluxos legados, criação/edição de settings, zonas, pedidos, item esquecido, idempotência, tracking, admin RPC.
11. Ensaio de rollback: restaurar snapshot isolado anterior; provar igualdade de contagens, dados e constraints com baseline. **Reverter fase 2 via DROP/ALTER inverso não é rollback seguro se surgiram duas settings por organização**. Necessário plano de restore ou rollback lógico com decisão explícita de conflitos e bloqueio de escritores.
12. Registrar evidência CI/logs, resultado por gate, falhas, diferenças de dados, tempo de interrupção e decisão GO/NO-GO. Nenhuma aprovação de produção automática.

## Assertivas mínimas para execução no clone

```sql
-- Depois da fase 1/backfill automático:
SELECT organization_id, count(*) AS unresolved_settings
FROM public.neroxa_storefront_settings WHERE instance_id IS NULL GROUP BY organization_id;
SELECT organization_id, count(*) AS unresolved_zones
FROM public.neroxa_storefront_delivery_zones WHERE instance_id IS NULL GROUP BY organization_id;

-- Antes da fase 2: ambos precisam retornar ZERO linhas.
SELECT s.organization_id, s.instance_id
FROM public.neroxa_storefront_settings s
LEFT JOIN public.neroxa_system_instances i ON i.id=s.instance_id
WHERE s.instance_id IS NULL OR i.id IS NULL OR s.organization_id<>i.organization_id;
SELECT z.organization_id, z.instance_id
FROM public.neroxa_storefront_delivery_zones z
LEFT JOIN public.neroxa_system_instances i ON i.id=z.instance_id
WHERE z.instance_id IS NULL OR i.id IS NULL OR z.organization_id<>i.organization_id;

-- Antes da fase 2: nenhuma duplicação de settings por instância.
SELECT instance_id,count(*) FROM public.neroxa_storefront_settings
WHERE instance_id IS NOT NULL GROUP BY instance_id HAVING count(*)>1;
```

## Gates bloqueantes

- Sem autorização para resolver automaticamente dados da Organização A com duas instâncias.
- Fase 2 deve recusar linhas unresolved e não pode destruir histórico.
- Não trocar PK com escritores legados ainda ativos.
- Rollback exige recuperação verificável, não apenas DDL inversa.
- Sem aprovação de produção até matriz A/B, testes de regressão, ACL/RLS, compatibilidade de consumidores e rollback passarem.

## Riscos conhecidos

- `storefront-instance-phase1.candidate.sql` inclui DDL e UPDATE de backfill, portanto exige execução separada/controlada para observar estados intermediários.
- O snapshot não inclui dados reais nem todos os consumidores externos. O ensaio demonstra comportamento do cenário fictício, não prova que dados históricos de clientes reais possam ser atribuídos automaticamente.
- O `storefront-instance-phase2-cutover.candidate.sql` exige revisão de dependências da PK antes de execução.

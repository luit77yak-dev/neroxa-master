# Auditoria candidata — isolamento por loja (2026-10-11)

**Estado:** NÃO APROVADO PARA IMPLANTAÇÃO. Documento de preparação, sem DDL executável.

## Evidência consultada (Supabase)

- Master `iefaoaqzltvpfabyeelj`: RLS habilitado nas 33 tabelas públicas listadas.
- Delivery Test `uvyinrojuhizjqbuzdcy`: 9 de 12 tabelas públicas listadas com RLS desabilitado. **Não considerar esse ambiente seguro para exposição externa.**
- Não foram encontrados triggers personalizados (não internos) nas tabelas de categorias, produtos, pedidos, itens, configurações e áreas de entrega consultadas.
- Em Master, a policy de INSERT/UPDATE de `neroxa_storefront_products` contém `c.instance_id = c.instance_id`, uma tautologia que não compara a categoria com a instância do produto.
- `neroxa_storefront_settings` usa PK `organization_id` e não tem `instance_id`; `neroxa_storefront_delivery_zones` também não tem `instance_id`.
- `neroxa_orders` tem `instance_id` e `organization_id`; políticas observadas autorizam por papel na organização.
- `neroxa_storefront_products.category_id` referencia apenas `neroxa_storefront_categories(id)`, sem vínculo composto com `instance_id`.
- As políticas PostgreSQL são permissivas por padrão (OR entre policies permissivas): corrigir uma policy sem revisar as demais NÃO fecha acesso.

## Correção candidata (não aplicar ainda)

1. Verificar registros existentes com categoria de instância divergente e reconciliar sem perda.
2. Adicionar garantia relacional para `(category_id, instance_id)`, considerando categoria nula, constraint única adequada e compatibilidade com `ON DELETE SET NULL`; conferir plano de migração antes de escrever DDL.
3. Substituir a tautologia nas políticas de INSERT/UPDATE por comparação explícita `c.instance_id = neroxa_storefront_products.instance_id`. Revisar **todas** as políticas permissivas de SELECT/INSERT/UPDATE/DELETE.
4. Projetar escopo por instância para configurações e áreas de entrega, incluindo migração de chave primária, dados históricos e dependências de frontend/backend. Não adicionar coluna sem plano de backfill e validação.
5. Modelar associação explícita usuário↔instância e privilégios da plataforma; membership da organização por si só não deve conferir acesso operacional a todas as lojas.
6. Revisar pedidos, itens, histórico, RPCs SECURITY DEFINER, views, GRANTs e funções de criação de pedidos para bypass de RLS.
7. Alinhar schema do Delivery Test ao candidato antes de habilitar RLS, pois difere do Master.

## Matriz obrigatória — duas lojas A/B na mesma organização

| Identidade                        | Operação                          | Loja A                   | Loja B                            |
| --------------------------------- | --------------------------------- | ------------------------ | --------------------------------- |
| Operador A                        | Ler/alterar produtos e categorias | permitido conforme papel | negado                            |
| Operador A                        | Ler/alterar pedidos e itens       | permitido conforme papel | negado                            |
| Operador A                        | Ler/alterar configurações e áreas | permitido conforme papel | negado                            |
| Operador B                        | Operações equivalentes            | negado                   | permitido conforme papel          |
| Admin de organização com escopo A | Operações de A/B                  | permitido                | negado, salvo concessão explícita |
| Admin Neroxa autorizado           | Operações administrativas         | permitido                | permitido                         |
| Usuário sem vínculo               | Qualquer operação privada         | negado                   | negado                            |
| anon                              | Operações administrativas         | negado                   | negado                            |

Exigir testes SELECT, INSERT, UPDATE (USING + WITH CHECK), DELETE, troca de instance_id/organization_id/category_id, chamadas RPC, acesso direto REST, JWT autenticado, constraints, rollback e CI. Confirmar política de leitura pública do cardápio separadamente.

## Gates

- [ ] Schema candidato e dados históricos reconciliados
- [ ] Policies e GRANTs revisados em conjunto
- [ ] Matriz executada com identidades reais ou simulação autenticada fiel
- [ ] Teste negativo entre A/B e acesso Neroxa positivo
- [ ] CI completo verde
- [ ] Plano de rollback e autorização explícita para implantar

**Nenhuma migração de produção está autorizada por este documento.**

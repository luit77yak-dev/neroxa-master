# Configurações, zonas e RPCs — plano de migração bloqueado para produção

## Evidências do Master (2026-10-11)

- `neroxa_storefront_settings` possui PK `organization_id`, sem `instance_id`.
- `neroxa_storefront_delivery_zones` possui `organization_id`, sem `instance_id`.
- `create_public_order` resolve a primeira instância ativa da organização. Isto é ambíguo com duas lojas.
- `get_public_storefront_catalog` resolve a instância por domínio, mas usa dados de settings/zones no nível da organização.
- `calculate_public_order_line_price` consulta settings pela organização.
- `get_admin_orders` e `update_admin_order_status` são SECURITY DEFINER e autorizam por membership da plataforma; precisam de escopo explícito para operador por instância.
- `append_public_order_items_with_payment` e `get_public_order_status` são SECURITY DEFINER; revisão de autenticação do pedido, taxa de tentativa, permissões EXECUTE e invariantes de itens é necessária.

## Migração proposta — duas fases, sem DDL executado

1. Introduzir `instance_id` nullable em settings e zones, FK para instâncias; criar índices adequados e restrição de unicidade `settings(instance_id)` para valores não nulos.
2. Determinar instância de cada linha histórica: organizações com uma única instância são candidatas ao backfill; organizações com múltiplas instâncias exigem decisão explícita de atribuição ou duplicação controlada. Não inferir por ordem de criação.
3. Atualizar todos os leitores/escritores e RPCs para `instance_id`. Em `create_public_order`, resolver instância por domínio confiável ou ID validado contra organização/domínio; não escolher primeira ativa.
4. Substituir PK settings por chave de instância após migração dos consumidores, manter organização apenas como FK/atributo validado, adicionar invariantes de consistência.
5. Substituir policies permissivas de settings/zones por políticas SELECT/INSERT/UPDATE/DELETE que chamem `neroxa_private.has_instance_role(instance_id,...)`, preservando admin Neroxa com MFA e papel explícito. Atualizações exigem USING e WITH CHECK.
6. Validar SECURITY DEFINER: search_path fixo, ownership, EXECUTE grants, autenticação do pedido e checagem de instance_id em cada consulta e mutação.
7. Revisar funções e tipos gerados do frontend antes de habilitar NOT NULL e remover compatibilidade legada.

## Gates

- Nenhuma linha sem instance_id após backfill.
- Nenhuma duplicação indevida de settings por instância.
- Nenhuma zona de A aparece no catálogo de B.
- create_public_order com loja A jamais cria pedido em B.
- Operador A não acessa pedidos B por RPC, mesmo conhecendo o UUID.
- Admin Neroxa com MFA preserva fluxos autorizados.
- Testes reais com JWT, não somente simulação de role em sessão postgres.

# Matriz integrada C1: isolamento entre organizações

**Status:** especificação candidata; NÃO executada. PR #37 draft. Somente Supabase local descartável.

## Fixture adicional
Após as migrações candidatas no runner A/B existente, inserir uma segunda organização fictícia e uma instância C1 vinculada a ela, com produto, categoria, configuração, zona e pedido próprios. Reutilizar a criação de usuários Auth reais do runner, mas nunca usar service_role para as requisições de teste. Criar operador C1 como membro apenas da organização C e da instância C1.

## Testes HTTP obrigatórios
- JWT do operador A1: ler A1; negar SELECT, PATCH, DELETE, INSERT e RPC de administração em A2 e C1.
- JWT do operador A2: ler A2; negar operações em A1 e C1.
- JWT do operador C1: ler C1; negar operações em A1 e A2.
- Administrador de organização A com escopo A1: permitir ações administrativas autorizadas em A1; negar A2 e C1.
- Usuário sem vínculo e anon: negar tabelas privadas das três lojas.
- Para cada tentativa negada, confirmar no banco que valores, contagens, histórico de pedidos e membros não mudaram.
- Checkout público: resolver domínio de C1 sem vazamento de catálogo A1/A2; rejeitar produto e zona de outra instância; conferir preço calculado no servidor.
- Pedidos: criar, atualizar status via RPC autorizada, rastrear por contato, repetir idempotency key e adicionar item esquecido somente à loja correta.
- Administrador da plataforma: testar JWT AAL1 bloqueado e JWT AAL2 autorizado nos limites previstos.

## Consumidores e rollback
- Inventariar leitores/escritores antigos que consultam settings por organization_id; confirmar migração para instance_id antes do cutover.
- Validar dependências da PK antiga, triggers, views, grants, políticas e RPCs.
- Fazer snapshot lógico do clone antes do cutover; após o ensaio, restaurar em outro clone descartável e comparar contagens, checksums lógicos e constraints.
- Falha em qualquer assertiva implica NO-GO. Não alterar produção, não mesclar PR #37.

## Evidência exigida
Registrar run ID, SHA, versões, identidades/escopos fictícios, status HTTP, assertivas, falhas, hash do snapshot e resultado do restore. Um workflow verde isolado não certifica produção.

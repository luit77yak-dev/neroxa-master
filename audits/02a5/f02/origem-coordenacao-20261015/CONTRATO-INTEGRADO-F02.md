# Contrato técnico candidato Master × Delivery — F02

**Natureza:** contrato de integração para desenvolvimento e ensaio, não DDL aprovado nem runtime funcional certificado. Perfis SQL divergentes **não** devem ser concatenados como migrations no mesmo schema.

## Invariantes inegociáveis

1. **Instância:** toda leitura/alteração de pedido, status, item e regra de disponibilidade vinculada a `instance_id` e autorização correspondente. A e B são lojas distintas da mesma organização O1; C pertence à O2. A autorização de A nunca autoriza implicitamente B.
2. **Comprador:** checkout legítimo cria pedido A, emite capability criptograficamente aleatória de 32 bytes, guarda somente hash no servidor, associa instância e pedido e consulta `/api/order-track` com mínimo necessário. Nenhum fallback por UUID+telefone.
3. **Revogação futura:** todas as assinaturas efetivas de `get_public_order_status`, `append_public_order_items` e `append_public_order_items_with_payment` devem negar `EXECUTE` a PUBLIC, anon e authenticated, inclusive herdados. Não basta revogar uma assinatura em só um dos perfis.
4. **Wrappers:** `neroxa_recover_group_order` é service-only no Master, mas chama `get_public_order_status` em corpo SQL. O corte deve preservar fluxo legítimo sem permitir invocação pública indireta nem vazamento.
5. **Funções novas:** owner, `SECURITY DEFINER`, `search_path`, definer chains, `pg_default_acl` e configuração de RLS são verificados em **clone**. Defaults permissivos exigem migration candidata controlada; não elevar privilégios só para passar.
6. **Financeiro:** append e checkout respeitam idempotência, preço autoritativo, transições auditáveis, quotas e invariantes de total. `text` no Master não é o enum `public.payment_method` do Delivery — requer adaptador/migração explícita e teste.
7. **Auth/Storage/Realtime:** conta real de teste, JWT, roles, token de tracking, logout e channel filters devem negar cross-instance; nenhuma chave de serviço entregue ao navegador.
8. **Reversão:** antes do COMMIT rollback transacional em clone. Depois, suspender caminho inseguro e fazer roll-forward seguro; não restaurar EXECUTE por telefone e não reativar StaffPanel.

## Proveniência

- Master pg_catalog: run 38672488319, executor `5b75620e6853b99c301cf10e177a7b8d3f78701f`.
- Delivery clone derivado: run 38678827509, executor `fb0a3215ac3f40606250dac33ed8ca7c06b16150`, Delivery `4ce88959a751066f96da4cbab8d1fc9ac29bb320`.
- Migration 18 original SHA256 `c8bd4de06fbc31d8b4c3b082e27c9b9da0dac58fcf2d2f238d68e01134b78668` / derivado SHA256 `d2da1a67c5f7b7f9390f77c831a16b9a794b0e64d80a82e0ce33b07114cdd85a`.
- Aplicação de revogação e pós-gate = **BLOCKED/NOT RUN**.

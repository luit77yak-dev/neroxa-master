# Proposta anterior à implementação

Painel moderno real /admin/pedidos mantém login Supabase e RPC get_admin_orders por instância. Falta detalhe versionado; propõe-se get_admin_order_detail(instance,order) authenticated-only que exige auth.uid e autorização existente get_admin_orders antes de retornar itens/histórico. Não remover /painel legado; permanece fora da homologação operacional segura.

Reconciliação proposta: RPC authenticated-only por OWNER/ADMIN/MANAGER explicitamente concedido na instância ou plataforma ADMIN/SUPER_ADMIN AAL2. Usa o mesmo advisory lock por instância de create_public_order. Pedido existente: CONFIRMED com referência, sem pagamento/append. Chave sem pedido: inserir fence permanente auditável, impedindo criação futura pela mesma chave; resposta FENCED_ABSENT significa ausência após serialização, não prova de falha antes dela. Nenhuma chave nova é emitida, nem acesso por telefone. Sem chave original/prova, procedimento permanece UNKNOWN e bloqueado; limpeza completa de toda identidade anônima não é reconciliação segura.

Storage: acrescentar marcador sem PII na memória e cookie local de pendência para detectar remoção do cofre enquanto o marcador existe. Esse marcador só nega repetição; não é autorização, não recupera dados e não substitui a prova no servidor. Quando cookie/storage/memória todos forem apagados, identidade anônima é irrecuperável e permanece limitação bloqueante comercial.

Restore: criar pedido GROUP real por RPC no schema completo, registrar snapshot/intenção/lease, restaurar e usar Auth/PostgREST do destino para verificar prova, idempotência e isolamento. Roles globais compartilhadas continuam limite explícito; não afirmar DR entre clusters.

Transições: RPC recuperada valida apenas enum, não sequência. Proposta estrita desta candidata: RECEIVED→CONFIRMED→PREPARING→READY→OUT_FOR_DELIVERY→DELIVERED; retirada READY→DELIVERED. Cancelamento até READY; finais não regressam. Replay do mesmo estado não acrescenta histórico; preserva verificação de congelamento de writes. Decisão comercial proposta, não implantação autorizada.

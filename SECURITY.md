# Segurança da Neroxa Master

## Pendência aceita — Leaked Password Protection

**Status:** aceita temporariamente no plano atual do Supabase.

O Supabase Security Advisor sinaliza que o **Leaked Password Protection** está desativado. A habilitação dessa proteção depende de um plano do Supabase que a disponibilize.

### Decisão

A Neroxa não fará upgrade de plano exclusivamente para eliminar este alerta durante a fase atual do MVP.

### Mitigações já implementadas

- Supabase Auth para autenticação.
- RLS nas áreas sensíveis.
- Controle de acesso por papel: SUPER_ADMIN, ADMIN, FINANCE e SUPPORT.
- Funções administrativas com execução anônima bloqueada.
- Auditoria das operações administrativas.
- Proteção de acesso às instâncias conforme assinatura/domínio.
- Separação entre aplicação Master e aplicações dos clientes.

### Revisão futura

Reavaliar esta pendência quando a Neroxa migrar para um plano do Supabase que permita habilitar o recurso, especialmente antes de uma expansão significativa da base de usuários.

**Classificação:** risco conhecido e aceito para o MVP.

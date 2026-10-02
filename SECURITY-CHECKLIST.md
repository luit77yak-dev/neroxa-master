# Checklist de Segurança — Neroxa MVP

Objetivo: registrar os controles mínimos antes da abertura comercial do MVP e deixar explícitas as pendências aceitas.

## 1. Autenticação

- [x] Login do Neroxa Master via Supabase Auth
- [x] Recuperação de senha com domínio de produção
- [x] Bloqueio de execução anônima das funções administrativas
- [ ] Leaked Password Protection
  - **Status:** pendente/risco aceito
  - **Motivo:** indisponível no plano atual
  - **Revisão:** antes de uma expansão significativa da base de usuários

## 2. Permissões

- [x] Papéis definidos: SUPER_ADMIN, ADMIN, FINANCE, SUPPORT
- [x] Controle de acesso por módulo no Master
- [x] Controle de ações administrativas por papel
- [x] RLS aplicado às áreas sensíveis
- [x] Alterações de assinatura protegidas
- [x] Alterações comerciais protegidas
- [x] Alterações financeiras protegidas
- [x] Gestão de planos protegida
- [ ] Revisar todos os controles de mutação da área Clientes antes do lançamento comercial

## 3. Auditoria

- [x] Tabela de auditoria
- [x] Registro de alterações de assinatura
- [x] Registro de criação/alteração de planos
- [x] Registro de alterações comerciais
- [x] Registro de alterações financeiras
- [x] Leitura da auditoria restrita a SUPER_ADMIN/ADMIN
- [x] Índices para consultas por ator, organização e recurso
- [ ] Completar auditoria de operações de Clientes e Domínios, se aplicável

## 4. Ciclo SaaS

- [x] Cliente → Plano → Assinatura → Instância → Domínio
- [x] Assinatura ACTIVE → Instância ACTIVE
- [x] Assinatura PAUSED → Instância SUSPENDED
- [x] Assinatura CANCELLED → Instância ARCHIVED
- [x] Instância ARCHIVED → Domínio DISABLED
- [x] Instância vinculada a sistema do catálogo
- [x] Domínio validado antes de liberar acesso

## 5. Ações destrutivas

- [x] Cancelamentos exigem confirmação
- [x] Encerramento de contratos exige confirmação
- [x] Reembolsos exigem confirmação
- [x] Ações destrutivas não dependem de botão icon-only

## 6. Deploy

- [ ] CI do branch de segurança concluído com sucesso
- [ ] Build de produção concluído
- [ ] Lint concluído
- [ ] Rotas do Master verificadas em produção
- [ ] Login e recovery verificados em produção
- [ ] Domínio Master verificado
- [ ] MVP com controle de acesso de tenant verificado
- [ ] Vercel Production verificado

## 7. Antes do lançamento comercial

- [ ] PR de segurança revisado
- [ ] CI final verde
- [ ] Teste com usuário ADMIN
- [ ] Teste com usuário FINANCE
- [ ] Teste com usuário SUPPORT
- [ ] Confirmar que SUPPORT não executa ações administrativas restritas
- [ ] Confirmar que FINANCE não acessa módulos administrativos fora do escopo
- [ ] Testar tentativa de acesso direto a rota sem permissão
- [ ] Testar tentativa de mutação bloqueada por RLS
- [ ] Confirmar geração dos registros de auditoria
- [ ] Registrar pendências residuais

## Responsabilidade

**Responsável:** Neroxa  
**Escopo:** MVP / primeira operação comercial  
**Revisão:** antes do primeiro lançamento comercial e novamente quando houver mudança relevante de arquitetura, autenticação, permissões ou plano do Supabase.

### Critério de saída do MVP

O MVP pode avançar quando os itens críticos de autenticação, RLS, permissões, auditoria e ciclo SaaS estiverem validados. O alerta de Leaked Password Protection permanece como risco conhecido e aceito até revisão futura.

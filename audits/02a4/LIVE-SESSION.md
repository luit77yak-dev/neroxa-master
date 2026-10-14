# Sessão Auth ativa — correção privada Delivery

Base Master43 SHA55dfd757410cf179e1e51744c6f15f224f26f810. O ensaio provou evento marcado depois de logout Auth com sucesso e remoção da sessão. JWT assinado ainda válido não basta para o contrato privado de revogação imediata.

Sucessor do helper já existente exige auth.sessions.id igual ao session_id assinado e user_id igual auth.uid(), além dos mesmos grants/roles/AAL2. Mantém assinatura/ACL/owner; não muda schema Auth, grants globais, is_neroxa_staff ou CRM. Sem sessão ou JWT legado sem session_id: negar e exigir novo login, sem fallback inseguro. Funciona somente com Auth real compatível; preflight exige leitura de sessions pelo executor normal e hash exato do helper. Nenhuma elevação para forçar PASS.

M core:19 predecessores -> scoped02A2 -> disponibilidade -> complementos -> live-session. Storage:mesma sequência + Storage privado nativo já revisado. Ordem/hashes MANIFEST. Não inclui F02 nem L: não é candidato comercial integrado. Perfil legado permanece separado na Delivery41. Papéis de servidor que não usam este helper continuam sob seu próprio contrato service-only; não simular usuários com service_role.

Ensaios: lotes Auth reais do núcleo,324 horários,17 complementos,45 Storage, REST com JWT antigo, canal mantido após logout e reconexão com JWT antigo versus controle positivo B ainda logado. Validar rollback de prosrc/ACL de funções além de políticas/dados. Resultados somente após execução; não pronta para merge/deploy. Auth schema/SSO/consumidores antigos sem session_id requerem compatibilidade antes de implantação. JWT expiração continua validada pelo backend; este gate adiciona sessão existente, não redefine política global de duração.

Rollback: manter contenção; erro antes de commit aborta somente no clone; após commit usar sucessor seguro. Não restaurar helper sem validação de sessão nem privilégios amplos para recuperar serviço. T1 e fluxos comerciais continuam gates independentes.

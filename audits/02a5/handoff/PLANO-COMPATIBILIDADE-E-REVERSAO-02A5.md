# Compatibilidade e reversão — 02A.5

Estado integrado: BLOCKED. SQLs não aplicados; contratos comerciais globais não alterados. Não há rollback de produção autorizado.

| Superfície | Efeito candidato | Condição para avançar | Recuperação segura |
|---|---|---|---|
| Master comercial global | is_neroxa_staff, contratos/assinaturas/jobs inalterados | staff sem grant ainda executa somente funções globais legítimas no clone | manter escopo comercial; corrigir políticas específicas |
| Delivery memberships | helper exige session_id ativo e grant de instância | Auth real AAL2 + revogação/logout/reconexão no M integrado | relogin/SSO com sessão válida, nunca voltar ao corpo antigo |
| Consumidor legado sem session_id | falha fechada esperada | testar token legítimo emitido pelo Auth local e fluxo de relogin | novo login; não exceção global |
| Tracking antigo | duas chamadas removidas da UI | endpoint privado + quota durável/proxy + testes comprador | acompanhamento indisponível e suporte assistido |
| Append antigo | ramo UUID+telefone removido | perfil amendment próprio + preço/histórico/idempotência + decisão NOT_SETTLED | append desligado; novo pedido só conforme decisão comercial |
| Checkout | emissão tracking preparada, flag true bloqueia checkout antes de DB | remover bloqueio SOMENTE junto à infraestrutura e validação completa | flag privada off; preservar chave idempotente e reconciliar pedido incerto |
| Storage privado | originais não públicos | imagens derivadas publicadas explicitamente e migradas | placeholder/indisponibilidade, nunca bucket público |
| Pedidos/histórico | nenhum dado migrado nesta missão | verificar FKs/valores/ACL e T1 completo | terceiro destino com controles restritivos |
| SQL telefone | gate ainda bloqueado | inventário consumidores internos/externos e execução HTTP validada | conservar revogação, roll-forward |
| L legado | perfil separado sem isolamento nativo A/B | manter quarentena; sem mistura com M | permanecer indisponível |

Aplicação candidata exige preflight exato, backup fictício verificável e parada no primeiro erro. Reverter transação incompleta com ROLLBACK; após commit não executar inverso que recoloque exposição. Selecionar versão anterior apenas se também preserva os controles atuais e compatibilidade de dados; caso contrário, suspender superfície e roll-forward restrito. Restauro T0 que perde T1 não é reversão aceitável sem decisão explícita sobre perda; ensaio separado obrigatório.

Nenhuma URL antiga de imagem, recovery de token perdido, app externo ou integração SSO é considerada compatível por inferência. Consumidores não auditados mantêm F01/F02 abertos.

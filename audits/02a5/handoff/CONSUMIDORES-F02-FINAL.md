# Consumidores F02 — inventário final local 02A.5

Escopo: fontes Delivery branch `security/mission-02a5-private-tracking-local-20261014`, base PR39 ad41822e4622e3b14bcb650d7be84126f78b80f6. Candidato local, sem publicação. Busca `rg 'get_public_order_status|append_public_order_items' src --glob '!**/types.ts'` não encontrou consumidores executáveis remanescentes. Isso NÃO prova ausência em clientes externos ou RPCs do banco.

| Consumidor | Estado | Contrato/impacto |
|---|---|---|
| Storefront.tsx refresh periódico | SUBSTITUÍDO no candidato | somente readPrivateTracking; removidos telefone e ramo recoverSnapshot como caminho de tracking |
| Storefront.tsx após checkout/append | SUBSTITUÍDO no candidato | mesma capability; não usa snapshot de recovery como autorização de acompanhamento |
| CheckoutPanel.tsx append legado | DESABILITADO no candidato | ramo RPC por telefone removido; gateway off mostra atendimento da loja |
| CheckoutPanel.tsx checkout | PARCIAL | captura tracking_token apenas em memória se recebido; fluxo público create_public_order preexistente continua quando gateway off e ainda exige gate de release próprio |
| checkout-gateway.server.ts | PARCIAL/FEATURE OFF | emissão CSPRNG+hash via RPC preparada após checkout efetivo; NEROXA_PRIVATE_TRACKING_ENABLED=true retorna503 ANTES de DB enquanto quota/proxy não integrados; nunca habilitar flag para clientes |
| /api/order-track + private-tracking.server.ts | DESABILITADO | handler puro com projeção/Host/Origin/body/quota preparado; adapter enabled=false independentemente de env até completar integração |
| private-tracking.ts | TESTADO somente como unidade | allowlist canônica servidor; rejeita headers proxy sem contrato, Origin divergente, body com instance_id e tokens na URL; quota antes do lookup; Bearer obrigatório; no-store/no-referrer; resposta genérica com piso80ms, NÃO garantia de tempo constante |
| order-amendment.server.ts | PENDENTE de ensaio | RPC capability(uuid,uuid,text,uuid,jsonb), preço no servidor, NOT_SETTLED; não alterado para remover cobrança; flags preexistentes devem permanecer off |
| /api/order-recover | PENDENTE independente | não é recuperação de capability; permanece checkout/reconciliação de intenção preexistente com guards. Não usar para tracking/token perdido nem presumir segurança integrada |
| Supabase phone RPC/overloads diretos | PERIGOSOS ATÉ GATE | não revogados nesta missão; integrar SQL service-only e revogar coordenadamente somente no clone após consumidores adequados |
| Tipos gerados | DOCUMENTAÇÃO de schema antigo | presença de nomes não equivale a consumidor executável; não atualizar contra backend comercial |
| Apps/scripts externos | NÃO VERIFICÁVEL | inventário e desativação dependem dos proprietários; impede liberar gate por mera busca local |

## Token e ameaça

32 bytes CSPRNG server-side, base64url43. DB recebe somente SHA256. Registro único por order_id e checkout_key existente; conflito não devolve token anterior. Se checkout confirmou mas resposta se perdeu, repetir mesma chave não duplica pedido nem reemite segredo já registrado; usuário recebe indisponibilidade de tracking e suporte assistido. Não criar novo pedido/chave automaticamente. Recuperação self-service BLOCKED: não há canal de verificação forte aprovado. UUID+telefone nunca bastam.

Cliente mantém token somente em Map de memória browser, separado da capability de append. Sem localStorage/sessionStorage/URL/cookie ou snapshot serializado. Reload, nova aba ou aba anônima perdem token; fechar aba elimina referência. XSS ainda pode roubar token em memória: CSP/dependências/limpeza de logs e política de suporte são gates; esta escolha não resolve XSS. Sem token não há fallback. SQL é autoridade de TTL24h/revogação; ações de revogação explícita/recuperação segura ainda precisam de endpoint administrativo autorizado e ensaio.

Risco existente: resumo/histórico local legado pode conter telefone e dados do próprio comprador. Não é fonte de autorização, mas retenção/PII desse histórico requer revisão separada. Nenhum token novo é inserido nesse histórico pelo candidato. O contrato HTTP não registra headers/body; logs de edge/infra externos ainda precisam de configuração e prova de redação. Nunca capturar Authorization em trace de ensaio com tokens reais.

## Proxy e quota pendentes

O handler puro só aceita Request.url canônica e rejeita Forwarded/X-Forwarded-*; isso NÃO estabelece sozinho autenticidade do Host no adaptador/edge. Definir quais proxies são confiáveis, remover headers de origem não confiável na borda, vínculo domínio→instância no servidor e durable ingress quota antes de qualquer DB. Não usar Map local como quota multi-worker. Nenhum desses gates está sendo contornado por flag.

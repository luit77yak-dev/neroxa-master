# Ensaio de quotas persistentes para checkout — 12/10/2026

**Classificação: TESTES ISOLADOS APROVADOS; DEPLOY NO-GO.** Nenhuma DDL, DML ou credencial de produção utilizada.

## Implementação candidata

- SQL: `audits/sql/checkout-durable-rate-limit.candidate.sql`, aplicado **somente no PostgreSQL descartável** após os 275 testes Auth/JWT/RLS.
- Contadores em `private.neroxa_checkout_quota_counters`, com chave primária por `(instance_id, scope, window_start, identity_hash)`, RLS e sem privilégios diretos para `anon`, `authenticated` ou `service_role`.
- RPC `public.neroxa_checkout_reserve_quota(uuid,text)` SECURITY DEFINER, `search_path=''`, EXECUTE concedido apenas a `service_role`.
- **Limites candidatos, não comerciais definitivos:** até **60 requisições por loja por janela de 60 s**, até **5 requisições por identificador HMAC de contato e loja por janela de 600 s**. A política é fixa por agora; deve ser afinada ao validar volume real de pedidos.
- O servidor calcula `HMAC-SHA256(secret, instance_id + ':' + normalized_phone)` com `NEROXA_CHECKOUT_RATE_LIMIT_SECRET` (somente runtime servidor, comprimento mínimo 32 bytes). Não grava telefone em claro, IP, cookie ou segredo na tabela. **O hash ainda é um pseudônimo de dado pessoal**, deve receber retenção, acesso e exclusão adequados.
- Reserva de cota em PostgreSQL por `INSERT ... ON CONFLICT DO UPDATE ... WHERE attempts < limit`, de forma atômica entre workers. Se a segunda cota falhar, a exceção `PT429` desfaz os dois incrementos da transação; PostgREST traduz o código para HTTP 429.
- O gateway do Pizza Perfect Plate reserva a tentativa **antes de `create_public_order`**. Na falha de reserva responde 503 (fail closed), ou 429 (limite), **sem executar a função de criação de pedido**.

## Evidência real, sem tocar na produção

[Workflow Isolated A-B Auth Matrix — **38273960408**](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38273960408):

- Matriz histórica Auth/JWT/RLS: **275 PASS, 0 FAIL**.
- Integração do gateway importado do Pizza Perfect Plate com PostgREST e SQL reais em cluster local: **45 PASS, 0 FAIL**.
- **12 requisições simultâneas** para o mesmo fingerprint da loja A: 5 reservas concedidas, 7 negadas com `HTTP 429 / SQLSTATE PT429`.
- Contador persistido ficou exatamente em 5; o mesmo fingerprint pôde ser reservado independentemente em outra loja da mesma organização e em loja de outra organização.
- Saturação do bucket global da loja no ambiente de teste: a tentativa seguinte a 60 requisições foi negada por HTTP 429, sem incrementar o contador.
- `anon` e `authenticated` não têm EXECUTE na RPC de cotas; a criação pública direta foi revogada **apenas no clone** e seu bypass testado; gateway continuou criando pedidos válidos.
- Foi exercitado o **gateway real conectado ao PostgREST descartável** com um telefone fictício novo: cinco pedidos aceitos, sexto recusado com **HTTP 429** e comprovação de que nenhuma sexta linha de pedido foi criada.

O workflow ainda classifica `productionCompatibility:false`; isso é correto. A autorização de produção permanece **NO-GO**.

## Limites e pendências reais

1. O ensaio invoca o **núcleo do gateway** com PostgREST local, não o runtime HTTP TanStack/Vercel com TLS e domínio roteado confiavelmente.
2. Esta reserva e a criação do pedido são **duas transações distintas**. Se o pedido falhar após reservar a tentativa, a quota ainda é consumida. É seguro para contenção, mas a experiência e as falhas intermitentes exigem revisão e limites práticos.
3. O cliente controla o telefone informado; o contador global limita rotação de telefones, mas não substitui WAF, limitação por IP validado na borda, detecção de bots nem quotas globais entre organizações.
4. A credencial `service_role` contorna RLS e tem amplo poder; objetivo futuro é serviço com credencial menos privilegiada, segredos rotacionáveis e observabilidade saneada.
5. Não há tarefa de limpeza das linhas antigas ainda; definir retenção (por exemplo após janela + margem de auditoria) e execução controlada para evitar crescimento indefinido.
6. Validar resposta 429, falhas de quota, concorrência real do endpoint, tentativas falsas e log sem PII na rota HTTP publicada em ambiente de ensaio isolado.
7. Fechar todos os consumidores legados, a configuração de settings sem instância, recuperação operacional e a sequência de revogação/ativação sem indisponibilizar clientes.

**Operação:** manter as PRs #37 do Master e #37 do Pizza Perfect Plate em draft. Não habilitar as flags em produção; não mesclar; não aplicar candidato SQL no Supabase Master. Os limites e a operação precisam de aprovação e configuração final depois dos ensaios.

# Contrato canônico escolhido — núcleo operacional nativo

Escolha: neroxa_instance_members + neroxa_private.has_instance_role, GROUP_ADDONS_V1 v2, disponibilidade por instância, checkout autoritativo, intents/hash/lease/fencing, capabilities privadas e painel operacional. Não manter dois permission engines nem inferir que nomes semelhantes são equivalentes. Organização não confere acesso automático a instâncias. Plataforma usa papéis Master/MFA; SUPPORT/FINANCE permanecem decisão pendente.

Ponte limitada ao perfil OBSERVADO:12 tabelas/8 funções e oito migrations NÃO instaladas. Detectar delivery_instance_grants/private.delivery_*/capabilities antigas ou outros objetos incompatíveis interrompe; não converter automaticamente essas concessões nem concatenar8+25.

Projeção explícita16 tabelas:12 originais + categorias/grupos/adicionais/links. Financeiro, contratos, billing, Supplier, ledger e provisionamento Master não copiados. Clean usa catálogo completo histórico; upgrade usa fonte reduzida reconfirmada e expansões ALTER/CREATE de objetos novos. Nenhum build_schema.py em populated, TRUNCATE ou DROP CASCADE como estratégia.

Incompatibilidades abertas: plan_id/subscription_id novos nullable sem FKs até reconciliar autoridade comercial; PK membership original preservada com novo id UNIQUE. Role/status/timestamps/configurações ausentes exigem app.bridge_resolution por registro. Não atribuir ADMIN, ACTIVE, plano ou todas lojas por default. Testes usam decisões fictícias explícitas; dados reais continuam bloqueados.

Pedidos, IDs, números, quantidades, valores e eventos preservados in-place. Decimal cast sem perda; não recalcular histórico com catálogo atual. Addon legado id-only continua v1/opaque; não reinterpretar UUID produto como addon. Half antigo preservado, sem habilitar novas pizzas meio a meio. Payload antigo não contém nome/preço individual do adicional: não inventar a informação. GROUP v2 somente para pedidos novos compatíveis; PIX/CARD_ON_SITE históricos são rótulos, não prova de captura/settlement.

B cria journal/anchors privados; C captura origem T0 sem gerar provas. D somente frozen prepara contratos nativos.25 candidatos na ordem/hash conhecidos precedem E, que fecha APIs legadas no ensaio, revoga PUBLIC/DDL privileges de clientes e bloqueia retrofit de intent/capability para anchors. F verifica dados/Auth/isolamento/T1. Loss total de identidade continua UNKNOWN; sem recuperação por telefone nem nova chave automática.

Journal evita blind replay B/C/D; não é instalador remoto acabado. Crash entre SQL nativo e checkpoint exige inspeção/reparação revisada. Restore independente, backup efetivo do destino e consumidor publicado não estão aprovados. GO do modelo operacional não é equivalência integral ao Master, homologação hosted ou autorização comercial.

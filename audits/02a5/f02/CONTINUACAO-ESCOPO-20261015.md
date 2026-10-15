# Continuação F02 — execução limitada pré-gate

Origem: ZIP SHA256 `ad5ad50da872252026cdbd18d6a737fb3c6052e727015ba0a204c79687779f99`; oito hashes verificados. CSV e manifesto avulsos idênticos. Base efetiva autorizada pela continuação mais recente: Master `244bed564329fe11e4e0a3bec8bae69656e96fa6`, Delivery `4ce88959a751066f96da4cbab8d1fc9ac29bb320`. A referência `34de496` no pacote é histórica, não substitui a instrução posterior.

Este incremento testa PG-04 no perfil Master manifestado, após os testes comprador existentes. Não combina migrations Delivery; não adiciona o overload enum nem considera sua ausência revogação. Não afirma candidato integrado pronto. PG-02 integrado continua BLOCKED por divergência de contratos. Owners, wrappers e ACLs são capturados pela consulta nativa existente e confrontados com o contrato de origem.

Teste terminal: telefone errado → negação sem mudança; telefone correspondente + UUID de B + preço adulterado → negar como expectativa de segurança. Qualquer retorno privado ou mutação é FAIL P0. Captura digests das tabelas públicas/privadas, Storage buckets/objects e auth.sessions, além de pedido/itens fictícios e totais. A quota durável continua excluída do digest de negócio; T1 não ensaiado. Após mutação indevida não há compensação nem novas mutações de teste: somente consulta de catálogo e descarte do clone.

Preço calculado de catálogo observado num ataque não comprova fluxo financeiro legítimo. Retry de append, overload Delivery, checkout TanStack hidratado, Storage CRUD/Realtime/logout e T1 não são cobertos neste incremento. Os PASS anteriores permanecem limitados ao RPC+adapter, disponibilidade e identidades reais descartáveis.

GT-01..03 BLOCKED, PO-01..09 NOT RUN. Sem CONSUMER-DISABLEMENT, GUC de consumidores ou SQL de quarentena. Nenhum banco remoto, deploy, DNS, alias ou demo alterado. F01/F02 abertos; Marco 01 0/7; comercial NÃO LIBERADO. Sucesso de workflow indica conclusão do recorte forense e cleanup, não segurança aprovada.

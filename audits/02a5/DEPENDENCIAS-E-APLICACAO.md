# Perfil M integrado candidato — 02A.5

Estado: **BLOCKED para aplicação**. A validação de bytes/origem é PASS, não validação PostgreSQL. Nenhum SQL desta missão foi executado. L e amendment não são anexos automáticos de M.

1. Executar `python3 audits/02a5/verify_manifest.py` em checkout com objetos Git de origem disponíveis. Uma origem ausente bloqueia; não substituir por arquivo parecido.
2. Confirmar stack Supabase completamente local, imagens por digest, Auth/Storage nativos e executor `postgres` não superuser. Registrar `current_user`, `rolsuper`, `rolbypassrls`, ownership e ACL nativos. Não dar privilégios para superar preflight.
3. Reconstruir catálogo histórico vazio com `tools/ab-auth/build_schema.py`, cujo hash e catálogo são conferidos. O builder histórico restaura owners capturados da aplicação e desliga validação de corpos durante reconstrução de dependências; isso não aprova compilação/execução das funções. Não modificar Auth/Storage ou usar esse modo nos SQLs candidatos. Capturar compilação/invocação real após reconstrução.
4. Aplicar os 19 predecessores na ordem literal do manifesto. Depois scoped → availability → addon → live-session → Storage → private-tracking. Cada arquivo contém sua própria transação; NÃO existe garantia de atomicidade de toda a cadeia. `ON_ERROR_STOP=1`; parar no primeiro erro, preservar logs sem conteúdo de requests e descartar clone inconsistente.
5. Gate de telefone: somente quando TODOS consumidores forem substituídos ou desabilitados e testados. `CONSUMER-DISABLEMENT.json` intencionalmente ausente nesta entrega. `--release-ready` retorna BLOCKED. Não fabricar PASS/GUC para ultrapassar o gate. O inventário local não prova ausência de apps externos.
6. Capturar assinaturas, owners, search_path, prosrc, proacl, grants herdados, policies USING/WITH CHECK e triggers antes/depois de cada unidade. Repetir reconstrução em segundo clone limpo com o MESMO manifesto e comparar catálogo canônico. Não reaplicar CREATE TABLE/POLICY em clone preenchido como se fosse idempotente.
7. Executar matriz positiva/negativa completa + HTTP + Realtime no candidato único. O harness 02A.4 anexado por hash é apenas fonte: seus focos separados e FAILs históricos não certificam esta composição. Adaptá-lo em branch isolada antes de executar.

## Dependências observadas por leitura, ainda sem prova de composição

- Scoped cria `neroxa_private.has_delivery_instance_role`, sobre memberships de instância, preservando autorização comercial global do Master.
- Availability adiciona caps AND restritivas às quatro famílias; addon adiciona permissivas explícitas subordinadas às caps. Ambas consultam a MESMA assinatura do helper, portanto a troca posterior por live-session deve afetá-las sem recriar policies; comprovar com Auth real.
- Live-session exige md5 exato do corpo scoped anterior e SELECT de `auth.sessions`; adiciona vínculo sessão+uid. JWT sem session_id deve negar. Não alterar `is_neroxa_staff` nem ACL/owner do helper.
- Storage usa o helper já endurecido; RLS nativa deve existir. Bucket privado `product-images`, PNG e 1MiB são pré-condições via Storage API. Policies não controlam URL pública de bucket indevidamente publicado.
- Tracking usa schema `private`, orders/items/instances e `extensions.digest`. Funções SECURITY DEFINER com search_path vazio; EXECUTE somente service_role. Esse papel representa o servidor, nunca um comprador/Admin fictício.
- Gate de telefone opera sobre TODOS overloads dos três nomes públicos e verifica herança. É restrição coordenada, não substituto de endpoint.
- `CREATE OR REPLACE` relevante: helper é substituído por live-session; funções checkout/catalog/phone dos predecessores foram substituídas em sequência histórica e têm guards md5. Não reexecutar group-pricing depois de availability/recovery/reconciliation. O perfil amendment substitui sua própria RPC em cadeia separada; confirmar md5 antes de cada replacement.
- Tracking não usa helper da sessão para comprador: sua autoridade é capability + instância resolvida pelo servidor + quota, não Auth staff/Origin.

## Recuperação

Antes de COMMIT da unidade: rollback transacional. Depois: manter contenção e roll-forward seguro ou restaurar em terceiro destino segundo plano T1. Nunca copiar corpo antigo do helper, restaurar ACL telefone ou StaffPanel. O teste de transação abortada não prova recuperação pós-commit.

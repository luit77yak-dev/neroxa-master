# Falhas e roll-forward — PASS restrito

Workflow final: https://github.com/luit77yak-dev/pizza-perfect-plate/actions/runs/38490640042.
A read-only; B/C/D transacionais, lock_timeout5s/statement_timeout90s. C/D exigem congelamento. Journal privado/RLS registra etapa/SHA/catalog_digest/timestamp. Retomada confere hash SQL, propriedades do catálogo e digests dos campos antigos; não repete cegamente arquivos não idempotentes. Não certifica captura universal de todos roles/defaults/enums/serviços do cluster.

57 checks de preparação: contexto ausente, drift coluna/função/ACL/policy, vínculo ambíguo, Auth órfão, total errado, ordem C/B, falha após expansão, resolução comercial ausente, falha durante conversão e D sem freeze. As negativas verificam CAUSA específica, não erro genérico. Transação falha não deixa checkpoint nem altera os dados originais.

Após pedidos novos T1 do browser, hash de TODOS orders é capturado; falha transacional de journal seguida de RAISE comprova rollback do checkpoint e preservação de T1. Novo pedido nativo na instância original também integra checkpoint T1 posterior. Não restaurar T0, não downgrade da PK por organização. Isso demonstra integridade após falha transacional/roll-forward conservador, não reparação arbitrária de qualquer instalação incompleta.

Os25 componentes nativos conservam sequência/hashes homologados. Não há transação global, idempotência universal ou retomada automática se houver crash entre SQL nativo e checkpoint. Parar, inspecionar estado/objetos e preparar reparação revisada. Install-approved.psql antigo não é o instalador desta ponte.

## Causas encontradas e corrigidas

- to_regprocedure tinha nomes de argumentos; agora somente tipos, signatures/body/owner/ACL continuaram assertados.
- ACL em3 funções mudou apenas ordem;8 bodies/definitions/configs iguais. Ordenação preserva grantor e grant options, não elimina comparação.
- Conta Auth fictícia outsider colidia com fixture anterior; prefixo único, sem excluir usuários.
- Fixture inicial não representava keys/status/half/modalidades/quantidades. Foi substituída por perfis anonimizados comprovados; seus PASS antigos não são o upgrade final.
- Registry nativo verificava key/status/instância, sem distinguir T0. Guard novo bloqueia capability retroativa para histórica RECEIVED elegível, mantendo controle positivo para nova ordem. É risco da candidata, não exploração remota confirmada.

## Recuperação reexecutada

https://github.com/luit77yak-dev/neroxa-master/actions/runs/38488429219 SUCCESS, Master12122dee62692d79e2ce01616417b45751ee6d45.
202 checks restore +36 rehearsal PASS;93 tabelas/97 FKs, pg_dump/pg_restore17.11; dados/definições/ACL/RLS/owners/constraints/triggers e Auth destino verificados.
Dois databases no MESMO cluster, roles globais compartilhadas. Não é restore independente da projeção da ponte/anchors, nem backup do sandbox remoto. Este permanece gate separado.

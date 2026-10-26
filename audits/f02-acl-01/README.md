# F02-ACL-01 — candidato estático de ensaio focal

**Nenhuma execução de SQL, Docker ou Actions nesta missão. F01/F02 abertos; Comercial NÃO LIBERADO.**

Novo diretório independente. Nenhum arquivo compartilhado ou congelado foi alterado.
O único SQL de correção é `revoke.sql`. `fixtures.sql` contém somente dados fictícios
identificáveis e uma role local NOLOGIN sem memberships. Não cria a identidade real.

## Base e dependências

- Master: `c149f802adf1922be588319cc98a798c7b387ea8`.
- Delivery: `011275488660bfa1a9271b3e4c92e457f7638e34`, apenas checkout e conferência de SHA; sem importar seu schema legado.
- Histórico informado/inspecionado: execução `38785111675`; comprova componentes do laboratório, não este driver.
- Supabase CLI `2.120.0`, Node `22.23.0`, VM padrão GitHub `ubuntu-24.04`.
- PostgreSQL `supabase/postgres@sha256:f2a84af37797675f0b27e27ea1fad2ebcd913ebf7ad60be05d7df0bcbd29e4b5`.
- Image ID linux/amd64 exigido: `sha256:94fe95acfce6e1d41106ff2abd4c08e7932a6941d453499a56f8a620a473de1a`.
- O digest é candidato identificado documentalmente; disponibilidade/ID serão verificados por pull somente na execução futura. A tag mutável não basta.
- Auth, REST, Storage, Realtime, Kong: IDs integrais em `audits/02a5/EXPECTED-IMAGES.json`, verificados antes dos testes.
- `manifest.json` fixa SHA256 dos arquivos novos e componentes reutilizados. CLI/action pins seguem o laboratório existente; não constituem dependências novas auditadas integralmente.

Reutilização direta, sem editar: `tools/ab-auth/build_schema.py`, `configure.py`,
`docker_loopback.py`, `tools/mission-02a3/preflight.py`,
`tools/mission-02a5/network.sh`, catálogo Master e EXPECTED-IMAGES.
A reconstrução usa DDL/metadados capturados, sem dump de linhas nem exportação hospedada.
O helper precisa corresponder aos três hashes aprovados e à ACL, owner postgres,
SECURITY DEFINER e config exatos. Diferença em qualquer ponto encerra o ensaio.
Isso não certifica equivalência de todo o schema hospedado atual.

## Menor caminho operacional preparado

1. Revisar este candidato e seus hashes. Validar autorização futura de execução e a neutralização de deploys automáticos antes de publicar qualquer branch.
2. Em decisão posterior, ativar somente `workflow.candidate.yml` em `.github/workflows`, atualizar a admissibilidade de caminhos do driver e manifest e revisar o novo SHA. A ativação é deliberadamente bloqueada pelo guard atual, que só aceita delta neste diretório.
3. Disparar manualmente pelo SHA exato revisado, em repositório público, VM padrão nova e tentativa 1. Não usar secrets/environments hospedados. Não executar o workflow histórico inteiro.
4. O driver verifica ancestry/base, Delivery, árvore limpa, hashes, credenciais ausentes, recursos mínimos (28 GiB disco, 6 GiB memória e 2 CPUs pelo preflight existente), Docker local e ausência de colisões. Após início exige 18 GiB livres.
5. Inicializa stack local não vinculada, seeds/migrations ausentes, seis imagens exatas, bindings loopback. SQL somente por socket dentro do contêiner inspecionado; REST/Auth apenas loopback. Bloqueia egress do UID de teste e bridge antes de importar o catálogo.
6. Reconstrói schema, valida preimagem, insere fixtures, recarrega cache REST, testa antes, aplica um REVOKE e compara catálogo/dados. Repete positivos e negativos.
7. `finally` remove stack/volumes/rede, regras, UID/processos, relay, ACLs de travessia e material local de Auth. Auditoria independente exige recibo PASS e inventário final sem resíduos. `result.json` contém somente metadados da função/resultados; nunca tokens/senhas.

O comando futuro é `python3 audits/f02-acl-01/driver.py run`; `audit` confere cleanup.
`exercise` é uma etapa interna sob UID isolado, não uma interface para conexão hospedada.
Template permanece **inativo**, fora de `.github/workflows`; nada será disparado ao criar
este candidato local. Publicação remota não realizada, pois a nova branch não possui
exclusão explícita no Vercel existente; nenhuma alteração compartilhada foi feita para contornar isso.

## Matriz preparada — todos os testes abaixo NÃO EXECUTADOS

| Verificação | Critério futuro |
|---|---|
| Imagem/recursos/SHAs/isolamento | Todos os guards passam antes de reconstruir dados |
| Preimagem | MD5 prosrc e definição + SHA256 definição, owner, config, ACL exatos |
| Helper explícito, antes/depois | postgres/anon/authenticated/service_role retornam 54 |
| Preço composto | maior metade 44 + borda 3 + adicional 2 + complemento 5 |
| Checkout Auth real e anon, antes/depois | REST total 108; quantidade 2; linhas consistentes |
| Replay checkout | Mesma resposta, sem mudança em pedidos/itens/histórico |
| Adição legada, antes/depois | Mais 30, subtotal/total/soma das linhas 138 |
| Controle negativo inicial | Role fictícia sem memberships possui EXECUTE via PUBLIC |
| Delta focal | Só ACL do helper muda; nenhum outro grant, função, política ou dado muda |
| Negativo final | has_function_privilege=false, chamada gera 42501, sem writes, definer_execute=0 nos schemas de aplicação |
| Capability/replay opcional | Só com duas definições exatas já presentes; nunca instalar candidato nem trocar helper |
| Cleanup | Sem contêineres/volumes/redes novos, processos/UID/regras/ACLs/keys temporárias |

Capability não está no catálogo histórico: na base fixada será **NOT_RUN**, sem conclusão
sobre esse fluxo. Dependência parcial ou versão diferente deve falhar fechado. Se a
admissão exigir capability, este candidato permanece BLOCKED para essa conclusão;
seria necessária nova autorização de escopo, não alteração silenciosa do laboratório.
Replay não é atribuído à adição legada, que não possui contrato idempotente.

## Limites e admissão

A revisão estática não prova comportamento SQL, ausência de regressão, disponibilidade
da imagem, cache do PostgREST, limpeza operacional ou equivalência hospedada atual.
Timeout/cancelamento abrupto pode impedir `finally`; a etapa always e a destruição da
VM são camadas adicionais, e recibo ausente nunca é PASS. O UID possui Docker como no
harness histórico: isolamento é para ensaio confiável, não sandbox contra código hostil.
Não há proteção contra cancelamento forçado equivalente a uma execução concluída.

Admissão futura exige: SHA final aprovado; publicação sem deploy; ativação separada
com guard/manifest reconciliados; imagem/demais hashes efetivos; preimagem exata;
positivos antes/depois e negativos PASS; delta único; cleanup PASS. Capability continua
limitado ao disponível. Não extrapolar PASS focal para provisionamento, F01/F02 ou comercial.
Custo esperado: runner Linux padrão em repo público, sem serviços pagos, sem artefatos
ou cache; elegibilidade/franquia/políticas atuais da conta não verificadas nesta missão.

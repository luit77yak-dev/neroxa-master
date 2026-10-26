# F02-ACL-01 — candidato V2 estático

**SEM EXECUÇÃO. F01/F02 abertos; Comercial NÃO LIBERADO.**
Base da revisão: `3979bd893ce56823e2a7b816e41ad10efc0e3654` (V1).
Branch local: `work/f02-acl-01-driver-v2-20261026`. Nada publicado.

## Delta autorizado

1. Cleanup acumula falhas por etapa e audita todos os domínios; nenhuma falha interrompe deliberadamente as outras remoções. Operações ausentes viram no-op; falhas transitórias continuam BLOCKED nesta tentativa e podem ser retomadas por `recover`. PASS só após todas as tentativas sem erros e todos os checks PASS.
2. SIGINT/SIGTERM solicitam unwind para cleanup; durante a limpeza sinais suaves não interrompem as etapas restantes. O template tem etapas `always()` separadas para `recover` e `audit`. SIGKILL, perda da VM, cancelamento forçado ou limite global do job podem impedir ambas; recibo ausente/incompleto nunca é PASS.
3. As seis imagens são carregadas e seus IDs exatos comparados antes de qualquer serviço. PostgreSQL continua fixado pelo digest aprovado. A mesma bridge agora é `--internal`; o mesmo `network.sh` é instalado e suas regras IPv4/IPv6 conferidas antes de `supabase start`. O relay histórico permanece intacto; `guarded_relay.py` envolve apenas sua criação de contêineres, exige imagem admitida e rede exata, resolve a imagem para ID imutável e preserva os bindings loopback.
4. O resultado `RESOURCE_PREFLIGHT` deve existir uma única vez, ser JSON, ter `status=PASS` e atingir os limites numéricos. Código zero sozinho não basta; `python3 -E` também impede PYTHONOPTIMIZE herdado.
5. `vercel.json` recebe apenas `git.deploymentEnabled["work/f02-acl-01-driver-v2-20261026"]=false`. Nenhum header, configuração anterior ou arquivo de workflow ativo muda. Allowlist admite somente o diretório focal e esse arquivo, cujo delta semântico é conferido contra V1.

Adicionalmente, os positivos conferem pedidos/itens/histórico persistidos: IDs, nomes,
metades, tamanho/borda, adicionais/complementos, notas, quantidade, preço unitário,
valor de cada linha, subtotal, taxa e total. O teste negativo continua exigindo
EXECUTE=false, SQLSTATE 42501, ausência de memberships e nenhum SECURITY DEFINER
executável nos schemas de aplicação. Os grants explícitos são comparados integralmente.

## Bases e dependências preservadas

- Master histórico: `c149f802adf1922be588319cc98a798c7b387ea8`; execução histórica `38785111675` não valida V2.
- Delivery: `luit77yak-dev/pizza-perfect-plate` em `011275488660bfa1a9271b3e4c92e457f7638e34`; somente checkout/conferência, sem importar schema legado.
- CLI Supabase `2.120.0`, Node `22.23.0`, runner padrão público `ubuntu-24.04`.
- PG: `supabase/postgres@sha256:f2a84af37797675f0b27e27ea1fad2ebcd913ebf7ad60be05d7df0bcbd29e4b5`.
- Image ID PG: `sha256:94fe95acfce6e1d41106ff2abd4c08e7932a6941d453499a56f8a620a473de1a`.
- Outros cinco serviços: tags/IDs congelados de `audits/02a5/EXPECTED-IMAGES.json`; divergência no pull bloqueia antes do start. Nenhuma imagem foi baixada nesta missão.
- Reutilizados sem alteração: `tools/ab-auth/build_schema.py`, `configure.py`, `docker_loopback.py`, `tools/mission-02a3/preflight.py`, `tools/mission-02a5/network.sh`, catálogos, SQL capability e EXPECTED-IMAGES.
- O configure histórico exige workdir diretamente abaixo de RUNNER_TEMP: somente nessa chamada o driver fornece o diretório de recuperação como RUNNER_TEMP. Configuração gerada continua dentro do mesmo laboratório isolado, sem link, seeds ou migrations.

Preimagem exata mantida: MD5 prosrc `bf8a60da54fda7d28e1003d892d7e116`, MD5 definição
`b8fcc43700775f8600d52cbced33f189`, SHA256 definição
`97be7523846e2095f5588936b13539ea8596baeef238c3a3c20cc4be25f111d5`.
Owner postgres, SECURITY DEFINER, `search_path=public` e ACL inicial exatos são obrigatórios.
`fixtures.sql`, `revoke.sql`, adendo de drift e arquivos históricos permanecem inalterados.
Reconstrução inicial reproduz DDL/grants em banco vazio; após o checkpoint somente o
REVOKE de PUBLIC do helper é permitido. Não há substituição do helper nem aplicação do gate A.

## Recuperação e isolamento

O registro `state.json` é privado, gravado atomicamente e permanece sob posse do runner,
fora de `lab`, que é o único diretório transferido ao UID de teste. Apenas uma cópia
sanitizada é legível pelo teste. Intenções são registradas antes das alterações relevantes;
a recuperação valida run, SHA, caminhos, proprietário e identidades determinísticas.
UID numérico e bridge registrados permitem remover regras após uma limpeza parcial
que já tenha apagado o usuário ou a rede. ACLs de workspace/ancestrais são capturadas
e restauradas integralmente, incluindo máscaras.
O inventário final cobre contêineres com labels próprio/histórico, volumes, rede, processos
do teste/relay, UID/home, regras, ACLs e material temporário. Restrições de saída são
mantidas se ainda houver processos ou contêineres vivos.

Transporte SQL continua apenas por docker exec/socket no banco local inspecionado;
HTTP/Auth apenas em 127.0.0.1, sem proxies ou redirects. Nenhum segredo hospedado é
aceito. O UID ainda possui Docker, como no harness histórico: este é ensaio confiável,
não sandbox contra código hostil. Não se afirma impossibilidade absoluta de acesso
externo pelo runner administrativo. O admission guard do relay rejeita configurações
inesperadas; compatibilidade efetiva da CLI com esse guard está NÃO EXECUTADA.

## Matriz preparada — NÃO EXECUTADA

| Teste | Critério futuro |
|---|---|
| Recursos/SHAs/manifest | JSON PASS, limites, árvore limpa, base/Delivery exatos |
| Imagens/isolamento anterior | Seis IDs, digest PG, bridge interna, regras verificadas antes de criar serviços |
| Preimagem | Três hashes, owner, search_path, ACL exatos |
| Helper antes/depois | postgres/anon/authenticated/service_role: preço composto 54 |
| Checkout anon/Auth local real | Quantidade 2, preço 54, total 108; campos persistidos exatos |
| Replay checkout | Resposta idêntica, sem alteração em pedidos/itens/histórico |
| Adição legada | Mais uma linha de 30; campos exatos e total 138 |
| Negativo inicial | Probe NOLOGIN, sem privilégios elevados/memberships; acesso somente via PUBLIC |
| Delta focal | Apenas `=X/postgres` removido, nenhum outro grant/objeto/dado alterado |
| Negativo final | EXECUTE=false, chamada 42501, sem writes; definer_execute=0 no escopo de aplicação |
| Capability/replay | NOT_RUN/BLOCKED na base sem dependências; nunca instalar candidato para viabilizá-lo |
| Cleanup/recovery/audit | Repetição idempotente e todos os domínios limpos; ausência de recibo não é PASS |

Os testes reais de cancelamento, repetição do cleanup e falhas parciais permanecem
NÃO EXECUTADOS. O checkout usado é PICKUP; este ensaio não cobre todo checkout Delivery,
F01, segurança das RPCs legadas, TLS/pooler ou provisionamento de credenciais.

## Publicação e próxima admissão

Template permanece fora de `.github/workflows`. Nenhuma branch foi publicada, PR aberta,
Action/SQL/Docker executado, configuração remota alterada ou custo contratado.
A exclusão exata Vercel foi preparada e conferida estaticamente contra a documentação
oficial; a branch não corresponde às regras true existentes (não há nenhuma).
Os gatilhos versionados foram inspecionados: nenhum push da nova branch seleciona os
workflows ativos. Hooks externos, integrações hospedadas, configuração aplicada e efeito
operacional do primeiro push não foram verificados. Publicação continua dependente de
admissão separada desses pontos; não reutilizar branches históricas.

Execução futura: `python3 -E audits/f02-acl-01/driver.py run`; recuperação `recover`;
auditoria `audit`. Ainda não autorizadas. Ativar o template exige nova decisão, inclusão
exata do workflow na allowlist, reconciliação do manifesto e aprovação de novo SHA.
Não mover o template nem relaxar o guard por iniciativa própria.

Prontidão: candidato para nova revisão estática independente. Operação continua BLOCKED
até admissão e provas reais de imagem, isolamento, testes e cleanup. Capability permanece
limitado às dependências existentes. Runner público padrão é o custo esperado, sem
recursos pagos; elegibilidade/políticas financeiras atuais da conta NÃO VERIFICADAS.

Fontes consultadas para as configurações, sem operação remota:
- https://vercel.com/docs/project-configuration/git-configuration
- https://docs.docker.com/reference/cli/docker/network/create/
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation

# Candidata de admissão hospedada — NÃO AUTORIZADA

Base Master PR51 b8a2087 e Delivery PR44 7ca9376. Nenhuma alteração dos 33 SQLs,
recuperação ou contenção Realtime. Polling preservado. Nenhuma escrita/leitura SQL
remota nesta missão. Reutiliza 40220240520: 14 PASS e instalação/recuperação já
aprovadas. Não repete essa instalação.

## Transporte, sessão e servidor

`session.mjs` abre psql persistente somente após verificar recibo Ed25519 de
escopo SQL_RELEASE, projeto, release, janela e hashes unitários. Destino direto
fixo `db.iefaoaqzltvpfabyeelj.supabase.co:5432`, banco/postgres, TLS verify-full
com raiz do sistema (compatibilidade psql/libpq e conectividade ainda pendentes).
Não usa GUC de laboratório, pool transacional ou Supabase MCP para fingir sessão.
A credencial fica exclusivamente no ambiente do subprocesso, não em argv/log.
PID/backend_start, current/session_user, superuser e relógio são observados na
mesma conexão; guard TEMP persiste por COMMIT, é específico da unidade, hash
aprovado, sessão e expiração. Sem reconexão/retry. Reserva exclusiva antes do envio.
API pode ser importada sem conexões; a fábrica é ação explícita.

Captura exclusiva stdout/stderr antes do parsing, SHA256/releitura, limite
agregado 65.536 bytes por resposta. Colisão, erro, excesso ou timeout bloqueiam.
Um frame stdout não é prova de esvaziamento definitivo do canal stderr; stderr
tardio fora de frame bloqueia a sessão. Captura e recibos locais não são custódia
externa. Timeout termina apenas o cliente; cancelamento SQL/descendentes NÃO
comprovados. Não infere rollback nem confirmação pelo marker/exit. HOLD após
resposta incompleta ou submissão incerta; sem limpeza/recuperação/retry automáticos.
A reserva, inclusive falha, requer decisão explícita antes de outra tentativa.

Delivery: modo `hosted-release` separado de homologation; assinatura escopo
HOSTED_SERVER liga deployment, backend HTTPS exato, domínios canônicos, release e
janela. Verifica antes/depois de cada await e antes de RPC de negócio, inclusive
quota, emissão, checkout, recovery, tracking/amendment. RPC de readiness somente
service_role verifica catálogo/ACL/RLS e contenção. Projeto constante no JSON
isoladamente NÃO autentica destino; depende do vínculo HTTPS e cliente server-only.
O endpoint não é oracle completo nem garante ausência de escritores. Catalog
fingerprints usam evidência nativa anterior; registro atômico deriva do SQL33,
sem alegar oracle independente. Não prova replay de toda migração ou dados saneados.
`34-readiness.pending.sql` é unidade adicional, guardada; não faz corte legado.
O positivo completo de readiness depende do catálogo instalado; neste ensaio
nativo vazio deve retornar false. Não recriar o schema só para repetir aprovação.

HOSTED_TRUST está fechado: chave, hash, política de validade e domínios NULL.
Recibo/env/flag não fornece a própria autoridade. Chaves efêmeras só nos testes.
Sua origem autenticada, política aprovada e revisão são pré-condições externas.
O port genérico/test trust são interfaces internas de engenharia, não superfície
remota confiável: chamador operacional deve fixar trust em código revisado e
exclusivamente usar a fábrica TLS. Nenhum entrypoint operacional foi ativado.

## Configuração órfã e quatro configurações

Recibos anteriores identificaram a órfã Calos Barbearia e inconsistência entre
organização CANCELLED/active e contrato ACTIVE/SIGNED + assinatura TRIAL.
Não se altera nenhum desses estados; decisão administrativa separada.
Procedimento candidato: capturar registro integral/colunas/constraints/hash e
vínculos atuais; bloquear concorrência na janela aprovada; copiar JSON integral
para escrow privado com RLS/ACL fechadas, fonte/hash/decisão; verificar releitura
e cópia externa antes de retirar exclusivamente a configuração da tabela ativa,
na mesma transação. Não excluir dados sem retenção, nem reassociar à pizzaria.
Inverso antes do cutover: restaurar a mesma linha verificando hash/schema/chave
livre; após mudança estrutural, HOLD e conversão revisada, nunca replay cego.
Este fluxo e inverso já foram ensaiados com fixture no run40220240520.
Nenhuma decisão de segregação remota foi preenchida ou executada aqui.

Para cada uma das quatro configurações válidas, preencher explicitamente o
modelo `operational-input.template.json`, usando o mapa nominal privado dos
recibos anteriores. Não publicar IDs de clientes/operadores. As quatro exigem
uma decisão de ativar ou manter fechado; BARBER e PROVISIONING não viram lojas
Delivery por inferência. Para ativação: usuário Auth existente verificado,
role aprovado por instância e vínculo organizacional. Staff global exige
vínculo ativo verificado, AAL2 e concessão explícita por instância; o papel
global não substitui vínculo. Preencher IANA timezone, sete dias (fechado ou
intervalos), habilitação e exceções explicitamente. Nenhum default UTC/24h.
`inputs.mjs` valida preparação; não cria membros nem grava disponibilidade.
Exceções permanecem dados a revisar (validação estrutural completa pendente);
validação não substitui aprovação humana ou prova de horários verdadeiros.

## Únicos acréscimos necessários à recuperação hospedada

1. Revalidar sessão TLS/destino/relógio e autorização atual, sem reaproveitar
   sessão/grant de teste; observar preimagem/catalog/ACL e hash da órfã atuais.
2. Preservar resposta e confirmar cópia externa recuperável antes de cada
   decisão irreversível; preservar estados intermediários dos COMMITs originais.
3. Após falha: HOLD; observar de sessão independente autorizada o estado real,
   locks, backend ativo e efeitos persistidos. Cliente encerrado não é cancelamento.
4. Somente com classificação independente do estado aplicar o roll-forward
   ensaiado/hashes aprovados; não restaurar permissões legadas inseguras.

## Pendências para autorização

Administrativas: decisão nominal de retenção segregada; conflito comercial da
órfã separado; operadores/horários/ativação das quatro; custódia externa e prova
de recuperação; chave/política autenticadas; janela, responsável, custos/HOLD e
aprovação específica SQL_RELEASE; aprovação HOSTED_SERVER/publicação separada.
Técnicas: TLS/rota/libpq hospedados ainda NOT RUN; mecanismo de cancelamento no
servidor não demonstrado; catálogo/dados atuais e quiescência precisam observação
na futura janela; readiness positiva após catálogo completo e vínculo real do
servidor precisam evidência. Nenhuma aprovação de código equivale a isso.
Legadas continuam sem corte. Consumidores externos desconhecidos não desapareceram.
Comercial NÃO LIBERADO. Não há deploy/merge/corte autorizado.

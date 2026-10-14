# Reprodução — 02A.3

Não executar em backend remoto. Não usar secrets comerciais. Os resultados não autorizam produção.

## Backend

O código e as fixtures estão na PR draft Master #40. Cada run é identificado no relatório por SHA exato. Para reproduzir, criar checkout isolado desse SHA em runner descartável e executar os passos do workflow `.github/workflows/mission-02a3-isolation.yml` daquele commit. Não trocar apenas o SQL ou combinar perfis. O workflow inclui preflight, instalação, Auth real, firewall de runtime e descarte. O workflow é acionado por push da branch isolada; não alterar main/base para forçar CI.

- Matriz e escrita proibida: commit ca9310e5a28d32e1271d91af74700f6c91741657, run38621636857.
- RPCs: d04dcf9ab23c15e41039658d74df2ddd7528ea34, run38623751297.
- Legado com corpos adiados: de35b499e75c2c4fd724785a54de0da4fecc56ec, run38620164304. Replay normal: 673dc84101b25a101b95269b869a60e0bad15516.
- Realtime incompleto: b7f3e20eebdd77a116d87de35fdcb6d788420bc7, run38621152498; não é matriz aprovada.

Usar `npm ci --ignore-scripts --no-audit --no-fund`, Node22.23.0, CLI2.120.0 e comparar os IDs das seis imagens com os summaries. Interromper se drift. O CLI instala dependências transitivas por resolução do registry; não afirmar reprodução byte a byte dessa instalação. O package-lock principal e commits das actions estão fixados. Perfis dependem do catálogo estrutural/19 predecessores do manifesto02A2, e 31 migrations Delivery verificadas no manifesto derivado. Fontes de ambos estão em `reproduction/` no pacote.

Identidades vêm do Auth local, com TOTP real para staff. Nunca substituir JWT por service_role. `run.mjs` contém fixtures e snapshots de todas as tabelas public e storage buckets/objects antes/depois. Os logs são recuperáveis pelos run/job IDs sem publicar tokens. `extract-evidence.py` recompõe JSON/CSV a partir de `evidence/run*.log`; os CSV representam somente run7. As avaliações semânticas discriminam raw FAIL por HTTP, Realtime sem controle positivo e append bloqueado por loja fechada.

## Navegador

Checkout Delivery ad41822e4622e3b14bcb650d7be84126f78b80f6. Instalação frozen Bun do lock do projeto, app Node22.23.0. Controller Playwright-core1.58.2, Chromium154.0.8037.57. Dependências e hashes em browser-environment.json. `browser.mjs` e `deny-egress.cjs` registram harness e guarda. Adaptar somente caminhos locais, preservando rede loopback, variáveis fictícias e retirada de .env; restaurar .env após o ensaio sem expor seu conteúdo. Comando efetivo do servidor está em browser.mjs; browser-command.log registra as etapas e o resultado. Trace e screenshots em evidence. Não usar backend comercial para obter login; teste comprova somente contenção e navegação/hidratação.

## Verificação dos arquivos

`SHA256SUMS.json` cobre o pacote inteiro salvo o próprio manifesto. Antes de reproduzir, calcular SHA256 e comparar. Não há dumps, status.private.env, tokens JWT de sessão nem arquivos .env no pacote. Dados e IDs são fictícios. O ensaio destrutivo/descarte limita-se ao projeto descartável e SDKs de VM descartável com guardas explícitas.

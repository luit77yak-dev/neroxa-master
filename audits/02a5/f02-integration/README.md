# F02 — Ensaio isolado Chromium + Supabase real (pré-gate)

**Coordenação:** AVANÇAR COM RESTRIÇÕES, somente dados sintéticos, sem merge/deploy/DNS/SQL remoto/gastos. Master entrada `e27b59db1dc97298767d711011bbedc7ffd55243`, Delivery fixado `011275488660bfa1a9271b3e4c92e457f7638e34`.

Novo workflow `.github/workflows/mission-02a5-f02-browser.yml` reusa a bootstrap Auth/PostgREST/PostgreSQL/Storage/Realtime e a sequência SQL exata (6 arquivos + manifests) já validada no [run 38785111675](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38785111675), em clone novo e separado. O candidato Delivery é instalado com `bun.lock --frozen-lockfile --ignore-scripts` e compilado normalmente em modo homologation apenas contra o serviço nativo loopback. Chromium não recebe credenciais de serviço; testa a versão compilada TanStack por domínio `a.synthetic.invalid`.

**Escopo inicial intencional:** confirmar compilação SSR, ausência de segredo no bundle público, catálogo nativo via PostgREST, hidratação real da loja A e negação de caminhos legados originados pelo browser. Checkout **envio**, emissão real de tokens **pelo browser**, acompanhamento privado e complementos **continuam NOT RUN** até instrumentação seguinte; não inferir de RPC/HTTP unitários. Storage/Reatime/logout integrados igualmente NOT RUN.

O runner utiliza usuário de teste isolado com bloqueio de egress externo, SSL sintético local, nenhuma variável remota e cleanup dos seis serviços. Nenhum screenshot, token, dump ou artefato privado é enviado ao GitHub. Falhas de montagem/hidratação exigem FAIL; não são homologação nem autorização para gate.

**F01/F02: OPEN**, duas falhas P0 preservadas, **gate BLOCKED, pós-gate NOT RUN, Marco 01 0/7, comercial NÃO LIBERADO**. O browser é um incremento da matriz, não equivalência automática SEC/PG nem certificado de produção.

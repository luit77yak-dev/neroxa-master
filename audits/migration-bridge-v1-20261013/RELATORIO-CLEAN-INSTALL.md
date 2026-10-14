# Clean install — PASS restrito

Workflow https://github.com/luit77yak-dev/pizza-perfect-plate/actions/runs/38490640042, job115614732353 SUCCESS; cleanup SUCCESS.
Runtime Master e5184d2dbda707036f25a0492578aa480a0cca82 / Delivery35e844c48ad41ce82141abfb7beb502e565930ab.
CLI2.120.0, PostgreSQL17.11/image17.11.0.004, Node22.23.3, GoTrue2.197.0, PostgREST16.4. Stack nativa PG/Auth/REST/API gateway; não certifica Storage, Realtime, Edge, Studio ou todos serviços hospedados.

Banco vazio → catálogo histórico COMPLETO34 relações/50 funções/99 policies →25 candidatos pinados → matrizes → build normal/browser → gate E. O builder é usado somente neste banco vazio, nunca no upgrade. Não equivale a recuperação do CREATE histórico original nem ao schema atual de produção.

| Conjunto reexecutado neste job                | PASS                  |
| --------------------------------------------- | --------------------- |
| Auth/RLS, gateway, capabilities, GROUP, HTTPS | 493 (275+54+43+65+56) |
| H03/H04                                       | 40                    |
| Operações/expiração/reconciliação             | 24                    |
| Backend negativo/builds inválidos             | 19                    |
| Browser histórico separado                    | 21                    |
| Normal build Node/Nitro + Chromium            | 77                    |
| Pós-cutover ACL/Auth scoped                   | 11                    |

Entrega browser: unidade42 ×2 =subtotal84, fee7, total91, snapshot GROUP v2, persistência única, painel Auth e tracking até DELIVERED. Resoluções360/390/412/768/1440. Sem alias de SDK/h03.isolated.fixture.ts/vite.h03.config.ts. Google Fonts foi abortado; nenhum backend de produção liberado. Não foi teste em celular físico.

E retira PUBLIC EXECUTE e privilégios TRUNCATE/REFERENCES/TRIGGER/MAINTAIN de clientes, fecha phone-only tracking somente após substitutos executados. Grants explícitos de catálogo anon e leitura Auth continuam positivos; cross-store continua0; digests orders/items/history permanecem iguais após gate.

Alguns relatórios antigos mantêm classification INCONCLUSIVO para o escopo global/comercial; todas493 assertions individuais estão PASS. Não reclassificar isso como certificação de produção. Logs/artifacts/hashes no EVIDENCIAS-PONTE.json. Instalação remota continua NO-GO.

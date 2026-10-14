# Backup/restauração independente — PASS restrito

Workflow: https://github.com/luit77yak-dev/pizza-perfect-plate/actions/runs/38512737541 — SUCCESS, job115684698047 e cleanup SUCCESS. Par runtime: Master 1704dc590202d9c9b25b764683fbf74127a78635 / Delivery c18d6803b319de442d5dfb2ed1d58fb367df096d.

Dois clusters foram efetivamente inicializados: system identifiers 7696379351125323813 e 7696380490054172709, volumes supabase_db_neroxa-ab-38512737541 e supabase_db_neroxa-ab-385127375411, redes diferentes e binds loopback. Não são dois bancos no mesmo cluster. Compartilharam apenas runner e imagens.

Supabase CLI2.120.0, PostgreSQL17.11.0.004 (cliente/server17.11), Nodev22.23.3, GoTruesupabase/gotrue:v2.197.0, RESTpostgrest/postgrest:v16.4, Playwright1.58.2/Chromium emulado. Sem recursos contratados; GitHub Actions descartável, não projeto hospedado adicional.

Archive custom privado: 701751 bytes, SHA256 `3615bc36502f5c33b6ed60707cc18825066cff7b3d108b7b65b26d812205ed0b`, TOC1088 entries. Transporte base64 protege o fluxo Docker, com SHA em SOURCE, runner e TARGET. O archive restaurou em template0 no cluster independente sem sobrepor schemas da base de bootstrap. Owners/ACL incluídos, suplemento de ACL de membros de extensões aplicado. Role mapping nativo estrito, sem alteração de roles gerenciadas. Dumps/segredos removidos no cleanup; não estão em artifacts/Git.

183 checks de restore PASS. Catálogo: schemas/owners, relações/ACL/RLS, colunas/defaults, policies/expressões, triggers, constraints, índices, funções e extensões. Propriedades adicionais: corpos/assinaturas/configs de funções, default privileges, ACL por coluna, enums/owners/tipos, event triggers, memberships/roles e sequências. Todas as tabelas e valores de sequências comparados por digest, não somente contagem. 74 FKs sem órfãos.

| Fingerprint  | SOURCE = TARGET                                                    |
| ------------ | ------------------------------------------------------------------ |
| Dados        | `5291164174489a61b82d486c3953fe5397cd583e042e1379a0e21a67d9f94254` |
| Catálogo     | `681a7a33634d414e1b1af3873cd8ab2f527e3d146eb7e9a22f8fc7630613ac51` |
| Propriedades | `0ee2b5856847e375f25d7a3ec7188569de63de36fc8fde9d5d12307960960a24` |

O conjunto legado 3 pedidos/6 itens/12 eventos manteve IDs, vínculos, valores, formatos half/id-only e status. Não reinterpretamos os UUIDs nem criamos capabilities históricas. GROUP/intents/hashes/leases e operações de append foram restaurados; retry não duplica pedidos/itens/histórico, divergência de payload e cruzamento de instância são rejeitados, NOT_SETTLED preservado.

## Execuções novas

Source:493 checks integrados +40 H03/H04 +24 operacionais +19 backend +21 browser antigo +78 build normal +57 preparação +37 cutover. TARGET:183 restore +11 negativos +78 browser build normal +11 T0/T1. Source e TARGET usam build normal sem aliasSDK. Os78 incluem os77 casos prévios e uma asserção nova de identidade única do card operacional. Alguns JSON anteriores mantêm INCONCLUSIVO para aprovação comercial ampla; todos os checks individuais desses escopos passaram.

Local:101 Node Delivery,33 testes Master,13 pacote ponte e12 contratos recovery; lint direcionado/format/diff-check aprovados. Build Master/Delivery e TypeScript Delivery aprovados. Master mantém43 erros TypeScript preexistentes; não alteramos src nem os mascaramos. Delivery não tem npm test: utilizamos node --experimental-strip-types --test tests/*.test.mjs. Lint global legado não foi reclassificado como aprovado.

## Medições do ensaio

- Startup SOURCE77s (inclui downloads); TARGET28s (imagens compartilhadas).
- Dump121ms; transferência SOURCE→runner40ms; restore263ms. A transferência runner→TARGET foi verificada por hash, mas não temporizada separadamente.
- Auth/bootstrap até primeiro read autorizado1544ms; fase restore/Auth/expiração39s; navegador operacional TARGET64s.
- Expiração TARGET observada em34s, HTTP401/PGRST303; leeway não foi reduzido.
- Pico amostrado de disco do runner69010034688 bytes; mínima memória disponível13454196736 bytes, amostragem5s. Não é pico exclusivo por processo. Preflight mediu4 CPUs, espaço/memória suficientes para duas stacks.

Não são garantias comerciais de RTO/RPO. Não validamos perda de região/runner, blobs Storage, MFA completa, credenciais SQL customizadas nem consumers hosted.

## Falhas e correções rastreáveis

1. Run38497008138: gate JWT falhou após restore/digests corretos. NativeCLI possui EC default compartilhada; trocar só jwt_secret é insuficiente. Status HTTP da primeira falha não foi capturado, não alegamos resposta não registrada.
2. Run38497951227: tentativa diagnóstica de verificar JWT ES256 como HMAC falhou. Investigação do códigoCLI confirmou o par EC constante. Commit7ede159 gerou EC por stack e verificação de assinatura apropriada; usuário SOURCE não autentica TARGET.
3. Run38498900742:183 ainda não,177 checks de restore/Auth e11 negativos PASS, browser não iniciou por TLS ausente TARGET. Commit44bc737 gerou TLS privado próprio e reutilizou adicional restaurado para evitar duplicação da fixture.
4. Run38509952554:178 restore +11 negativos PASS; browser chegou a39 checks e ao pedido persistido, mas seletor por nome fictício duplicado era ambíguo. Corrigimos usando número autoritativo, mantendo negativas amplas de vazamento.
5. Run38510981600: erro de escape introduzido no seletor regex; source browser parou. Commitde0fbe3 adotou texto DOM exato e regressão local.
6. Run38511578548: navegador TARGET avançou por painel/transições/reconciliação, depois faltou expired.identity.private.json. Commit1704dc5 passou a emitir identidade expirada pela Auth TARGET — copiar JWT SOURCE não seria prova de expiração TARGET.
7. Run38512737541: execução completa SUCCESS com183/11/78/11 no destino e cleanup aprovado.

Nenhum candidato SQL da Engine, migration automática ou src comercial foi alterado. Testes/framework e configurações locais de CI foram corrigidos em audit/independent-recovery-v1-20261014; branches anteriores/main/PRs originais preservadas.

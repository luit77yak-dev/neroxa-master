# Reprodução 02A.4

Somente VM descartável, backend loopback/bridge e dados fictícios. Não executar estes candidatos em banco remoto. Runners padrão GitHub-hosted de repositórios públicos, elegibilidade verificada no workflow e documentação oficial de cobrança capturada; sem larger runner, cache persistente ou artifact upload.

1. Checkout do SHA/run exato da tabela do relatório, sem .env/project-ref. Ler AGENTS.md.
2. Workflow `.github/workflows/mission-02a3-isolation.yml` daquele SHA contém instalação, preflight e descarte. Instalação de registry/GitHub ocorre antes do firewall; runtime host e bridge negam saída externa. TEST-NET-2 verifica recusa. Nenhuma credencial comercial.
3. Node22.23.0, CLI2.120.0, npm ci --ignore-scripts --no-audit --no-fund, actions por SHA. Comparar IDs das seis imagens do summary e interromper se drift. A resolução transitiva do CLI não é lockfile byte a byte; guardar IDs executados e fixar pacote/lock de tooling antes de uma certificação de reprodução bit a bit.
4. M: catálogo histórico estrutural e19 predecessores do MANIFEST02A2, candidato scoped02A2 com hash original648fcca5bdac67ba3879c0804189b204a53fc4f3b136646407b659ca5a62f23c. Cada PR adiciona somente os arquivos/ordem do próprio MANIFEST02A4. Tracking e Storage são perfis independentes; não inferir resultado de um perfil combinado inexistente.
5. L: source Delivery #41 fixada,31 migrations por LEGACY-MANIFEST, bodies validados normalmente. Não importar neroxa_* de M. O UPDATE histórico de imagens roda sobre tabelas de produtos vazias. Fixtures vêm depois. Não usar `check_function_bodies=off`.
6. Auth cria seis usuários reais fictícios, TOTP AAL2 nos staffs. Usuários comuns/admin usam os próprios JWTs. Service somente bootstrap e chamadas explicitamente marcadas backend_gateway do contrato server-only; nunca como usuário Auth comum. Tokens são mascarados nos logs e não são persistidos no pacote.
7. Logs brutos dos jobs via GitHub e `extract-evidence.py` reconstroem checks/summaries/CSVs separados por execução. Não somar runs ou reinterpretar resultados antigos. Snapshots do primeiro harness abrangem public e Storage buckets/objects; segunda revisão tracking inclui private e invalida cache após criar a tabela. Isso distingue registro legítimo de efeitos indiretos nas negativas.
8. `SHA256SUMS.json` cobre todos os arquivos do pacote salvo si mesmo. Logs/fixtures/SQLs/fontes de reprodução ficam no pacote; summaries e relatório compactos nas PRs. Nenhum dump comercial, JWT de sessão, arquivo .env ou URL assinada deve ser incluído.

Não tomar cancelamento do job como conclusão de todas as etapas: conferir casos efetivamente registrados e resumo. Realtime sem evento positivo deixa negativo/revogação/logout BLOCKED. Atomicidade de transação não é restore T1 nem rollback pós-commit; não recuperar serviço restaurando grants inseguros.

Últimos ensaios: run38647381181/SHA4f95a332cda60c4d24e0329b8df93ffec811c9fd para lotes M e L; fonte L a99a7d743f9dbed8ece5d8b0880c4b9c543960c3. HEAD posterior de Master43 é somente diagnóstico Realtime; usar os commits fixados para repetir os lotes, não presumir que o workflow de HEAD executa tudo.

Sucessor sessão ativa: Master45 SHAa189d67f1ea49dd4e2ac14679c9bbf9cbb16e1a0/run38650424558. Reproduction/session contém overlay, manifestos, cinco lotes e SQL com sessão real. Slots/frames são capturados, sem JWTs. `verify-realtime-proof.py evidence/session-realtime-summary.json` verifica por tópico o controleB e o JWT antigoA. Não combinar F02/L sem manifesto e ensaio próprios.

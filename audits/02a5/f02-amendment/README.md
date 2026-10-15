# F02 — candidato amendment em clone descartável

Fonte Master de entrada a405961b3c15bfa52a50b8c54b89831e1a08329e: único drift desde 12567f0 foi a decisão documental, lida antes de qualquer alteração. Fonte Delivery fixada 011275488660bfa1a9271b3e4c92e457f7638e34 (126 Node/build/tsc/lint locais PASS).

Executar exclusivamente workflow público GitHub-hosted padrão. Foundation manifesto BUYER-PRE-GATE + catalog/19 predecessors, depois três SQLs originais do AMENDMENT-MANIFEST na ordem, depois amendment-history.candidate.sql. Não concatenar migrations Delivery; não editar originais. Os hashes e precondição prosrc do quarto overlay são registrados no manifesto específico. Profile não equivale ao release integrado.

O ensaio repete leitura e escrita anônimas como FAIL P0 antes de instalar amendment. Depois usa a mesma factory de backend do endpoint, Auth/REST nativos, service_role somente no servidor/fixture e identidade real Auth nos acessos diretos. HTTP tem edge canônico simulado loopback e dados sintéticos. Não é E2E TanStack hidratado.

SEC-01..SEC-18 são uma PROPOSTA provisória de mapeamento: a missão cita IDs sem seus critérios integrais. Foi solicitada a origem oficial; não afirmar aceitação desses critérios sem reconciliação. Detalhes reais são emitidos por operação, com digests e exceção documentada de contadores de quota. Não confundir a quota esperada com integridade dos dados de negócio.

01 leitura por telefone (FAIL P0); 02 escrita por telefone (FAIL P0); 03 ACL direta da RPC/registro; 04 alteração legítima/preço/NOT_SETTLED/histórico; 05 retry idêntico; 06 concorrência; 07 chave conflitante; 08/09 A→B/C; 10 token ausente/falso; 11 expirado/revogado; 12 separação tracking/amendment; 13 produtos/categoria/addons cruzados; 14 quantidade inválida; 15 loja fechada/pedido PREPARING; 16 complementos e histórico; 17 Host/Origin/proxy/quota; 18 gate e reversão pós-gate BLOCKED.

Flags do produto seguem desligadas por padrão; novo runtime nega ativação fora da configuração local descartável. Capabilities distintas de 32 bytes, emitidas uma vez e mantidas somente na memória do browser. Recarregar perde acesso e exige suporte; não implementar recuperação por telefone.

Gate oficial BLOCKED e pós-gate NOT RUN: consumidores/owners/versões/bindings desconhecidos. Não produzir CONSUMER-DISABLEMENT, não forçar GUC, não executar SQL de quarentena. Os overloads text/enum e wrapper legado continuam inventariados, sem revogação nem correção declarada por ausência de overload. Defaults globais do Master não são alterados para evitar impacto comercial não validado. Verificar ACL efetiva das funções novas no clone; incompatibilidade antiga permanece bloqueio de cutover.

Recuperação segura desta execução: antes de completar cada overlay, rollback de sua transação no próprio clone em erro; entre unidades já commitadas, descartar o clone e reconstruir o perfil exato. Nenhum inverso restaura grants inseguros ou StaffPanel. Cleanup obrigatório em todos os resultados.

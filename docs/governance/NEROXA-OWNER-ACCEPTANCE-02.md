# NEROXA — governança com aprovador único

Data: 22/11/2026.
Responsável: Luiz, fundador e proprietário, conforme declaração nesta conversa.

## Aceite registrado

Declaração do proprietário: “Sim, vamos seguir um modelo de aceite único meu, eu me responsabilizo por tudo”.

O proprietário escolheu um modelo de governança em que é o único aprovador humano das decisões internas, incluindo operações críticas. A exigência de segundo revisor humano deixa de ser a regra interna pretendida para a proposta futura. A decisão supersede a recomendação anterior de modelo híbrido quanto à necessidade interna de outro aprovador, sem apagar o parecer anterior ou suas ressalvas.

Este registro é evidência da decisão expressa na conversa. Não é assinatura Ed25519, grant operacional, prova de identidade civil ou garantia de que obrigações externas foram dispensadas. Não atribui ao proprietário renúncia de direitos ou responsabilidade jurídica irrestrita. Obrigações contratuais, regulatórias ou de terceiros, se aplicáveis, continuam sujeitas à verificação.

## Escopo do aceite

Adotar o fundador como aprovador único não é autorizar agora toda migração, deploy, mudança de segurança, exposição pública ou operação financeira. Cada operação continua dependente de escopo concreto, autorização específica, evidência técnica e recuperação proporcionais ao risco.

Uma autorização pode abranger uma sequência delimitada com gates objetivos; não será exigida confirmação redundante para cada passo já autorizado. Alteração de escopo, efeitos irreversíveis não previstos e exigências do canal utilizado continuam sujeitos às regras aplicáveis.

## Matriz substitutiva

| Operação | Aprovador | Requisitos preservados |
|---|---|---|
| Leitura e preparação local | Fundador, com delegação ao Work | Escopo existente, sem segredos ou escrita remota |
| F02 somente leitura | Fundador | Política nominal, assinatura real, commit/ref/runId/Environment, privilégio mínimo, TLS e recibos |
| SQL comercial, ACL e RLS | Fundador | Delta exato, pré-condições, consumidores, autorização SQL distinta, recuperação e verificações reais |
| E2E LAB e alterações temporárias | Fundador | Ambiente existente, dados descartáveis, Access, isolamento e rollback admitido |
| Mudança de autoridade ou controles | Fundador | Diff explícito, análise de risco, autorização específica da mudança, validação e reversão |
| Deploy/DNS/URLs/GO comercial | Fundador | Gates técnicos completos, autorização de publicação distinta e janela definida |
| Incidente e recuperação | Fundador ou mecanismo previamente autorizado | Alvo identificado, menor ação necessária e confirmação do estado real |

## Controles obrigatórios

- Privada Ed25519 cifrada e sob custódia do fundador no Termux, nunca no Work, chat, repositório ou artifacts.
- Autoridade pública pinada; assinatura positiva legítima ainda pendente. Negativos anteriores reaproveitados, sem inventar grants.
- Autorizações vinculadas a operação, projeto, versão/commit, ref, Environment, operador e runId reais; nonce, prazo e primeira tentativa quando aplicáveis.
- Validade proposta do grant F02 até900000ms; duração operacional até120000ms. Aceitar governança não altera esses limites.
- Aprovação do proprietário registrada explicitamente; auditoria técnica automatizada identificada como automatizada, nunca como revisão humana independente.
- Privilégio mínimo, transporte validado, ausência de segredos em logs, histórico versionado, evidências sanitizadas e mecanismo de recuperação.
- Os riscos de erro do proprietário, coerção, comprometimento simultâneo, auditoria defeituosa e perda do único custodiante permanecem. A aceitação não os elimina nem converte ausência de teste em PASS.

## Implementação separada

A decisão de governança está registrada. Os controles efetivos do GitHub permanecem no estado anterior. Os diffs propostos anteriormente precisam ser consolidados para esse modelo e apresentados como uma mudança concreta antes de qualquer alteração remota.

Required reviewers pode continuar exigindo aprovação explícita do proprietário; a futura configuração de autoaprovação/ator e o tratamento de bypass devem ser definidos pelo diff específico. Não usar duas contas do mesmo fundador para alegar segregação humana.

Não foi modificada a política CLOSED, o Environment, branch protection, secrets, workflow, banco ou infraestrutura. Nenhum grant foi assinado/provisionado, nenhuma execução foi disparada.

GOVERNANCE_OWNER_DECISION=RECORDED
GOVERNANCE_MODEL=SOLE_OWNER_APPROVER
REMOTE_CONTROLS_IMPLEMENTED=NO
REMOTE_WRITES=NONE
IMPLEMENTATION=READY_LOCAL
F02=CLOSED
PUBLIC_CHECKOUT=OFF
COMERCIAL=NO-GO

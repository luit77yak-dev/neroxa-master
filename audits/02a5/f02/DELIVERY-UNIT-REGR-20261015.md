# NEROXA — verificação executável da fonte Delivery PR42 (15/10/2026)

**Alvo:** `011275488660bfa1a9271b3e4c92e457f7638e34` (Delivery PR42 draft).
Novo workflow `.github/workflows/mission-02a5-delivery-unit.yml`: executa sete suites Node do candidato *exatamente* fixado, em runner público padrão, dependências do lockfile e sem hooks; não disponibiliza backend de produção nem variáveis comerciais.

- Inclui proteção do checkout sem fallback por telefone, regresso de capability tracking e amendment, validação de configuração local/backend, contratos HTTPS, negativas de entrada e isolamento em testes **unitários**.
- O workflow **não** executa SQL, não inicia Supabase, não garante E2E real em TanStack/Chromium, nem as identidades A/B/C de Auth em banco.
- **Gate BLOCKED, pós-gate NOT RUN, F01/F02 abertos, Marco 01 0/7, comercial NÃO LIBERADO**. O CI só pode concluir sucesso no escopo dos testes unitários.
- Se um teste falhar, preservar logs e SHA e tratar como regressão até ser compreendida a causa; não alterar critérios para aprovar artificialmente.
- Próxima fase maior: clone PostgreSQL/Supabase Auth/Storage/Realtime reais + browser TanStack com tokens e digest financeiro. O script `tools/ab-auth/first_order_browser.mjs` existente pode servir de referência, mas exige reconciliação de fixtures e da diferença entre perfil histórico Master e candidato novo; **não** é possível atribuir seus PASS históricos ao SHA atual.

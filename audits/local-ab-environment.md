# Ambiente local descartável — matriz A/B (não executado)

Este procedimento **não conecta ao Master de produção**. Execute somente em uma máquina com Docker Engine/Compose, Node.js 22 e Supabase CLI instalados. Não use `supabase link`, `db pull` nem credenciais de produção nesta preparação.

## Inicialização

1. Faça checkout da branch `audit/store-isolation-candidate-20261011` em um diretório temporário.
2. Confira `supabase --version` e `supabase start --help`. Verifique a compatibilidade da CLI e das imagens com a versão do PostgreSQL do Master antes de iniciar.
3. Execute `supabase start` para subir Postgres, Auth e serviços locais. Guarde a URL e as chaves **locais** mostradas pela CLI; nunca copie chaves de produção.
4. Use um dump **somente de estrutura, revisado e sem dados de clientes**, das tabelas, enums, funções, policies, triggers e dependências do Master. O `supabase/config.toml` existente não identifica o projeto Master conectado: não trate as migrations do repositório como prova de equivalência do schema.
5. Importe essa estrutura para o Postgres local após validar dependências e ownership. Confira os papéis `anon`, `authenticated`, `authenticator` e as funções `auth.uid()`/`auth.jwt()`. **Não** use sessões de superusuário para asserções RLS.
6. Execute os candidatos SQL na ordem validada: membership, migração settings/zones fase 1, backfill, guards de integridade, policies, RPCs, fase 2. Essa ordem é um ponto de partida e deve ser ajustada conforme as dependências verificadas; interrompa diante de qualquer erro, sem `CASCADE`.
7. Crie uma organização O, instâncias A e B e usuários de teste em Supabase Auth local. Conceda vínculos de organização e vínculos de instância diferentes a operadores A e B, e um administrador Neroxa com MFA de teste válido.
8. Execute chamadas HTTP à API REST/RPC com JWTs **emitidos pelo Auth local** (não apenas `SET ROLE`). Cubra SELECT, INSERT, UPDATE, DELETE, categorias cruzadas, settings/zones, pedidos, RPCs e tentativas de transferência de tenant. Compare respostas e estado persistido.
9. Registre resultados com status, identidade, instância, SQLSTATE/HTTP, evidência e rollback. Destrua o ambiente com `supabase stop --no-backup` **apenas depois de conferir o projeto/diretório local**.

## Gates obrigatórios

- O operador A opera em A e recebe negação em B; operador B simétrico.
- Usuário sem vínculo e anon não conseguem operações privadas.
- Admin Neroxa autorizado consegue operações permitidas; MFA e papel verificados.
- Categoria de B em produto de A e mudança de tenant são rejeitadas.
- Catálogo, precificação, pedidos e RPCs permanecem isolados.
- Policies legadas permissivas não oferecem caminhos alternativos.
- Lint, testes e build passam no CI.
- Nenhum resultado será marcado como **PASSOU** antes da execução e coleta de evidências.

## Bloqueios atuais

- O ambiente de execução do assistente não tem PostgreSQL, Docker ou Supabase CLI, e a resolução DNS do registro de pacotes falhou.
- Não há cópia isolada verificada do schema Master nem JWTs locais emitidos.
- Os scripts candidatos ainda precisam de checagem de dependências e de ordem de cutover.
- **Não aplicar em produção.**

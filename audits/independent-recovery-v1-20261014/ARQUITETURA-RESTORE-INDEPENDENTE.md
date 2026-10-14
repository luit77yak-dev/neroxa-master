# Recuperação independente V1 — arquitetura candidata

Escopo: núcleo operacional da Ponte V1, projeção de 16 tabelas próprias acrescida dos objetos candidatos e dependências nativas de PostgreSQL/Auth. Não substitui o Master comercial completo nem homologa Supabase hospedado, Storage/blobs ou todos os recursos de MFA.

SOURCE e TARGET são dois projetos CLI locais distintos, no mesmo runner gratuito descartável. Cada um inicializa seu próprio contêiner PostgreSQL 17.11.0.004, volume, rede bridge com binds loopback, GoTrue e PostgREST. Imagens compartilhadas não implicam dados compartilhados. O ensaio exige identificadores de sistema PostgreSQL diferentes, mounts diferentes e redes diferentes.

A TARGET inicializa primeiro o bootstrap nativo Supabase. As roles e memberships são comparadas por nome e atributos, sem senha, antes do restore. Não importamos pg_dumpall de roles, não alteramos roles gerenciadas, não concedemos novos superuser/BYPASSRLS. A identidade entre nomes é um mapeamento estrito específico a esta mesma versão descartável; um ambiente hospedado requer outro preflight e executor aprovado.

O archive completo fictício entra numa base vazia template0 na TARGET, separada de sua base de bootstrap. Esse banco reside no cluster TARGET e possui referências Auth próprias restauradas. Não sobrepomos schemas gerenciados de uma base já inicializada. pg_restore aplica owners e ACLs em transação com exit-on-error; um suplemento de ACLs de membros de extensões preserva metadados omitidos pelo pg_dump. O executor supabase_admin já existe no bootstrap local; seus atributos não são modificados.

GoTrue e PostgREST restaurados usam configurações originadas exclusivamente na TARGET, com database path apontando para o banco recuperado. Chaves JWT/API da TARGET são sintéticas e distintas. A CLI 2.120.0 traz uma chave EC padrão compartilhada: configurar somente jwt_secret não basta. O ensaio gera EC P-256 privada por stack, registra signing_keys_path privado e assina as API keys com sua respectiva chave EC. Verifica criptograficamente JWT SOURCE contra ambas as chaves e JWT TARGET contra ambas. Nenhuma chave privada é incluída no archive de dados ou artifacts. Um adapter HTTP local de teste liga /auth/v1 e /rest/v1 aos dois serviços restaurados; não é substituto de um gateway hosted comercial. A build normal do Delivery usa local-disposable explicitamente, sem alias artificial de SDK.

O backup passa pelo runner: base64 no transporte Docker evita corrupção de fluxos binários; o arquivo decodificado permanece privado (0600). SHA256 é verificado no contêiner SOURCE, no runner e no contêiner TARGET. Nenhum dump, arquivo de senha, JWT ou perfil de navegador é artifact.

Antes do backup, um gate de testes congela escritas nas tabelas operacionais públicas/privadas e Auth/REST SOURCE são parados. Não é uma implementação de maintenance mode de produção. TARGET permanece congelada até comparações; sua liberação é explícita. Os snapshots e hashes são comparados antes de logins gerarem novas sessions Auth.

Independência comprovada não equivale a recuperação em região/provedor diferente: ambos os clusters compartilham o runner e sua infraestrutura. O archive privado no runner não é backup comercial durável.

# NEROXA V1 | Session pooler comercial: TLS validado (20/11/2026)

**Escopo:** sonda de rede sem credenciais; não é preflight PostgreSQL autenticado, instalação SQL, publicação nem autorização de operação comercial.

## Parâmetros fornecidos pelo proprietário

- Projeto comercial: neroxa-solutions-hub / iefaoaqzltvpfabyeelj, região us-east-1, ACTIVE_HEALTHY.
- Session pooler: aws-0-us-east-1.pooler.supabase.com, porta 5432, banco postgres.
- Usuário indicado: postgres.iefaoaqzltvpfabyeelj. **Não usado para autenticar**; não substitui a role de preflight dedicada e sem privilégios.

## Resultado real

GitHub Actions: https://github.com/luit77yak-dev/neroxa-master/actions/runs/44795571740
Commit da sonda aprovada: fc01af5e09d82b58f233c6eb95b9a05332dfb530.

| Evidência | Resultado |
| --- | --- |
| DNS | PASS |
| Endereços IPv4 públicos | 3 |
| Conexão TCP | PASS |
| PostgreSQL STARTTLS | PASS |
| CA candidata com SHA-256 conferido | PASS_PINNED_CANDIDATE |
| TLS cadeia de certificação e hostname | PASS |
| Protocolo | TLSv1.3 |
| SQL enviado | NONE |
| Autenticação | NOT_RUN |
| Preflight libpq autenticado | NOT_RUN |

O teste inicial com as CAs padrão do sistema apresentou X.509 error code 19 (certificado autoassinado). A segunda execução forneceu uma CA pública recuperada da biblioteca do proprietário, identificada como **Supabase Root 2021 CA**; o certificado foi aceito com hostname verificado sem desativar validação. Os dois arquivos originais de biblioteca eram idênticos.

- Caminho do certificado **público candidato** na branch: tools/hosted-admission/ca/supabase-root-2021.library-candidate.crt.
- SHA-256 exato do PEM: 700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7.
- Fingerprint X.509 SHA-256: 807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa.
- CA válida até 26 de abril de 2031; **a origem atual do certificado deve ser reconfirmada no painel do projeto** antes da admissão.
- A sonda verificou o TLS com Python SSL (CA e hostname), mas isso **não é execução libpq sslmode=verify-full** nem prova que o pooler compartilhado autenticou a instância comercial pretendida.

## Certificado reenviado pelo proprietário e conferido (20/11/2026)

- Arquivo recebido nesta etapa: `prod-ca-2021.crt`, **1367 bytes**, PEM com apenas um certificado público (`BEGIN CERTIFICATE` / `END CERTIFICATE`); não foi encontrada chave privada nesse arquivo.
- O conteúdo binário foi verificado localmente por `sha256sum` e `openssl x509`: **`CA_UPLOADED_BYTES_MATCH=PASS`** contra o PEM candidato guardado e testado no GitHub. SHA-256 **`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`**.
- X.509: `CN=Supabase Root 2021 CA`, certificado CA autoassinado, `Certificate Sign` e `CRL Sign`; válido **2021-04-28 a 2031-04-26**. Fingerprint SHA-256 **`807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`**.
- **Origem:** entregue pelo proprietário após instrução de download no painel comercial; identidade criptográfica corresponde exatamente à CA arquivada e utilizada no TLS PASS. Esta correspondência **não demonstra, sozinha, que o painel atual publicou a CA**, pois não houve leitura autenticada independente da seção SSL do Dashboard. Registrar `CA_OWNER_PROVIDED=YES`, `CA_BYTES_MATCH=PASS`, `TLS_HOSTNAME_CA_WITH_UPLOADED_CERT=PASS` (resultado da sondagem anterior), `DASHBOARD_SOURCE_INDEPENDENTLY_ATTESTED=NOT_RUN`.
- **Invariante:** não modificar `preflight-policy.json`, grant de autoridade nem manifesto SQL automaticamente por recebimento de certificado. `HOSTED_PREFLIGHT=CLOSED`, `AUTHENTICATED_LIBPQ=NOT_RUN`, `SQL_RELEASE=NOT_AUTHORIZED` e `COMMERCIAL=NO-GO`.

## Próximos bloqueios

1. Conferir o certificado de raiz no Supabase Dashboard > projeto comercial > Database Settings / SSL Configuration. Comparar os fingerprints/hashes; não coletar senha.
2. Política HOSTED_PREFLIGHT ainda CLOSED com host/role/CA/authority nulos. Criar/admitir role dedicada de leitura com concessão assinada, credenciais somente em canal seguro e execução protegida.
3. Validar sessão autenticada persistente com psql, destino e TLS, identidade do backend, cancelamento e limites, sem depender de transação pooler.
4. Autorizar separadamente SQL_RELEASE, que continua execution_authorized=false e approval=null para as 33 unidades; manter HOSTED_SERVER e Hyperdrive comercial fechados até E2E F01/F02/SEC-18 e corte legado.

**Sem escrita SQL, sem secrets, sem Worker, sem Hyperdrive, sem alteração de main, DNS ou LAB.**

Documentação oficial: https://supabase.com/docs/guides/database/psql

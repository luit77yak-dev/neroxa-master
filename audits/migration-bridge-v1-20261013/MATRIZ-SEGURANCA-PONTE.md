# Segurança pós-ponte — comprovada no escopo fictício

| Contexto                          | Regra                                               | Prova final                                                          |
| --------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| A1/A2 org A, B1 org B             | Grants explícitos, não org→todas                    | 493 checks/77 browser em clean e upgrade                             |
| Instância histórica/sua nova irmã | OWNER A1 não herda A2; operador A2 não lê/muta A1   | 4 controles Auth/PGRST com estado DB                                 |
| Histórico privado                 | JWT scoped, dados/snapshots originais               | 3 orders; detalhe half3itens/1evento; foreign/outsider0              |
| Público                           | Domínio/catalog ativo, banco calcula                | GROUP/HTTPS/PRICE_CHANGED/isolamento reexecutados                    |
| Memberships                       | Sem autocast de concessão legítima                  | C sem resolução falha; contas/concessões só fictícias                |
| MFA plataforma                    | AAL2 existente, sem relaxamento                     | Matriz native reexecutada; SUPPORT/FINANCE não homologados           |
| Orders/items/history              | DML direto clientes proibido, RPC/status autorizado | Auth real/SQL efeitos; transições/concorrência                       |
| TRUNCATE                          | RLS não bloqueia este privilégio                    | E REVOKE, privilege check0 em clean/upgrade                          |
| PUBLIC EXECUTE                    | Grants por assinatura                               | Clean pós-E11 controles; nenhuma concessão implicit PUBLIC           |
| Key histórica                     | Não é buyer proof                                   | GROUP22023/recovery42501, ordercount1                                |
| Histórico RECEIVED elegível       | Não gerar capability por key/status                 | Registry service-only42501 com mensagem específica; capabilitycount0 |
| Hash retroativo                   | Não fabricar intent/lease                           | Owner INSERT bloqueado pelo trigger INVOKER                          |
| Novo pedido                       | Preservar caminho permitido                         | GROUP39, retryUUIDúnico, recovery e capability positivos             |
| Storage perdido/UNKNOWN           | Bloqueio, sem telefone ou chave nova                | H04/operacional reexecutados; limitação universal continua           |
| Service_role                      | Só servidor, mesmo backend permitido                | Normal build sem secret,19 negatives; não é usuário público          |
| Owners/defaults gerenciados       | Preservados, sem ALTER ROLE/supabase_admin defaults | Fonte metadados/SQL review; own objetos postgres/ACL explícita       |
| Hosted/serviços externos          | Sem inferir local→hosted                            | NO-GO                                                                |

A fixture antiga foi corrigida para o perfil atual de chaves/estados/half/quantidades/modalidades; última execução38490640042 é a evidência aplicável.
Políticas org-wide antigas são substituídas nos candidatos nativos; WITH CHECK/FKs/guards e parent visibility não enfraquecidos para testes. Nenhuma SQL de escrita remota, dado real, ledger ou pagamento.

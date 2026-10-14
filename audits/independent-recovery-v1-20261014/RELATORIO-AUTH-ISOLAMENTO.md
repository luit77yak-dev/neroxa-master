# Auth e isolamento após restauração

A evidência de referência intermediária é attempt-3/independent-restore.json: 177 verificações PASS, incluindo autenticação de identidades restauradas na TARGET, emissão de JWT novo, rejeição de tokens SOURCE com HTTP401/PGRST301, grants A1/A2/B1 e leitura histórica autorizada. O resultado final será consolidado na decisão e manifest com o workflow completo.

UIDs de auth.users e referências foram preservados por restore real, não por INSERT manual de pedidos ou usuários no destino. A comparação inicial inclui digests de todas as tabelas Auth; logins posteriores alteram sessions e timestamps legitimamente. Usuários conhecidos reautenticam com senhas inteiramente fictícias mantidas somente em memória/arquivos privados do ensaio.

Os cinco atores recuperados têm concessões explícitas: OWNER A1, OWNER A2, OWNER B1, outsider e OWNER do contexto histórico. Membership organizacional não implica grants para outra loja. Em cada identidade, get_admin_orders retorna apenas os pedidos das instâncias concedidas; demais respostas são arrays vazios esperados. A identidade histórica recebe os três pedidos antigos, as demais não. Tokens SOURCE desses atores são rejeitados antes da autorização SQL.

Causa encontrada: Supabase CLI2.120.0 possui uma chave EC padrão constante em NewConfig. Trocar só jwt_secret não troca essa chave assimétrica. A primeira tentativa falhou no gate de JWT; a segunda explicitou que um JWT ES256 não deve ser verificado como HMAC. A correção gera uma chave EC P-256 por stack, signing_keys_path privado, API JWTs assinados pela respectiva chave e prova criptográfica contra ambas as configurações efetivas. A terceira tentativa passou nesse gate, sem enfraquecer RLS nem aceitar JWT estrangeiro.

As ACLs, policies/expressões, funções, owners, defaults e memberships globais são comparados por definições/propriedades e digests, não apenas contagens. Os papéis gerenciados já existentes na TARGET permanecem intactos; não recebem novos atributos nem passwords da SOURCE.

Limites: essa aprovação é restrita às identidades AAL1 e operações exercitadas. A matriz anterior testa MFA AAL2 na SOURCE; não comprovamos aqui portabilidade de todas as variantes/fatores MFA da plataforma após troca de chaves. Sessions/refresh tokens herdados, clientes com cookies anteriores e criptografia de fatores exigem revisão específica. Não transformar UID ou telefone conhecido em autorização de recuperação. SUPPORT/FINANCE e decisões comerciais continuam pendentes.

O bootstrap local CLI usa credenciais SQL sintéticas padrão, isoladas em redes/volumes distintos; não afirmamos credenciais SQL customizadas por cluster nem homologação de executor hosted. As chaves efetivas de Auth/API e TLS são próprias por stack. Não usar esse perfil de credenciais padrão como modelo de produção.

A identidade expirada usada no navegador também precisa vir da TARGET. A candidata inicial dependia de expired.identity.private.json produzido só na SOURCE: copiar esse JWT seria um teste de assinatura estrangeira, não de expiração TARGET. Agora um GoTrue temporário com configuração e DB TARGET emite TTL curto, autoriza antes do prazo e é observado até o PostgREST rejeitar por expiração, sem reduzir leeway ou validação. O arquivo é privado e removido no cleanup.

Resultado final: https://github.com/luit77yak-dev/pizza-perfect-plate/actions/runs/38512737541 SUCCESS,183 checks restore/Auth,11 negativos e78 browser TARGET. JWT SOURCE401/PGRST301; JWT TARGET expirada401/PGRST303 após34s. Imagens efetivas{'auth': 'supabase/gotrue:v2.197.0', 'rest': 'postgrest/postgrest:v16.4'}.

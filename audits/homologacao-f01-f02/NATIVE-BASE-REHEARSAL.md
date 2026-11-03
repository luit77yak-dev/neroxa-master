# NEROXA — F01/F02 | ensaio nativo da base histórica em stack descartável

**Objeto:** instalar SOMENTE a base histórica gerada e conferida na branch anterior num Supabase local descartável de PostgreSQL 17.11 e verificar se os pressupostos das duas frentes continuam verdadeiros. **Não** instalar as 33 unidades de release, não executar SQL em `nvbmzdgfretwnkdfqcap`, não usar dados reais, não cortar RPC remoto ou publicar aplicação.

O executor usa o mesmo runner público `ubuntu-latest`, CLI `supabase@2.120.0`, manifestos de seis imagens fixadas, porta Docker loopback e pacote de rede de ensaios anteriores. Recursos insuficientes implicam `BLOCKED` antes do download. O teste roda sob usuário dedicado com bloqueio de saída externo; o projeto local é `neroxa-02a3-<run_id>-buyer`, **nunca** um ref do Supabase hospedado. O teardown é independente e obrigatório.

**Fonte**: ancestral PR #51 `b8a2087ad96dde4f90c04a7c10c31281d663e9f8`; catálogo SHA256 `e7ed111d73ec8d63b514db8c39059d6b87ae97be74d54e0d682d38bc0e4cf858`; SQL gerado SHA256 `231a3664711b6286ae3655845ee184d4bdd50fba370b0af9de1ab1b704b6aa8c`. A base recria 34 relações, 50 funções e 99 políticas da captura de 09/10, sem usuários ou dados da produção. Este ensaio verifica ausência de pedidos e usuários locais antes de qualquer fixture.

**F01 — sinal esperado (não é aprovação):** políticas históricas amplas por organização permanecem e a tabela de memberships explícitos ainda não existe. Conclusão deve ser `BASELINE_UNSAFE`, não `F01_PASS`.

**F02 — sinal esperado (não é aprovação):** RPCs UUID+telefone legadas estão presentes e executáveis por `anon` nessa captura; capability privada ainda ausente. Conclusão deve ser `BASELINE_UNSAFE`, não `F02_PASS`.

**Limites:** PostgreSQL local 17.11.0.004 difere do 17.11.0.003 informado pelo projeto hospedado. Sem ensaio de TLS, instância alojada, autoria/credenciais remotas, mudança de ACL, readiness positiva ou lançamento comercial.

**Próximo passo após PASS:** planejar as correções F01/F02 separadamente sobre a base local com as provas focais já existentes. Instalação hospedada requer aprovação explícita adicional.

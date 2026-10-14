# Compatibilidade e harness — perfis separados

Base Master #41 SHA172abae4bc5dc41348202915e61e4f1fd8918ab2. Esta PR agrega o sucessor de leitura/manage de complementos com membership explícita e o ensaio de compatibilidade de dois perfis em jobs independentes. Não instala schema Delivery em Master.

M: mesmos19 predecessores + SQL scoped02A2 + disponibilidade02A4 + addon02A4, ordem/hash MANIFEST. A família addon mantinha somente permissivas por organização, deixando staff autorizado de fora; novo allow explicitamente escopado continua AND-limitado pelos caps. Não altera CRM nem concede grants globais. Link product-addon é dependência distinta ainda não alterada.

L: Delivery #41 SHA7388038288c09eafa3a13172bbb7c8e5061f8b2c. Replay LITERAL das31 fontes ordenadas com check_function_bodies=on. Sem validação adiada ou AST derivado. UPDATE histórico de imagem executa antes de criar produtos fictícios, sobre tabelas vazias; não injeta linhas de clientes. Checkout mínimo usa produto SIMPLE, preço30 autoritativo; não certifica pizzas/complementos/meia-pizza. Quarentena nova exige RLS nativo já ligado, sem ALTER protegido/elevação. Owner/executor/superuser registrados no log. Não confundir transação abortada com rollback pós-commit seguro.

Realtime: mantém assert positivo e negativo, registra mensagens system/subscriptionCount e amplia janela8s (sem concluir negativo quando positivo ausente). Nenhuma permissão ampliada para esconder timeout. Logout com JWT antigo requer política de sessão separada; não presumir revogação imediata do access token.

Storage M: schema público histórico não contém políticas Storage operacionais. Não improvisar permissão global; positivos continuam bloqueantes até contrato owner/bucket/path/MIME/limites revisado. Negativas isoladas não certificam funcionalidade.

Draft: ensaios reais pendentes até logs. Não promover SQLs, não restaurar grants como rollback, não reativar painel. Sem integração comercial, sem merge/deploy.

Revisão: Deliverya99a7d7 tipa snapshot opcional de tamanho e revoga drivers/loyalty_accounts após P0 real7388038. Novo teste exige uma ordem/item, subtotal/total/linha30 e taxa0, além de Auth RPC real. Matriz M dividida por atores sem trocar asserts;324 horários já foram executados separadamente. Complementos/Realtime têm job focalizado. RT em L é NOT RUN intencionalmente após quarentena, não PASS. Não somar casos duplicados dos lotes.

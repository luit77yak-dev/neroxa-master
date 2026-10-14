# Upgrade observado — PASS da projeção operacional

Workflow https://github.com/luit77yak-dev/pizza-perfect-plate/actions/runs/38490640042, job115614732666 SUCCESS; cleanup SUCCESS.
Master e5184d2dbda707036f25a0492578aa480a0cca82 / Delivery35e844c48ad41ce82141abfb7beb502e565930ab.
Runner distinto do clean. Reexecutados493/40/24/19/21/77; mais57 checks de preparação e37 de cutover. Todos PASS.

## Fonte e fidelidade

Read-only sandbox reconfirmado:12 tabelas/132 colunas/8 funções,9 sem RLS/0 policies;1 org/1 instância/4 produtos/3 pedidos/6 itens/12 eventos; plataforma1 sem papel, org-members0.14 agregados de integridade/precisão sem divergência. Corpos, assinaturas, ACLs, owners, defaults, roles/memberships, colunas, constraints, índices e triggers iguais nas propriedades capturadas. Não exportamos dados de clientes.

Perfis anonimizados posteriores corrigiram a fixture inicial:3 chaves existentes;2 DELIVERED/1 RECEIVED;1 half;1 addons id-only;1 domínio/settings/zona; quantidades [2,1]/[1]/[1,1,1]; DELIVERY/PICKUP/PICKUP; CARD_ON_SITE/PIX/PIX; históricos6/5/1. Pares from/to observados preservados, sem reparar/reordenar legado para o grafo novo. Datas, identidades, endereços e valores são inteiramente fictícios.

| Pedido sintético | Forma/estado                    | Itens                    | Valores antes = depois |
| ---------------- | ------------------------------- | ------------------------ | ---------------------- |
| 1                | DELIVERY/CARD_ON_SITE/DELIVERED | 2, qty2+1, addon id-only | 100+7=107              |
| 2                | PICKUP/PIX/DELIVERED            | 1, qty1                  | 30+0=30                |
| 3                | PICKUP/PIX/RECEIVED             | 3, qty1 cada, um half    | 120+0=120              |

Seed somente ANTES do upgrade, em banco vazio. C não atualiza orders/items/history, não recria pedidos, não recalcula valores e não converte UUID produto em UUID adicional. Digests abrangem TODOS campos antigos; trim_scale normaliza30 versus30.00 sem arredondar. Cast monetário exige exatidão. Nome/preço individual do adicional não constam do payload id-only e continuam desconhecidos; não recuperar falsamente por catálogo atual.

## Destino e operação

Projeção operacional explícita16 relações/18 funções preparatórias/45 policies, depois25 candidatos nativos. NÃO equivale ao Master completo34/50/99. plan/subscription FKs/lifecycle diferidos; membership mantém PK legada e novo id UNIQUE. Perfil com oito SQLs já instalados é rejeitado; não concatenamos8+25.

JWT Auth scoped lê3 históricos; outsider/outro cliente não. Detalhe preserva3 itens, half e1 evento do pedido3. Segunda loja na mesma organização histórica possui grant próprio: controle positivo de leitura da sua instância, bloqueio de orders A1 e mutação A1; OWNER A1 não herda A2. Matriz geral A1/A2/B1 também reexecutada em browser/DB.

Novo pedido na MESMA instância original via RPC/PostgREST real: produto30+addon2, qty1, subtotal32, fee7, total39, GROUP v2. Retry mantém UUID único; payload alterado rejeitado; recovery service-only com prova funciona. Horários configurados por Auth OWNER scoped fictício. Complemento histórico validado em transporte/RPC; browser77 percorreu as lojas de homologação na stack atualizada, não o domínio histórico real.

## Provas antigas

Anchors privados preservam IDs/instância/chaves T0, sem novos hashes/leases/tokens. E instala trigger INVOKER impedindo intent/capability retrofit para esses IDs. Registry service-only com chave certa/status RECEIVED elegível retorna42501 com causa específica; inserir intent como owner também bloqueia. GROUP sobre chave antiga22023; recovery sem prova42501. Controle positivo: novo pedido legítimo aceita capability. Nenhuma capability histórica criada; NOT_SETTLED não vira pago.

Papéis/novos campos comerciais reais exigem resolução por registro: ADMIN/ACTIVE/valores de configuração usados no teste são escolhas fictícias explícitas, não aprovação para dados reais. SUPPORT/FINANCE, entitlements, FKs comerciais, gestão auditada de grants, consumidores remotos, backup e restore independente continuam pendentes.

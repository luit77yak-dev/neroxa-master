# NEROXA — Plano de transição dos dois demos internos (F02, sem execução)

**Data:** 15/10/2026. **Estado:** PROPOSTA DOCUMENTAL / AGUARDANDO DECISÃO ESPECÍFICA DO FUNDADOR.

## Escopo e propriedade

Ambientes: `food.neroxa.ia.br` e `mvp.neroxa.ia.br`, classificados pela Coordenação como **DEMONSTRAÇÃO INTERNA — LEGADO DISTRIBUÍDO**. A autorização para alterar ou desligar cada domínio pertence ao **fundador da Neroxa**. Não são clientes contratantes; não inferir ausência de tráfego.

Ambos os aliases Vercel apontam atualmente para `dpl_7Ctmw4c8JgZEXh8qJVzW5jjqL4Ho`, código SHA `47e7d8aef66b0c458ed6f423cebeba99abfcc7a8`. **Preservar tudo até aprovação adicional.**

## Decisão separada por domínio — ainda não tomada

A. **Preservar temporariamente como demonstração legada**, sem declarar seguro e sem usar como piloto, mantendo F02 P0 e risco residual explícitos; qualquer comunicação pública deve ter aprovação.

B. **Desativar ou restringir a demonstração**, após aprovação específica sobre aliases, DNS, redirect, manutenção ou proteção de acesso; validar comportamento esperado e registros antes/depois. Isso **não é revogação de RPC** e não encerra F02.

C. **Substituir pelo candidato seguro**, apenas após engenharia demonstrar checkout + emissão da capability + consulta, catálogo, append, preços, pagamentos, F01, Auth/Storage/Realtime e recuperação em clone. Requer autorização independente de deploy/domínio e análise de compatibilidade de todos os consumidores.

A escolha pode diferir por domínio. **Nenhuma das alternativas está autorizada por este documento.**

## Preparação técnica antes de qualquer mudança

1. Fotografar metadata não sensível: alias → deployment ID/SHA, ambiente alvo, branches e configurações (sem copiar segredos). Relacionar outros aliases que partilham o deployment sem confundi-los com clientes.
2. Identificar consumidor e owner técnico de Storefront, checkout e scripts; solicitar à Coordenação a confirmação de todas as integrações externas e instalações antigas. Manter `UNKNOWN` sem prova.
3. Definir se a demo deve manter funcionalidade de pedido ou somente visualização; não desabilitar RPC antiga sem caminho substituto demonstrado.
4. Em ambiente descartável, reproduzir os fluxos da versão legada com fixtures fictícias e o fluxo candidato de 24 horas por capability, revogação, Host/Origin, cotas, isolamento A/B/C, integridade e ausência de PII.
5. Inventariar funções/overloads/grants herdados/default ACL/wrappers views nos dois perfis Master e Delivery. A leitura [38672488319](https://github.com/luit77yak-dev/neroxa-master/actions/runs/38672488319) já demonstrou duas funções legadas expostas no clone Master, mas não cobre o clone Delivery completo.
6. Se **todos** os consumidores relevantes estiverem comprovadamente migrados ou desligados, realizar ensaio coordenado `pré-gate → gate → pós-gate` no clone; caso contrário registrar `BLOCKED` sem `CONSUMER-DISABLEMENT.json` ou flags fabricadas.
7. Recolher aprovação específica para cada ação futura que afete serviço remoto/cliente. Manter PRs draft e `vercel.json` com guard ativo até decisão.

## Aceite do ensaio e reversão

**Antes:** SHAs, signatures/owners/grants, fixtures, capturas de resultado positivo e negativo, digests de dados, nomes de instâncias fictícias, consumidores/owners/ambientes rastreáveis.

**Depois:** negação para anon/authenticated de todas as assinaturas inseguras verificadas, tracking privado legítimo funcionando, acessos autorizados da própria instância preservados, cross-instance negado, dados empresariais íntegros, sem rollback inseguro.

**Falha pré-commit no clone:** ROLLBACK transacional. **Falha após cutover:** manter caminho inseguro suspenso e planejar roll-forward; nunca restaurar `EXECUTE` ao telefone, StaffPanel ou grants globais.

**Não executado neste documento:** nenhum deploy, alteração de domínio, mudança de banco, gate, contrato, assinatura, cobrança ou nova infraestrutura.

**F01/F02 abertos • Operação comercial não liberada • Marco 01 0/7.**

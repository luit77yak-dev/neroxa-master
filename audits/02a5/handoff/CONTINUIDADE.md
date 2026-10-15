# Continuidade operacional — última rodada02A5

Código Delivery em PR42, código/harness/SQL em PR46, ambas draft. Nenhum merge/deploy/SQL remoto autorizado. Não habilitar produção: adaptador aceita somente homologation/local-disposable/http127.0.0.1:porta/domínios sintéticos e contrato direct-canonical-host-v1.

## Comandos de inspeção imediata

```bash
gh pr view 42 --repo luit77yak-dev/pizza-perfect-plate --json headRefOid,isDraft,baseRefName
gh pr view 46 --repo luit77yak-dev/neroxa-master --json headRefOid,isDraft,baseRefName
gh run view 38665665942 --repo luit77yak-dev/neroxa-master --json status,conclusion,jobs
```

O job116196932383 é do SHA4e570b8bd0b2460ce1242d2c1859aa88ac7b37c4 e fixa Delivery4ce88959a751066f96da4cbab8d1fc9ac29bb320. Logs/evidências anexados ao relatório quando disponíveis. Não atribuir PASS desse código a commits funcionais posteriores. Não mudar base/main para disparar CI.

## Gate e ordem de avanço

```bash
python3 audits/02a5/verify_manifest.py
python3 audits/02a5/verify_manifest.py --release-ready
```

O segundo deve continuar BLOCKED até prova real dos consumidores, nunca criar CONSUMER-DISABLEMENT.json só para passar. Perfil BUYER-PRE-GATE executa prefixo e quota separado, sem revogar telefone, sem homologar M integrado. Um PASS dos testes selecionados não apaga F02P0 observado.

Os fixes de leitura do UID, acesso de cleanup e transporte HTTP foram executados no run final, com cleanupPASS. Preservar essas correções ao repetir a stack. Não ampliar egress do UID de teste nem aplicar regra OUTPUT global que bloqueie heartbeat. Verificar público/standard/capacidade/digests das seis imagens e ausência de cobrança antes de novo run. Um patch posterior de workflow sem execução deve continuar NOT RUN.

Prioridades restantes: validar rota TanStack de checkout sob mesma configuração e backend local, confirmação/hidratação→token→tracking; inventariar/desativar consumidores externos e proteger RPC telefone de maneira coordenada; testar negativos diretos das novasRPCs e ausência de efeitos, concorrência inicial de checkout, revogação administrativa auditada e recuperação forte. Memória browser perde token em reload, sem fallback. Append financeiro/T1/imagens/Realtime completo ficam separados e não devem ser presumidos executados.

## Recuperação de resposta perdida

Checkout confirmado pode preceder registro da capability. Falha de registro retorna erro genérico, sem token/sucesso de tracking. Retry mantém mesma chave de checkout. Se registro nunca ocorreu, retry pode registrar uma vez; se já ocorreu, conflito não reemite segredo. Resposta perdida depois do registro exige suporte assistido. Não criar nova chave automaticamente nem recuperar só com UUID+telefone.

## Resultado final e próxima ação

Run38665665942: recorte comprador passou, mas F02P0 foi confirmado ao final (anon leu pedidoB+telefone pela RPC antiga). Jobverde NÃO libera o candidato. Ler primeiro RELATORIO-PASSAGEM-MISSAO-02A5-FINAL-20261015.md e EXECUTION-INDEX.json. Não executar quarto run nesta rodada.

Próxima alteração de Engenharia: inventário verificável dos consumidores, recibo legítimo de migração/desativação no escopo correto, incorporação formal da quota ao manifesto de release e ensaio do gate de telefone com HTTP privado positivo. O arquivo de recibo continua ausente; não criá-lo artificialmente. Separadamente testar a rota TanStack real e UI após reload, inclusive indicação clara de resumo em cache sem autorização de tracking.

Reprodução do recorte exato, somente depois de rever elegibilidade/custo/capacidade: `gh run rerun 38665665942 --repo luit77yak-dev/neroxa-master`. Não foi executado novamente na passagem.

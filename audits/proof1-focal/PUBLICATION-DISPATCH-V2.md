# Prova 1 focal — publicação e dispatch manual (V2)

## Candidato

- Base Master: `b4158a9422a0f8b4a1d059c2109fa3f9eb3acb8d`
- Base de trabalho: `a6a08277d01385628694a0428cbf7836a120f777`
- Delivery fixado: `7ca9376f29ee205d4063e46546f5070313ab78a0`
- Branch candidata: `proof1-focal-dispatch`

O workflow contém somente `workflow_dispatch`; não há gatilhos automáticos. O input obrigatório `candidate_sha` precisa ser um SHA Git de 40 caracteres e deve ser idêntico a `GITHUB_SHA`. O branch do evento também é conferido. O workflow conserva o limite de uma tentativa e rejeita retries e dispatches anteriores com o mesmo SHA.

## Registro obrigatório

O GitHub só aceita `workflow_dispatch` quando o arquivo do workflow existe no branch padrão. Portanto, o primeiro dispatch não pode ser iniciado enquanto o workflow existir somente na branch isolada.

Procedimento mínimo futuro, sujeito a autorização própria:

1. Publicar a branch candidata sem alterar o branch padrão.
2. Criar uma branch de registro a partir do branch padrão, contendo apenas uma cópia idêntica de `.github/workflows/proof1-focal.yml`; abrir PR e aguardar deliberação para mesclar esse arquivo. O merge não dispara o workflow, pois ele não declara evento `push` ou `pull_request`.
3. Após o registro, abrir **Actions → Prova 1 focal — P0 RPC e capability → Run workflow**; selecionar `proof1-focal-dispatch`, informar `PROVA1` e o SHA integral revisado no input `candidate_sha`. Não selecionar o branch padrão.
4. Antes de confirmar, reconciliar o SHA mostrado pelo GitHub com `candidate_sha` e com o commit aprovado. O primeiro step aborta antes de qualquer serviço se branch, tentativa ou SHA divergirem.

Forma equivalente, não executada:

```sh
gh workflow run proof1-focal.yml \
  --repo luit77yak-dev/neroxa-master \
  --ref proof1-focal-dispatch \
  -f confirm_single_attempt=PROVA1 \
  -f candidate_sha=<SHA_APROVADO>
```

O `--ref` seleciona o branch de execução. A validação interna `GITHUB_SHA == candidate_sha` vincula o dispatch ao commit revisado mesmo se o branch avançar entre a publicação e o clique. O workflow de registro no branch padrão e o workflow da branch candidata devem ter o mesmo conteúdo.

## Limites desta V2

Nenhum push, PR, merge, dispatch, teste de runtime, serviço ou SQL foi executado. A cópia do workflow para o branch padrão é dependência futura explícita; não foi feita nesta preparação.

# NEROXA — F02 independente | laboratório descartável

**Fontes congeladas**: Master `f9a73afe39843d0c9d17011ffe0c8d17ce5b807f` e Delivery `7ca9376f29ee205d4063e46546f5070313ab78a0`. Os 16 blobs críticos F02 (geradores, RPCs, manifestos e driver) são idênticos à execução histórica [40214203640](https://github.com/luit77yak-dev/neroxa-master/actions/runs/40214203640).

Este workflow não herda a execução F01; importa apenas o verificador de loopback `verify_local_bindings.py` cuja proveniência foi confirmada na F01. Usa os seis serviços Supabase nativos locais, imagens com digest de configuração e manifesto imutáveis e uma bridge de loopback, com saída externa da identidade de teste bloqueada. Nenhum acesso a `neroxa-homologacao`.

Reproduz P0 legado de leitura e escrita **antes** do gate, aplica os candidatos exatos apenas dentro do clone, testa emissão única de capability privada, validação de tokens, alteração e histórico legítimos, checkout integrado e bloqueio das três famílias de RPCs legadas. A revogação tem os dois guards explícitos de escopo `THIS_RUN_LOCAL_CLONE_ONLY` e `disposable-workflow`; consumidores externos seguem UNKNOWN/BLOCKED e são intocados.

Validação focal = positivos/negativos nativos pré/pós-gate + catálogo SQL final + cleanup. Não declarar F02 hospedada ou comercial liberado; SQL candidato de produção nunca executado.

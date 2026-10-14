# Publicação de imagem derivada — proposta, NOT RUN

Preservar original privado em `product-images/<instance UUID>/<id>.png`, conforme #44. Publicação deve exigir papel de catálogo autorizado + sessão Auth ativa e vínculo de produto na mesma instância; não aceitar instance_id do browser como autorização.

Worker server-only: verificar tamanho antes e durante leitura, assinatura real do arquivo e decode completo; limitar pixels/memória/tempo, rejeitar SVG/arquivo políglota/animação não contemplada; reencodar para PNG/WebP com biblioteca versionada e remover metadados. MIME informado pelo cliente não é prova. Não usar download de URL arbitrária (SSRF).

Criar registro de publicação explícita `{instance_id, product_id, original_version, derived_digest, active, published_at}` e objeto derivado em bucket separado, nunca publicar original. Nome derivado inclui instância + digest e não PII; leitura pública somente da versão explicitamente publicada, writes somente serviço de publicação após autorização. Uma signed GET jamais autoriza upload/delete. Anon não recebe listagem de originais.

Para revogação imediata, usar gateway de leitura que confere publicação e responde no-store; cache CDN com TTL só após decisão explícita sobre janela de revogação. Substituir gera novo digest e desativa/deleta publicação anterior; excluir produto/loja revoga registro e remove derivados conforme lifecycle. Não depender de apagar URL de uma UI. Testar cache já aquecido e URL antiga. Tema só referencia publicação ativa da MESMA instância. URLs legadas ficam indisponíveis até migração auditada.

Ensaios pendentes: upload/read/replace/delete A positivo, B/C todos writes negados sem efeitos, anon GET derivado ativo positivo e originais negativos, path traversal/encoding, MIME spoof, descompressão excessiva, sessão revogada, despublicação/cache/substituição/exclusão, URL antiga e tema cruzado. Não há novo bucket/serviço contratado ou criado nesta missão. Infra/library/custo não estimados.

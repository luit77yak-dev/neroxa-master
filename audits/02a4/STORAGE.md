# Native Storage candidate — no owner changes

Base Master #41 SHA172abae4bc5dc41348202915e61e4f1fd8918ab2. Requires RLS natively enabled and an executor legitimately permitted to create policies. No ALTER TABLE, role escalation or owner transfer. Failure remains BLOCKED. Private product-images bucket, native MIME image/png allowlist and1MiB bound are mandatory preflight via Storage API, not an implicit change to production.

Names: instanceUUID/filename.png; membership helper explicit, operational roles for writes, restrictive AND cap handles pre-existing permissives. Different bucket contracts unchanged. Anonymous native-public-object URL is denied by private bucket. Scope tests use Auth identities, service only bootstraps bucket/fixtures. Legacy text/plain own.txt case remains in harness and is expected to fail under the new image-only contract; do not reinterpret its historical raw result. Separate PNG positives validate the intended API.

A public storefront needs a reviewed signed/proxied asset successor, not a public bucket bypass. This draft cannot replace current public image consumers without coordinated migration. MIME labels/limits do not guarantee image sanitization; decoder/metadata stripping is a separate gate. No production rollout. Keep private and roll forward for recovery, never restore global/public grants.

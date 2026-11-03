## Image identity reconciliation — 03/11/2026

Previous attempts [41699997226](https://github.com/luit77yak-dev/neroxa-master/actions/runs/41699997226) and [41700325248](https://github.com/luit77yak-dev/neroxa-master/actions/runs/41700325248) were **blocked before starting PostgreSQL** by a docker image ID comparison. In the latter, `docker image inspect .Id` returned `sha256:f2a84af3…` (the pinned registry manifest digest) while the historical `EXPECTED-IMAGES.json` contains `sha256:94fe95ac…` (the CONFIG digest). The public GitHub runner used Ubuntu 26.04 and `overlayfs`, unlike older classic Docker image ID semantics.

The new diagnostic **does not replace or loosen historical image hashes**. For each actual local image, it obtains its immutable registry manifest via `docker buildx imagetools inspect --raw NAME@sha256:...`, retrieves the `linux/amd64` child if needed and requires `config.digest` to match the historical hash. The running container must point to that same locally inspected image. Only then does it allow the image ID to be either the validated CONFIG sha or its immutable MANIFEST sha.

The PostgreSQL digest reference remains pinned as `supabase/postgres@sha256:f2a84af37797675f0b27e27ea1fad2ebcd913ebf7ad60be05d7df0bcbd29e4b5`. Its expected CONFIG digest remains `sha256:94fe95acfce6e1d41106ff2abd4c08e7932a6941d453499a56f8a620a473de1a`. All other service configurations retain their original SHA256s.

**Fail-closed:** missing registry manifest, changed CONFIG digest, index without unique `linux/amd64`, missing RepoDigest, wrong runtime container, or unexpected service inventory blocks the test. No image is approved by version string alone.

**This is local only.** Host Supabase target remains untouched, SQL release still closed, and F01/F02 remain BLOCKED_HOSTED. Cleanup mandatory. No changes to PR #51 SQLs, baseline source or application.

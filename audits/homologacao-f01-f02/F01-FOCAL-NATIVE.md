# NEROXA | F01 focal — PR51 source + image pins validated 03/11/2026

**ONLY DISPOSABLE PostgreSQL/Auth on public standard GitHub runner.**
Start from frozen PR51 plus established image-identity fix, no changes to tracked SQL candidates, PR #51, main, hosted Supabase, Delivery backend or Vercel config.

The frozen driver `tools/mission-02a3/run.mjs` is derived in the runner with original SHA checked by `tools/f01/generate.py` and a single narrow branch injected by `tools/homologacao/build_f01_focal.py`. It installs its exact catalog and historical predecessor order, creates six genuine local Auth users (incl. TOTP AAL2), fake A1/A2 same org + C other org, applies the candidate scope/availability/addon/live-session SQL with manifest checks, and then executes **20 focal F01 checks** for real RLS operations, no-grant staff, positive B update/restore and membership revocation.

The existing `tools/f01/realtime-containment.mjs` is then run unchanged to prove private order events removed from the public Realtime publication, independent positive transport, polling and logout. The script must reject a non-PASS containment.

Reuses approved local run 40212763636 without rerunning 1,193 unrelated cases. The candidate does not revoke legacy telephone RPCs (F02); F02 remains open.

Retains the strict six-service registry manifest/CONFIG digest validation proven in run 41701221473. Node 22 and the Supabase CLI version 2.120.0 pinned. Docker test UID network egress blocked with local bridge only. Cleanup always and no artifact upload.

**Decision criterion:** real native F01 smoke PASS + containment PASS + CLEANUP PASS = local F01 focal PASS. Not hosted F01 approval. No hosted SQL or production deployment.

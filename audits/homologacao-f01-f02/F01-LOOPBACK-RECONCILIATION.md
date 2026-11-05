# F01 loopback Docker containerd portability — evidence and strict contract

On GitHub runs [41702496145](https://github.com/luit77yak-dev/neroxa-master/actions/runs/41702496145) and [41702579065](https://github.com/luit77yak-dev/neroxa-master/actions/runs/41702579065), both stopped **before synthetic identities and F01 checks** at the original bootstrap guard `HostConfig.PortBindings[].HostIp !== 127.0.0.1`. No remote SQL. Both cleans PASS.

In newer Docker configurations the requested address field may be empty, while the actual published binding is expressed by `NetworkSettings.Ports` as described by Docker. An empty request is **not** alone safe, and Docker defaults can publish to every host interface. We therefore DO NOT simply allow blank HostIp.

The new local verifier runs prior to creating identities, requires:
- exact run-ID project names, six labeled running services, bridge type and `host_binding_ipv4=127.0.0.1`;
- requested HostIp either `127.0.0.1` or unspecified, and for **every** published port the *effective* `NetworkSettings.Ports.HostIp` exactly `127.0.0.1` with numeric host port;
- no unexpected published port, no 0.0.0.0/:: wildcard, database must be locally published;
- any missing or conflicting metadata is BLOCKED, no fallback and no API exposure.

The change exists **only in the generated disposable driver**, leaving `tools/mission-02a3/run.mjs` and all SQL/candidate hashes untouched. Postgres/other six image digest evidence is still required from verified immutable registry manifests.

The Docker docs distinguish declared publishing options from actual port mappings: https://docs.docker.com/reference/cli/docker/inspect and https://docs.docker.com/engine/network/port-publishing/.

F01/F02 hosted remain BLOCKED. No production, no data, no remote SQL.

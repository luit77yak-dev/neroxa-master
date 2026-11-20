#!/usr/bin/env python3
"""Credential-free PostgreSQL TLS transport probe for NEROXA V1 commercial host.

No authentication, SQL, user data, role changes, credential reads, or deploy.
This is NOT an authenticated libpq HOSTED_PREFLIGHT, nor a SQL_RELEASE grant.
The sole permitted endpoint is pinned in source and must match an independently
approved commercial Supabase project. Never allow user-controlled host inputs.
"""
import socket
import ssl
import struct

HOST = "db.iefaoaqzltvpfabyeelj.supabase.co"
PORT = 5432
SSL_REQUEST = struct.pack("!II", 8, 80877103)

def main():
    print("PROBE_TYPE=POSTGRES_STARTTLS_CA_HOSTNAME_ONLY")
    print("TARGET_SUPABASE_REF=iefaoaqzltvpfabyeelj")
    print("SQL_EXECUTED=NONE")
    print("CREDENTIALS_ACCESSED=NONE")
    print("HOSTED_PREFLIGHT=NOT_RUN")
    print("SQL_RELEASE=NOT_AUTHORIZED")
    try:
        resolved = socket.getaddrinfo(HOST, PORT, type=socket.SOCK_STREAM)
    except OSError:
        print("DNS=NOT_VERIFIED")
        print("PG_TCP=NOT_VERIFIED")
        print("PG_TLS_HOSTNAME_CA=NOT_VERIFIED")
        return 0

    by_family = {socket.AF_INET: [], socket.AF_INET6: []}
    for family, typ, proto, canon, sockaddr in resolved:
        if family in by_family and sockaddr not in by_family[family]:
            by_family[family].append(sockaddr)
    print(f"DNS_A={len(by_family[socket.AF_INET])}")
    print(f"DNS_AAAA={len(by_family[socket.AF_INET6])}")
    print("DNS=PASS" if any(by_family.values()) else "DNS=NOT_VERIFIED")
    tcp_ok = False
    negotiation_ok = False
    tls_ok = False
    verified_protocol = "NONE"
    for family, label in ((socket.AF_INET, "IPV4"), (socket.AF_INET6, "IPV6")):
        addresses = by_family[family][:2]
        if not addresses:
            print(f"PG_TCP_{label}=NO_ADDRESS")
            continue
        family_tcp_ok = False
        for address in addresses:
            try:
                with socket.socket(family, socket.SOCK_STREAM) as raw:
                    raw.settimeout(4.0)
                    raw.connect(address)
                    tcp_ok = True
                    family_tcp_ok = True
                    raw.sendall(SSL_REQUEST)
                    answer = raw.recv(1)
                    if answer != b"S":
                        continue
                    negotiation_ok = True
                    with ssl.create_default_context().wrap_socket(
                        raw, server_hostname=HOST
                    ) as tls:
                        tls_ok = True
                        verified_protocol = tls.version() or "UNKNOWN"
                        break
            except (OSError, ssl.SSLError):
                continue
        print(f"PG_TCP_{label}={'PASS' if family_tcp_ok else 'NOT_VERIFIED'}")
        if tls_ok:
            break

    print("PG_TCP=" + ("PASS" if tcp_ok else "NOT_VERIFIED"))
    print("PG_STARTTLS=" + ("PASS" if negotiation_ok else "NOT_VERIFIED"))
    print("PG_TLS_HOSTNAME_CA=" + ("PASS" if tls_ok else "NOT_VERIFIED"))
    print("PG_TLS_PROTOCOL=" + verified_protocol)
    print("AUTHENTICATED_LIBPQ_PREFLIGHT=NOT_RUN")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

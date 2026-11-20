#!/usr/bin/env python3
"""NEROXA V1 — session-pooler-only PostgreSQL TLS probe.

Never opens an authenticated database session, sends credentials or SQL, nor
changes an approval policy. Fails closed. The hostname MUST be copied from the
commercial project's Connect > Session pooler UI (not inferred from region).
"""
import argparse
import ipaddress
import re
import socket
import ssl
import struct

PORT = 5432  # Session pooler, NOT the transaction pooler on 6543.
SSL_REQUEST = struct.pack("!II", 8, 80877103)
HOST_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9.-]{0,240}[a-z0-9])?\.pooler\.supabase\.com$")

def valid_host(host):
    return (
        isinstance(host, str)
        and len(host) <= 253
        and bool(HOST_PATTERN.fullmatch(host))
        and all(
            1 <= len(label) <= 63
            and not label.startswith("-")
            and not label.endswith("-")
            and re.fullmatch(r"[a-z0-9-]+", label)
            for label in host.split(".")
        )
        and host != "pooler.supabase.com"
    )

def global_address(family, sockaddr):
    try:
        ip = ipaddress.ip_address(sockaddr[0])
        return ip.is_global and (
            (family == socket.AF_INET and ip.version == 4)
            or (family == socket.AF_INET6 and ip.version == 6)
        )
    except (ValueError, TypeError, IndexError):
        return False

def run(host):
    print("SCOPE=COMMERCIAL_SESSION_POOLER_NO_CREDENTIALS")
    print("SQL_EXECUTED=NONE")
    print("PG_AUTHENTICATION=NOT_RUN")
    print("HOSTED_PREFLIGHT=NOT_RUN")
    print("SQL_RELEASE=NOT_AUTHORIZED")
    print("CLOUDFLARE_HOSTED_SERVER=NOT_ADMITTED")
    if not valid_host(host):
        print("HOSTNAME_POLICY=BLOCKED")
        return 78
    print("HOSTNAME_POLICY=PASS_SYNTAX_ONLY")
    try:
        addresses = socket.getaddrinfo(host, PORT, type=socket.SOCK_STREAM)
    except OSError:
        print("DNS=NOT_VERIFIED")
        return 78
    global_targets = []
    for family, kind, proto, _, sockaddr in addresses:
        if family in (socket.AF_INET, socket.AF_INET6) and global_address(family, sockaddr):
            target = (family, kind, proto, sockaddr)
            if target not in global_targets:
                global_targets.append(target)
    print("DNS=" + ("PASS" if global_targets else "BLOCKED_NO_PUBLIC_ADDRESS"))
    if not global_targets:
        return 78
    print("PUBLIC_IPV4_COUNT=" + str(sum(1 for a in global_targets if a[0] == socket.AF_INET)))
    print("PUBLIC_IPV6_COUNT=" + str(sum(1 for a in global_targets if a[0] == socket.AF_INET6)))
    negotiated = False
    for family, kind, proto, sockaddr in global_targets[:4]:
        try:
            with socket.socket(family, kind, proto) as plain:
                plain.settimeout(5.0)
                plain.connect(sockaddr)
                plain.sendall(SSL_REQUEST)
                if plain.recv(1) != b"S":
                    continue
                negotiated = True
                with ssl.create_default_context().wrap_socket(plain, server_hostname=host) as secure:
                    protocol = secure.version()
                    if protocol not in ("TLSv1.2", "TLSv1.3"):
                        continue
                    print("PG_TCP=PASS")
                    print("PG_STARTTLS=PASS")
                    print("PG_TLS_CA_HOSTNAME=PASS")
                    print("PG_TLS_PROTOCOL=" + protocol)
                    print("AUTHENTICATED_LIBPQ_PREFLIGHT=NOT_RUN")
                    return 0
        except (OSError, ssl.SSLError, ValueError):
            continue
    print("PG_TCP_STARTTLS=" + ("PASS" if negotiated else "NOT_VERIFIED"))
    print("PG_TLS_CA_HOSTNAME=NOT_VERIFIED")
    return 78

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Credential-free PostgreSQL Session pooler TLS/CA/hostname verification")
    parser.add_argument("--host", required=True, help="ONLY the hostname from the Supabase commercial Connect > Session pooler panel")
    args = parser.parse_args()
    raise SystemExit(run(args.host))

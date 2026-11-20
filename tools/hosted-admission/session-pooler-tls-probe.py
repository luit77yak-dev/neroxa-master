#!/usr/bin/env python3
"""NEROXA V1 — session-pooler-only PostgreSQL TLS probe.

Never opens an authenticated database session, sends credentials or SQL, nor
changes an approval policy. Fails closed. The hostname MUST be copied from the
commercial project's Connect > Session pooler UI (not inferred from region).
"""
import argparse
import hashlib
from pathlib import Path
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

def run(host, ca_file=None, expected_ca_sha256=None):
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
    # A public CA certificate from the archived user Library may be used for
    # a TLS-only test, with exact byte pinning. It is NOT yet approved as the
    # commercial project's root for a signed HOSTED_PREFLIGHT.
    if bool(ca_file) != bool(expected_ca_sha256):
        print("CA_FILE_POLICY=BLOCKED_INCOMPLETE_INPUT")
        return 78
    if ca_file:
        if not re.fullmatch(r"[0-9a-f]{64}", expected_ca_sha256):
            print("CA_FILE_POLICY=BLOCKED_INVALID_DIGEST")
            return 78
        try:
            ca_bytes = Path(ca_file).read_bytes()
            if hashlib.sha256(ca_bytes).hexdigest() != expected_ca_sha256 or (
                not ca_bytes.startswith(b"-----BEGIN CERTIFICATE-----")
            ):
                print("CA_FILE_POLICY=BLOCKED_SHA256_OR_FORMAT")
                return 78
        except (OSError, ValueError):
            print("CA_FILE_POLICY=BLOCKED_MISSING")
            return 78
        print("CA_FILE_POLICY=PASS_PINNED_CANDIDATE")
    else:
        print("CA_FILE_POLICY=SYSTEM_ROOTS_ONLY")
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
    connected = False
    certificate_issue = None
    handshake_issue = False
    for family, kind, proto, sockaddr in global_targets[:4]:
        try:
            with socket.socket(family, kind, proto) as plain:
                plain.settimeout(5.0)
                plain.connect(sockaddr)
                connected = True
                plain.sendall(SSL_REQUEST)
                if plain.recv(1) != b"S":
                    continue
                negotiated = True
                with ssl.create_default_context(cafile=ca_file).wrap_socket(plain, server_hostname=host) as secure:
                    protocol = secure.version()
                    if protocol not in ("TLSv1.2", "TLSv1.3"):
                        continue
                    print("PG_TCP=PASS")
                    print("PG_STARTTLS=PASS")
                    print("PG_TLS_CA_HOSTNAME=PASS")
                    print("PG_TLS_PROTOCOL=" + protocol)
                    print("AUTHENTICATED_LIBPQ_PREFLIGHT=NOT_RUN")
                    return 0
        except ssl.SSLCertVerificationError as exc:
            # Certificate metadata only. No passwords, certificates, bodies or SQL.
            certificate_issue = (exc.verify_code, exc.verify_message)
        except ssl.SSLError:
            handshake_issue = True
        except (OSError, ValueError):
            continue
    print("PG_TCP=" + ("PASS" if connected else "NOT_VERIFIED"))
    print("PG_STARTTLS=" + ("PASS" if negotiated else "NOT_VERIFIED"))
    if certificate_issue is not None:
        print("PG_TLS_VERIFY_ERROR_CODE=" + str(certificate_issue[0]))
        # Closed vocabulary prevents arbitrary peer text from reaching public CI logs.
        reason = str(certificate_issue[1]).lower()
        if "unable to get local issuer" in reason:
            kind = "CA_CHAIN_NOT_TRUSTED"
        elif "self-signed" in reason:
            kind = "SELF_SIGNED_CERTIFICATE"
        elif "hostname" in reason or "ip address mismatch" in reason:
            kind = "HOSTNAME_MISMATCH"
        elif "expired" in reason:
            kind = "CERTIFICATE_EXPIRED"
        else:
            kind = "CERTIFICATE_VERIFICATION_FAILED"
        print("PG_TLS_VERIFY_FAILURE_CLASS=" + kind)
    elif handshake_issue:
        print("PG_TLS_VERIFY_FAILURE_CLASS=TLS_HANDSHAKE_ERROR")
    else:
        print("PG_TLS_VERIFY_FAILURE_CLASS=UNKNOWN")
    print("PG_TLS_CA_HOSTNAME=NOT_VERIFIED")
    return 78

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Credential-free PostgreSQL Session pooler TLS/CA/hostname verification")
    parser.add_argument("--host", required=True, help="ONLY the hostname from the Supabase commercial Connect > Session pooler panel")
    parser.add_argument("--ca-file", help="Public Supabase Root CA file; TLS-only candidate")
    parser.add_argument("--ca-sha256", help="Expected exact SHA-256 of the CA file")
    args = parser.parse_args()
    raise SystemExit(run(args.host, args.ca_file, args.ca_sha256))

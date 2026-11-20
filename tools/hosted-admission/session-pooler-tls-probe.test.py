#!/usr/bin/env python3
"""Offline, synthetic tests. No DNS requests, DB access or credentials."""
import importlib.util
import pathlib
import socket
import unittest

MODULE = pathlib.Path(__file__).with_name("session-pooler-tls-probe.py")
spec = importlib.util.spec_from_file_location("neroxa_pooler_probe", MODULE)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)

class PoolerHostnamePolicy(unittest.TestCase):
    def test_valid_documented_hostnames(self):
        for host in ("aws-0-us-east-1.pooler.supabase.com",
                     "aws-1-sa-east-1.pooler.supabase.com",
                     "session-2.pooler.supabase.com"):
            with self.subTest(host=host):
                self.assertTrue(probe.valid_host(host))

    def test_invalid_hostnames(self):
        for host in (
            "", "localhost", "pooler.supabase.com",
            "db.iefaoaqzltvpfabyeelj.supabase.co",
            "postgresql://aws-0-us-east-1.pooler.supabase.com",
            "aws-0-us-east-1.pooler.supabase.com:5432",
            "aws-0-us-east-1.pooler.supabase.com:6543",
            "aws-0-us-east-1.pooler.supabase.com.evil.net",
            "aws_0.pooler.supabase.com",
            "a..pooler.supabase.com",
            "-x.pooler.supabase.com",
            "x-.pooler.supabase.com",
            "x.pooler.supabase.com/path",
            "x.POOLER.supabase.com",
            "x.pooler.supabase.com\n",
        ):
            with self.subTest(host=host):
                self.assertFalse(probe.valid_host(host))

    def test_only_public_addresses_can_be_dialed(self):
        self.assertTrue(probe.global_address(socket.AF_INET, ("8.8.8.8", 5432)))
        self.assertTrue(probe.global_address(socket.AF_INET6, ("2606:4700:4700::1111", 5432, 0, 0)))
        for family, addr in (
            (socket.AF_INET, ("127.0.0.1", 5432)),
            (socket.AF_INET, ("10.0.0.12", 5432)),
            (socket.AF_INET, ("169.254.20.2", 5432)),
            (socket.AF_INET, ("192.168.1.3", 5432)),
            (socket.AF_INET6, ("::1", 5432, 0, 0)),
            (socket.AF_INET6, ("fc00::1", 5432, 0, 0)),
            (socket.AF_INET, ("::1", 5432)),
        ):
            with self.subTest(addr=addr):
                self.assertFalse(probe.global_address(family, addr))

    def test_fixed_session_port(self):
        self.assertEqual(probe.PORT, 5432)
        self.assertEqual(probe.SSL_REQUEST, b"\x00\x00\x00\x08\x04\xd2\x16\x2f")

if __name__ == "__main__":
    unittest.main()

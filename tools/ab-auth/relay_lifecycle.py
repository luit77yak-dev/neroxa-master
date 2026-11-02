"""PIDFD-scoped relay identity, termination and exit-state checks for the disposable runner."""
import argparse
import hashlib
import json
import os
import pathlib
import select
import signal
import sys
import time

WORKSPACE = os.environ.get("GITHUB_WORKSPACE", os.getcwd())
SCRIPT = "tools/ab-auth/docker_loopback.py"


def current(pid):
    proc = pathlib.Path("/proc") / str(pid)
    raw = (proc / "stat").read_text()
    fields = raw[raw.rfind(")") + 2 :].split()
    argv = (proc / "cmdline").read_bytes().rstrip(b"\0").split(b"\0")
    return {
        "pid": pid,
        "start_ticks": fields[19],
        "argv_sha256": hashlib.sha256(b"\0".join(argv)).hexdigest(),
        "cwd": os.readlink(proc / "cwd"),
        "state": fields[0],
    }


def capture(pid, output):
    identity = current(pid)
    argv = (pathlib.Path("/proc") / str(pid) / "cmdline").read_bytes().rstrip(b"\0").split(b"\0")
    assert len(argv) >= 2 and argv[1].decode() == SCRIPT, "unexpected relay executable identity"
    assert identity["cwd"] == WORKSPACE, "unexpected relay working directory"
    identity.pop("state")
    pathlib.Path(output).write_text(json.dumps(identity, separators=(",", ":")) + "\n")
    print(json.dumps({"status": "CAPTURED", **identity}, sort_keys=True))


def stop(receipt, parent_reap):
    expected = json.loads(pathlib.Path(receipt).read_text())
    pid = int(expected["pid"])
    if not callable(getattr(os, "pidfd_open", None)) or not callable(getattr(signal, "pidfd_send_signal", None)):
        print("UNKNOWN")
        return 2
    try:
        pidfd = os.pidfd_open(pid, 0)
    except ProcessLookupError:
        print("ABSENT")
        return 0
    except OSError:
        print("UNKNOWN")
        return 2
    try:
        try:
            observed = current(pid)
        except FileNotFoundError:
            print("ABSENT")
            return 0
        if any(observed.get(key) != expected.get(key) for key in ("pid", "start_ticks", "argv_sha256", "cwd")):
            print("UNKNOWN")
            return 2
        if observed["state"] == "Z":
            print("REAP_REQUIRED" if parent_reap else "ZOMBIE")
            return 0 if parent_reap else 2
        try:
            signal.pidfd_send_signal(pidfd, signal.SIGTERM)
        except ProcessLookupError:
            print("ABSENT")
            return 0
        poller = select.poll()
        poller.register(pidfd, select.POLLIN)
        if not poller.poll(10000):
            print("TIMEOUT")
            return 1
        for _ in range(30):
            try:
                observed = current(pid)
            except FileNotFoundError:
                print("ABSENT")
                return 0
            if observed["state"] == "Z":
                if parent_reap:
                    print("REAP_REQUIRED")
                    return 0
                print("ZOMBIE")
                return 2
            time.sleep(0.1)
        print("UNKNOWN")
        return 2
    finally:
        os.close(pidfd)


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="action", required=True)
    cap = sub.add_parser("capture")
    cap.add_argument("pid", type=int)
    cap.add_argument("output")
    end = sub.add_parser("stop")
    end.add_argument("receipt")
    end.add_argument("--parent-reap", action="store_true")
    args = parser.parse_args()
    if args.action == "capture":
        capture(args.pid, args.output)
        return 0
    return stop(args.receipt, args.parent_reap)


if __name__ == "__main__":
    sys.exit(main())

"""Prove that the focal UID cannot enumerate or open the privileged workdir."""
import errno
import os
import pathlib
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: probe_private_workdir.py AB_WORKDIR")
root = pathlib.Path(sys.argv[1])
try:
    os.listdir(root)
except PermissionError:
    pass
else:
    raise SystemExit("FAIL: focal UID can enumerate AB_WORKDIR")
try:
    fd = os.open(root / "status.private.env", os.O_RDONLY)
except PermissionError as exc:
    if exc.errno not in (errno.EACCES, errno.EPERM):
        raise SystemExit("UNKNOWN: private file access denied for an unexpected reason")
else:
    os.close(fd)
    raise SystemExit("FAIL: focal UID can open status.private.env")
print("WORKDIR_ACCESS=DENIED under focal UID")

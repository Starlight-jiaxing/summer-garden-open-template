"""Create or reset the private guestbook administrator credential."""

import argparse
import getpass
import hashlib
import json
import os
import secrets
import sys
import tempfile
from pathlib import Path


DATA_DIR = Path(os.environ.get("GUESTBOOK_DATA_DIR", str(Path(__file__).resolve().parent / "data")))
AUTH_FILE = DATA_DIR / "admin-auth.json"
ITERATIONS = 600_000


def read_password() -> str:
    if sys.stdin.isatty():
        password = getpass.getpass("站主管理密码（至少 16 个字符）：")
        confirmation = getpass.getpass("再输入一次：")
        if password != confirmation:
            raise SystemExit("两次输入不一致。")
        return password
    return sys.stdin.readline().rstrip("\r\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reset", action="store_true", help="替换现有密码并让当前管理会话失效")
    args = parser.parse_args()
    if AUTH_FILE.exists() and not args.reset:
        print("管理密码已存在；如需重置，请使用 --reset。", file=sys.stderr)
        return 2

    password = read_password()
    if len(password) < 16:
        print("管理密码至少需要 16 个字符。", file=sys.stderr)
        return 2

    DATA_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    salt = secrets.token_bytes(16)
    record = {
        "version": 1,
        "passwordSalt": salt.hex(),
        "passwordHash": hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS, dklen=32).hex(),
        "passwordIterations": ITERATIONS,
        "sessionSecret": secrets.token_bytes(32).hex(),
    }
    fd, temporary = tempfile.mkstemp(prefix="admin-auth-", suffix=".tmp", dir=DATA_DIR)
    try:
        if hasattr(os, "fchmod"):
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as target:
            json.dump(record, target, separators=(",", ":"))
            target.write("\n")
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, AUTH_FILE)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print("站主管理密码已设置。" if not args.reset else "站主管理密码已重置，旧会话已失效。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

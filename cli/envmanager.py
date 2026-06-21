#!/usr/bin/env python3
"""
ENV Manager CLI — manage multi-cloud secrets from the terminal.

Usage:
    envmanager login
    envmanager logout
    envmanager projects list
    envmanager projects create <name> --provider aws|azure|gcp --region us-east-1
    envmanager envs list <project-slug>
    envmanager envs create <project-id> <env-name> --type production
    envmanager pull <project-id> <env-id> [--output .env]
    envmanager push <project-id> <env-id> <.env-file> [--overwrite]
    envmanager secrets list <project-id> <env-id> [--reveal]
    envmanager secrets set <project-id> <env-id> KEY=VALUE
    envmanager secrets delete <project-id> <env-id> KEY
"""

import argparse
import json
import os
import sys
import getpass
from pathlib import Path
from typing import Optional
import urllib.request
import urllib.error

CONFIG_FILE = Path.home() / ".envmanager" / "config.json"
DEFAULT_API = os.getenv("ENV_MANAGER_API", "http://localhost:8000/api/v1")


# ─── HTTP helpers ────────────────────────────────────────────────────────────

def _request(method: str, path: str, data: Optional[dict] = None, token: Optional[str] = None) -> dict:
    url = DEFAULT_API.rstrip("/") + path
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            detail = json.loads(body).get("detail", body)
        except Exception:
            detail = body
        print(f"\033[31mError {e.code}: {detail}\033[0m", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"\033[31mConnection error: {e.reason}\nIs the server running at {DEFAULT_API}?\033[0m", file=sys.stderr)
        sys.exit(1)


# ─── Auth helpers ─────────────────────────────────────────────────────────────

def _load_config() -> dict:
    if CONFIG_FILE.exists():
        return json.loads(CONFIG_FILE.read_text())
    return {}


def _save_config(cfg: dict) -> None:
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))
    CONFIG_FILE.chmod(0o600)


def _token() -> str:
    cfg = _load_config()
    token = cfg.get("token")
    if not token:
        print("\033[31mNot logged in. Run: envmanager login\033[0m", file=sys.stderr)
        sys.exit(1)
    return token


# ─── Commands ─────────────────────────────────────────────────────────────────

def cmd_login(args):
    email = args.email or input("Email: ")
    password = args.password or getpass.getpass("Password: ")
    resp = _request("POST", "/auth/login", {"email": email, "password": password})
    cfg = _load_config()
    cfg["token"] = resp["access_token"]
    cfg["user"] = resp["user"]
    _save_config(cfg)
    user = resp["user"]
    print(f"\033[32mLogged in as {user['full_name']} ({user['role']})\033[0m")


def cmd_logout(args):
    cfg = _load_config()
    cfg.pop("token", None)
    cfg.pop("user", None)
    _save_config(cfg)
    print("Logged out.")


def cmd_projects_list(args):
    projects = _request("GET", "/projects", token=_token())
    if not projects:
        print("No projects found.")
        return
    print(f"\033[1m{'Name':<30} {'Provider':<12} {'Region':<15} {'Envs':<6} ID\033[0m")
    print("─" * 90)
    for p in projects:
        print(f"{p['name']:<30} {p['cloud_provider'].upper():<12} {(p['region'] or '—'):<15} {p['environment_count']:<6} {p['id']}")


def cmd_projects_create(args):
    data = {"name": args.name, "cloud_provider": args.provider or "aws"}
    if args.region:
        data["region"] = args.region
    if args.host:
        data["server_host"] = args.host
    if args.description:
        data["description"] = args.description
    p = _request("POST", "/projects", data=data, token=_token())
    print(f"\033[32mProject created: {p['name']} (ID: {p['id']})\033[0m")


def cmd_envs_list(args):
    envs = _request("GET", f"/projects/{args.project_id}/environments", token=_token())
    if not envs:
        print("No environments.")
        return
    print(f"\033[1m{'Name':<25} {'Type':<15} {'Secrets':<10} ID\033[0m")
    print("─" * 80)
    for e in envs:
        print(f"{e['name']:<25} {e['env_type']:<15} {e['secret_count']:<10} {e['id']}")


def cmd_envs_create(args):
    data = {"name": args.name, "env_type": args.type or "development"}
    e = _request("POST", f"/projects/{args.project_id}/environments", data=data, token=_token())
    print(f"\033[32mEnvironment created: {e['name']} (ID: {e['id']})\033[0m")


def cmd_pull(args):
    """Pull all secrets and write to a .env file."""
    url = f"/projects/{args.project_id}/environments/{args.env_id}/secrets/export/dotenv"
    import urllib.request as ur
    api_url = DEFAULT_API.rstrip("/") + url
    req = ur.Request(api_url, headers={"Authorization": f"Bearer {_token()}"})
    try:
        with ur.urlopen(req) as resp:
            content = resp.read().decode()
    except urllib.error.HTTPError as e:
        print(f"\033[31mError {e.code}: {e.read().decode()}\033[0m", file=sys.stderr)
        sys.exit(1)

    output = args.output or ".env"
    Path(output).write_text(content)
    lines = [l for l in content.splitlines() if l and not l.startswith("#")]
    print(f"\033[32mPulled {len(lines)} variables to {output}\033[0m")


def cmd_push(args):
    """Push a .env file to the environment."""
    env_file = Path(args.file)
    if not env_file.exists():
        print(f"\033[31mFile not found: {args.file}\033[0m", file=sys.stderr)
        sys.exit(1)
    content = env_file.read_text()
    data = {"env_content": content}
    overwrite = "true" if args.overwrite else "false"
    resp = _request(
        "POST",
        f"/projects/{args.project_id}/environments/{args.env_id}/secrets/import/dotenv?overwrite={overwrite}",
        data=data,
        token=_token(),
    )
    print(f"\033[32mPushed: {resp.get('created',0)} created, {resp.get('updated',0)} updated, {resp.get('skipped',0)} skipped\033[0m")


def cmd_secrets_list(args):
    url = f"/projects/{args.project_id}/environments/{args.env_id}/secrets"
    if args.reveal:
        url += "?reveal=true"
    secrets = _request("GET", url, token=_token())
    if not secrets:
        print("No secrets.")
        return
    print(f"\033[1m{'Key':<35} {'Value':<40} {'Ver':<5} Sensitive\033[0m")
    print("─" * 90)
    for s in secrets:
        val = s.get("value") or "••••••••"
        print(f"{s['key']:<35} {val:<40} {s['version']:<5} {'yes' if s['is_sensitive'] else 'no'}")


def cmd_secrets_set(args):
    if "=" not in args.kv:
        print("\033[31mFormat: KEY=VALUE\033[0m", file=sys.stderr)
        sys.exit(1)
    key, _, value = args.kv.partition("=")
    key = key.strip().upper()
    url = f"/projects/{args.project_id}/environments/{args.env_id}/secrets"
    secrets = _request("GET", url, token=_token())
    existing = next((s for s in secrets if s["key"] == key), None)
    if existing:
        _request("PATCH", f"{url}/{existing['id']}", data={"value": value}, token=_token())
        print(f"\033[32mUpdated {key}\033[0m")
    else:
        _request("POST", url, data={"key": key, "value": value, "is_sensitive": True}, token=_token())
        print(f"\033[32mCreated {key}\033[0m")


def cmd_secrets_delete(args):
    url = f"/projects/{args.project_id}/environments/{args.env_id}/secrets"
    secrets = _request("GET", url, token=_token())
    target = next((s for s in secrets if s["key"] == args.key.upper()), None)
    if not target:
        print(f"\033[31mKey not found: {args.key}\033[0m", file=sys.stderr)
        sys.exit(1)
    confirm = input(f"Delete {args.key}? [y/N] ")
    if confirm.lower() != "y":
        print("Aborted.")
        return
    _request("DELETE", f"{url}/{target['id']}", token=_token())
    print(f"\033[32mDeleted {args.key}\033[0m")


# ─── Parser ──────────────────────────────────────────────────────────────────

def build_parser():
    parser = argparse.ArgumentParser(
        prog="envmanager",
        description="Multi-Cloud ENV Manager CLI"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # login
    p_login = sub.add_parser("login")
    p_login.add_argument("--email", default="")
    p_login.add_argument("--password", default="")
    p_login.set_defaults(func=cmd_login)

    # logout
    p_logout = sub.add_parser("logout")
    p_logout.set_defaults(func=cmd_logout)

    # projects
    p_proj = sub.add_parser("projects")
    proj_sub = p_proj.add_subparsers(dest="subcommand", required=True)

    p_proj_list = proj_sub.add_parser("list")
    p_proj_list.set_defaults(func=cmd_projects_list)

    p_proj_create = proj_sub.add_parser("create")
    p_proj_create.add_argument("name")
    p_proj_create.add_argument("--provider", choices=["aws", "azure", "gcp", "on_premise", "multi_cloud"], default="aws")
    p_proj_create.add_argument("--region", default="")
    p_proj_create.add_argument("--host", default="")
    p_proj_create.add_argument("--description", default="")
    p_proj_create.set_defaults(func=cmd_projects_create)

    # envs
    p_envs = sub.add_parser("envs")
    envs_sub = p_envs.add_subparsers(dest="subcommand", required=True)

    p_envs_list = envs_sub.add_parser("list")
    p_envs_list.add_argument("project_id")
    p_envs_list.set_defaults(func=cmd_envs_list)

    p_envs_create = envs_sub.add_parser("create")
    p_envs_create.add_argument("project_id")
    p_envs_create.add_argument("name")
    p_envs_create.add_argument("--type", choices=["development", "staging", "production", "testing", "custom"], default="development")
    p_envs_create.set_defaults(func=cmd_envs_create)

    # pull
    p_pull = sub.add_parser("pull", help="Pull secrets as .env file")
    p_pull.add_argument("project_id")
    p_pull.add_argument("env_id")
    p_pull.add_argument("--output", "-o", default=".env")
    p_pull.set_defaults(func=cmd_pull)

    # push
    p_push = sub.add_parser("push", help="Push .env file to environment")
    p_push.add_argument("project_id")
    p_push.add_argument("env_id")
    p_push.add_argument("file")
    p_push.add_argument("--overwrite", action="store_true")
    p_push.set_defaults(func=cmd_push)

    # secrets
    p_secrets = sub.add_parser("secrets")
    secrets_sub = p_secrets.add_subparsers(dest="subcommand", required=True)

    p_sec_list = secrets_sub.add_parser("list")
    p_sec_list.add_argument("project_id")
    p_sec_list.add_argument("env_id")
    p_sec_list.add_argument("--reveal", action="store_true")
    p_sec_list.set_defaults(func=cmd_secrets_list)

    p_sec_set = secrets_sub.add_parser("set")
    p_sec_set.add_argument("project_id")
    p_sec_set.add_argument("env_id")
    p_sec_set.add_argument("kv", metavar="KEY=VALUE")
    p_sec_set.set_defaults(func=cmd_secrets_set)

    p_sec_del = secrets_sub.add_parser("delete")
    p_sec_del.add_argument("project_id")
    p_sec_del.add_argument("env_id")
    p_sec_del.add_argument("key")
    p_sec_del.set_defaults(func=cmd_secrets_delete)

    return parser


if __name__ == "__main__":
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)

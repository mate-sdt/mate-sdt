#!/usr/bin/env python3
"""
M.A.T.E. Method - Mutation Testing Runner (run_mutation_podman.py)
Executes Stryker Mutator in an isolated container sandbox (Podman or Docker) or native host.
Enforces the M.A.T.E. threshold: Mutation Score >= 85%.

Usage:
    python run_mutation_podman.py [PROJECT_DIR] [--config CONFIG_PATH] [--runtime podman|docker|none]
"""

import sys
import os
import json
import subprocess
import argparse
from pathlib import Path


def detect_runtime(project_dir: Path, requested_runtime: str = None) -> str:
    if requested_runtime and requested_runtime.lower() in ("podman", "docker", "none"):
        return requested_runtime.lower()

    config_file = project_dir / ".mate" / "config.json"
    if config_file.exists():
        try:
            with open(config_file, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                rt = cfg.get("containerRuntime", "").lower()
                if rt in ("podman", "docker", "none"):
                    return rt
        except Exception:
            pass

    # Auto-detection
    for cmd in ("podman", "docker"):
        try:
            res = subprocess.run([cmd, "--version"], capture_output=True, text=True)
            if res.returncode == 0:
                return cmd
        except FileNotFoundError:
            pass

    return "none"


def run_mutation(project_dir: Path, config_file: str, requested_runtime: str = None) -> int:
    project_dir = project_dir.resolve()
    runtime = detect_runtime(project_dir, requested_runtime)

    print("💣 [M.A.T.E. Pillar T] Launching Mutation Testing Suite...")
    print(f"📁 Target Project:   {project_dir}")
    print(f"⚙️ Config File:      {config_file}")
    print(f"🐳 Container Engine: {runtime.upper()}\n")

    if runtime == "podman":
        try:
            version_check = subprocess.run(["podman", "--version"], capture_output=True, text=True, check=True)
            print(f"🐳 Podman Engine: {version_check.stdout.strip()}")
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("❌ Error: 'podman' is configured but not found in PATH.")
            return 1

        cmd = [
            "podman", "run", "--rm",
            "-v", f"{project_dir}:/app:Z",
            "-w", "/app",
            "node:20-alpine",
            "sh", "-c", f"npm install --legacy-peer-deps && npx stryker run {config_file}"
        ]
    elif runtime == "docker":
        try:
            version_check = subprocess.run(["docker", "--version"], capture_output=True, text=True, check=True)
            print(f"🐳 Docker Engine: {version_check.stdout.strip()}")
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("❌ Error: 'docker' is configured but not found in PATH or daemon is not running.")
            return 1

        cmd = [
            "docker", "run", "--rm",
            "-v", f"{project_dir}:/app",
            "-w", "/app",
            "node:20-alpine",
            "sh", "-c", f"npm install --legacy-peer-deps && npx stryker run {config_file}"
        ]
    else:
        print("ℹ️ No container sandbox configured ('none'). Running Stryker directly on host...")
        npx_cmd = "npx.cmd" if sys.platform == "win32" else "npx"
        cmd = [npx_cmd, "stryker", "run", config_file]

    print(f"🚀 Executing:\n   {' '.join(cmd)}\n")

    try:
        result = subprocess.run(cmd, cwd=str(project_dir))
        if result.returncode == 0:
            print("\n✅ [Pillar T Passed] Mutation Score meets the >= 85% M.A.T.E. threshold!")
        else:
            print(f"\n❌ [Pillar T Failed] Mutation testing failed or score fell below 85% threshold.")
        return result.returncode
    except KeyboardInterrupt:
        print("\n⚠️ Mutation test interrupted by user.")
        return 130


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Stryker Mutation Testing inside Podman, Docker, or Host.")
    parser.add_argument("project_dir", nargs="?", default=".", help="Root directory of the project")
    parser.add_argument("--config", default="stryker.config.json", help="Path to stryker.config.json")
    parser.add_argument("--runtime", choices=["podman", "docker", "none"], default=None, help="Container runtime")
    args = parser.parse_args()

    sys.exit(run_mutation(Path(args.project_dir), args.config, args.runtime))

#!/usr/bin/env python3
"""Verify reproducibility pins without printing environment or credential data."""

from __future__ import annotations

import argparse
import json
import re
import tomllib
from importlib import metadata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NAME_SEPARATOR = re.compile(r"[-_.]+")
EXACT_REQUIREMENT = re.compile(r"^([A-Za-z0-9_.-]+)==([^\s]+)$")
VCS_REQUIREMENT = re.compile(
    r"^([A-Za-z0-9_.-]+)\s+@\s+git\+https://github\.com/([^@]+)@([0-9a-f]{40})$"
)
ACTION_PIN = re.compile(r"^\s*uses:\s*[^\s@]+@([0-9a-f]{40})(?:\s+#.*)?$")

EXPECTED_NPM = {"genlayer": "0.39.2", "genlayer-js": "1.1.8"}
EXPECTED_VCS = {
    "genlayer-py": (
        "genlayerlabs/genlayer-py",
        "a3dc35e04898e3889cbfa855bcaf7d2664675b8f",
    ),
    "genlayer-test": (
        "genlayerlabs/genlayer-testing-suite",
        "9c09578b143905471fb0657dd53bdaf18da8e35f",
    ),
    "genvm-linter": (
        "genlayerlabs/genvm-linter",
        "fa4a4d4536b28fdc2730e13a983ba01b69ccc6f3",
    ),
}
EXPECTED_DIRECT = {
    "cloudpickle": "3.1.1",
    "pytest": "8.3.3",
    "python-dotenv": "1.1.0",
    "pyyaml": "6.0.3",
    "web3": "7.13.0",
    "click": "8.3.1",
    "numpy": "2.2.6",
    "pyright": "1.1.408",
}


def canonical_name(value: str) -> str:
    return NAME_SEPARATOR.sub("-", value).lower()


def non_comment_lines(path: Path) -> list[str]:
    return [
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def parse_requirements(lines: list[str]) -> tuple[dict[str, str], dict[str, tuple[str, str]]]:
    exact: dict[str, str] = {}
    vcs: dict[str, tuple[str, str]] = {}
    for line in lines:
        vcs_match = VCS_REQUIREMENT.fullmatch(line)
        if vcs_match:
            name = canonical_name(vcs_match.group(1))
            if name in exact or name in vcs:
                raise AssertionError(f"duplicate Python requirement: {name}")
            vcs[name] = (vcs_match.group(2), vcs_match.group(3))
            continue
        exact_match = EXACT_REQUIREMENT.fullmatch(line)
        if exact_match:
            name = canonical_name(exact_match.group(1))
            if name in exact or name in vcs:
                raise AssertionError(f"duplicate Python requirement: {name}")
            exact[name] = exact_match.group(2)
            continue
        raise AssertionError(f"Python requirement is not exactly pinned: {line}")
    return exact, vcs


def check_npm() -> None:
    package_json = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    package_lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    lock_root = package_lock.get("packages", {}).get("", {})
    for name, expected in EXPECTED_NPM.items():
        declared = package_json.get("dependencies", {}).get(name)
        if declared is None:
            declared = package_json.get("devDependencies", {}).get(name)
        locked = lock_root.get("dependencies", {}).get(name)
        if locked is None:
            locked = lock_root.get("devDependencies", {}).get(name)
        if declared != expected or locked != expected:
            raise AssertionError(f"{name} must be exactly pinned to {expected}")


def check_python_manifests() -> dict[str, str]:
    exact, vcs = parse_requirements(non_comment_lines(ROOT / "requirements.txt"))
    if exact != EXPECTED_DIRECT:
        raise AssertionError("requirements.txt direct version pins do not match the reviewed set")
    if vcs != EXPECTED_VCS:
        raise AssertionError("requirements.txt GenLayer source commits do not match the reviewed set")

    constraint_exact, constraint_vcs = parse_requirements(
        non_comment_lines(ROOT / "constraints.txt")
    )
    if constraint_vcs:
        raise AssertionError("constraints.txt must contain version pins only")
    for name, expected in EXPECTED_DIRECT.items():
        if constraint_exact.get(name) != expected:
            raise AssertionError(f"constraints.txt does not pin {name} to {expected}")

    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    project_exact, project_vcs = parse_requirements(pyproject["project"]["dependencies"])
    if project_exact != exact or project_vcs != vcs:
        raise AssertionError("pyproject.toml dependencies differ from requirements.txt")
    if pyproject["build-system"]["requires"] != ["setuptools==80.9.0"]:
        raise AssertionError("the Python build backend is not exactly pinned")
    return constraint_exact


def check_action_pins() -> None:
    workflow = ROOT / ".github" / "workflows" / "ci.yml"
    uses_lines = [
        line for line in workflow.read_text(encoding="utf-8").splitlines() if "uses:" in line
    ]
    if not uses_lines or any(ACTION_PIN.fullmatch(line) is None for line in uses_lines):
        raise AssertionError("every GitHub Action must use an immutable 40-character revision")


def check_installed(constraints: dict[str, str]) -> None:
    from packaging.requirements import Requirement

    queue = list(EXPECTED_VCS) + list(EXPECTED_DIRECT)
    visited: set[str] = set()
    while queue:
        name = canonical_name(queue.pop())
        if name in visited:
            continue
        visited.add(name)
        distribution = metadata.distribution(name)
        if name not in EXPECTED_VCS:
            expected = constraints.get(name)
            if expected is None:
                raise AssertionError(f"installed dependency lacks a constraint pin: {name}")
            if distribution.version != expected:
                raise AssertionError(
                    f"installed {name} is {distribution.version}, expected {expected}"
                )
        for raw_requirement in distribution.requires or []:
            requirement = Requirement(raw_requirement)
            if requirement.marker is not None and not requirement.marker.evaluate():
                continue
            queue.append(requirement.name)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--installed",
        action="store_true",
        help="also verify the installed Python dependency closure",
    )
    args = parser.parse_args()

    check_npm()
    constraints = check_python_manifests()
    check_action_pins()
    if args.installed:
        check_installed(constraints)
    print("dependency and action pins: PASS")


if __name__ == "__main__":
    main()

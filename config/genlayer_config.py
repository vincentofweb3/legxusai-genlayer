from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


CONFIG_PATH = Path(__file__).with_name("genlayer_config.json")


def get_project_config() -> dict[str, Any]:
    with CONFIG_PATH.open(encoding="utf-8") as config_file:
        return json.load(config_file)


def get_config(environment: str | None = None) -> dict[str, Any]:
    project_config = get_project_config()
    requested_environment = (
        environment if environment is not None else os.environ.get("GENLAYER_ENV", "")
    ).strip().lower()

    if not requested_environment:
        raise RuntimeError("Set GENLAYER_ENV to studio or bradbury.")

    networks = project_config["environments"]
    if requested_environment not in networks:
        raise ValueError(
            f"Unsupported GENLAYER_ENV: {requested_environment}. Use studio or bradbury."
        )

    return {
        "environment": requested_environment,
        "network": dict(networks[requested_environment]),
        "toolchain": dict(project_config["toolchain"]),
    }

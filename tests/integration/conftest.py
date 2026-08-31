"""Shared fixtures for the read-only Studio integration suite.

The suite deliberately uses the public JSON-RPC surface instead of account or
transaction fixtures.  It verifies already-reviewed public transactions and
canonical reads, so it never signs, deploys, or mutates network state.
"""

from __future__ import annotations

import http.client
import json
import socket
import ssl
import time
from base64 import b64decode
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import pytest


ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "deployments" / "studio.json"
READ_FROM = "0x0000000000000000000000000000000000000001"
RPC_TIMEOUT_SECONDS = 15
RPC_ATTEMPTS = 2
RPC_RETRY_DELAY_SECONDS = 1
RPC_USER_AGENT = "LegxusAI-ReadOnly-Integration/1.0"


class StudioUnavailable(RuntimeError):
    """Raised only when the configured public Studio transport is unavailable."""


def load_manifest() -> dict[str, Any]:
    with MANIFEST_PATH.open(encoding="utf-8") as manifest_file:
        manifest = json.load(manifest_file)
    if not isinstance(manifest, dict):
        raise AssertionError("Studio deployment manifest must be an object")
    return manifest


_TRANSPORT_ERRORS = (
    TimeoutError,
    socket.timeout,
    socket.gaierror,
    ConnectionError,
    http.client.RemoteDisconnected,
    ssl.SSLError,
)


def _transport_error(error: BaseException) -> bool:
    """Return true only for errors that mean the external transport is unavailable."""

    if isinstance(error, HTTPError):
        return error.code in {502, 503, 504}
    if isinstance(error, URLError):
        return _transport_error(error.reason)
    return isinstance(error, _TRANSPORT_ERRORS)


def rpc_call(rpc_url: str, method: str, params: list[Any]) -> Any:
    """Perform a bounded JSON-RPC read without logging response bodies."""

    request_body = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    ).encode("utf-8")
    last_transport_error: BaseException | None = None
    for attempt in range(RPC_ATTEMPTS):
        try:
            request = Request(
                rpc_url,
                data=request_body,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": RPC_USER_AGENT,
                },
                method="POST",
            )
            with urlopen(request, timeout=RPC_TIMEOUT_SECONDS) as response:
                response_body = json.loads(response.read().decode("utf-8"))
        except Exception as error:  # noqa: BLE001 - classify transport only
            if not _transport_error(error):
                raise
            last_transport_error = error
            if attempt + 1 < RPC_ATTEMPTS:
                time.sleep(RPC_RETRY_DELAY_SECONDS)
                continue
            break

        if not isinstance(response_body, dict):
            raise AssertionError(f"Studio {method} response is not a JSON object")
        if response_body.get("error") is not None:
            # An RPC-level error is a protocol/fixture failure, not an outage.
            raise AssertionError(f"Studio {method} returned an RPC error")
        if "result" not in response_body:
            raise AssertionError(f"Studio {method} response has no result")
        return response_body["result"]

    detail = type(last_transport_error).__name__ if last_transport_error else "transport failure"
    raise StudioUnavailable(f"Studio RPC transport unavailable ({detail})")


def decode_result_bytes(value: Any, context: str) -> Any:
    """Decode a successful Studio GenVM result using the official calldata ABI."""

    from genlayer_py.abi import calldata

    if not isinstance(value, str):
        raise AssertionError(f"{context} result is not base64")
    try:
        payload = b64decode(value, validate=True)
    except Exception as error:  # noqa: BLE001 - convert to a test assertion
        raise AssertionError(f"{context} result is not valid base64") from error
    if len(payload) < 2 or payload[0] != 0:
        raise AssertionError(f"{context} did not contain a successful contract return")
    try:
        return calldata.decode(payload[1:])
    except Exception as error:  # noqa: BLE001 - convert to a test assertion
        raise AssertionError(f"{context} return is not valid GenLayer calldata") from error


@pytest.fixture(scope="session")
def studio_manifest() -> dict[str, Any]:
    manifest = load_manifest()
    if (
        manifest.get("environment") != "studio"
        or manifest.get("networkAlias") != "studionet"
        or manifest.get("chainId") != 61999
    ):
        raise AssertionError("Studio manifest does not select studionet chain 61999")
    if not isinstance(manifest.get("rpcUrl"), str) or not manifest["rpcUrl"]:
        raise AssertionError("Studio manifest has no RPC URL")
    if not isinstance(manifest.get("contractAddress"), str):
        raise AssertionError("Studio manifest has no contract address")
    return manifest


@pytest.fixture(scope="session")
def studio_rpc(studio_manifest: dict[str, Any]) -> dict[str, Any]:
    rpc_url = studio_manifest["rpcUrl"]
    try:
        chain_hex = rpc_call(rpc_url, "eth_chainId", [])
    except StudioUnavailable as error:
        pytest.skip(f"required Studio infrastructure unavailable: {error}")
    if not isinstance(chain_hex, str) or not chain_hex.startswith("0x"):
        raise AssertionError("Studio eth_chainId response is malformed")
    try:
        chain_id = int(chain_hex, 16)
    except ValueError as error:
        raise AssertionError("Studio eth_chainId response is not hexadecimal") from error
    if chain_id != 61999:
        raise AssertionError("configured Studio RPC is not chain 61999")
    return {"url": rpc_url, "contract": studio_manifest["contractAddress"]}


@pytest.fixture(scope="session")
def studio_rpc_call(studio_rpc: dict[str, Any]):
    def call(method: str, params: list[Any]) -> Any:
        try:
            return rpc_call(studio_rpc["url"], method, params)
        except StudioUnavailable as error:
            pytest.skip(f"required Studio infrastructure unavailable: {error}")

    return call


def gen_call(rpc: Any, contract: str, method: str, args: list[Any] | None = None) -> Any:
    """Issue a read-only GenLayer call and decode it with genlayer-py's ABI."""

    from genlayer_py.abi import calldata
    from genlayer_py.abi.transactions import serialize
    from genlayer_py.contracts.utils import make_calldata_object

    encoded_call = calldata.encode(make_calldata_object(method=method, args=args or []))
    serialized = serialize([encoded_call, b"\x00"])
    result = rpc(
        "gen_call",
        [
            {
                "type": "read",
                "to": contract,
                "from": READ_FROM,
                "data": serialized,
                "transaction_hash_variant": "latest-nonfinal",
            }
        ],
    )
    if not isinstance(result, str):
        raise AssertionError(f"Studio gen_call {method} result is malformed")
    encoded_result = result[2:] if result.startswith("0x") else result
    if not encoded_result or len(encoded_result) % 2:
        raise AssertionError(f"Studio gen_call {method} result is not byte-aligned")
    try:
        return calldata.decode(bytes.fromhex(encoded_result))
    except Exception as error:  # noqa: BLE001 - convert to a test assertion
        raise AssertionError(f"Studio gen_call {method} return is not valid calldata") from error

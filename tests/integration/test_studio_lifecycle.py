"""Read-only receipt and canonical-state checks for the verified Studio flow."""

from __future__ import annotations

import json
import ssl
from typing import Any
from urllib.error import HTTPError, URLError

import pytest

from . import conftest as studio_helpers
from .conftest import (
    RPC_USER_AGENT,
    StudioUnavailable,
    _transport_error,
    decode_result_bytes,
    gen_call,
    rpc_call,
)


pytestmark = pytest.mark.integration

PUBLIC_TRANSACTIONS = (
    (
        "file_dispute",
        "0x0d3c289df8bd3c2f141e9ff2e26858a5a0c766759b767b50f12d7d9574d1ed20",
        "file_dispute",
        "DSP-0001",
    ),
    (
        "accept_dispute",
        "0xb81751f7e393bdd2267ce6b2fc64d60263a23f481ef991c7db2154b4e55aa15f",
        "accept_dispute",
        True,
    ),
    (
        "evaluate",
        "0x0935963f09eeb8f83816a54e7526915d2345311e8535914473a8b09ad23e0dea",
        "evaluate",
        "UNDETERMINED",
    ),
)

QUORUM_MARKER = {
    "mode": "validator",
    "execution_result": "ERROR",
    "vote": "idle",
    "error_code": "CONSENSUS_VALIDATOR_QUORUM_REACHED",
}


def _as_zero(value: Any) -> bool:
    if value == 0:
        return True
    if isinstance(value, str) and value.startswith("0x"):
        try:
            return int(value, 16) == 0
        except ValueError:
            return False
    return False


def _decode_call(transaction: dict[str, Any]) -> tuple[str, list[Any]]:
    from genlayer_py.consensus.consensus_main import decode_tx_data
    from web3 import Web3

    raw = transaction.get("tx_data")
    if not isinstance(raw, str) or not raw:
        raise AssertionError("Studio transaction has no encoded call data")
    encoded = raw if raw.startswith("0x") else f"0x{raw}"
    try:
        decoded = decode_tx_data(Web3.to_bytes(hexstr=encoded))
    except Exception as error:  # noqa: BLE001 - convert to a test assertion
        raise AssertionError("Studio transaction call data is not decodable") from error
    call_data = decoded.get("call_data") if isinstance(decoded, dict) else None
    if not isinstance(call_data, dict) or not isinstance(call_data.get("method"), str):
        raise AssertionError("Studio transaction call data has no method")
    args = call_data.get("args", [])
    if not isinstance(args, list):
        raise AssertionError("Studio transaction call arguments are malformed")
    return call_data["method"], args


def _calldata_address(value: Any) -> str:
    as_hex = getattr(value, "as_hex", None)
    decoded = as_hex() if callable(as_hex) else as_hex
    if not isinstance(decoded, str):
        raise AssertionError("file_dispute respondent argument is not a calldata address")
    return decoded


def _assert_call_arguments(
    method: str,
    args: list[Any],
    dispute: dict[str, Any],
) -> None:
    if method == "file_dispute":
        if len(args) != 6:
            raise AssertionError("file_dispute call has an unexpected argument count")
        if args[0] != dispute.get("title") or args[1] != dispute.get("description"):
            raise AssertionError("file_dispute context does not match canonical state")
        if _calldata_address(args[2]).lower() != str(dispute.get("respondent", "")).lower():
            raise AssertionError("file_dispute respondent does not match canonical state")
        if args[3] != dispute.get("reference_amount") or args[4] != dispute.get("reference_currency"):
            raise AssertionError("file_dispute reference context does not match canonical state")
        if args[5] != dispute.get("evidence_references"):
            raise AssertionError("file_dispute evidence metadata does not match canonical state")
        return
    if method == "accept_dispute":
        if args != ["DSP-0001", dispute.get("respondent_evidence_references")]:
            raise AssertionError("accept_dispute arguments do not match canonical state")
        return
    if method == "evaluate":
        if args != ["DSP-0001"]:
            raise AssertionError("evaluate arguments do not target DSP-0001")
        return
    raise AssertionError("public hash is bound to an unsupported contract method")


def _receipt_returns(transaction: dict[str, Any], operation: str) -> list[Any]:
    consensus = transaction.get("consensus_data")
    if not isinstance(consensus, dict):
        raise AssertionError(f"{operation} receipt has no consensus_data")
    entries = consensus.get("leader_receipt")
    if isinstance(entries, dict):
        entries = [entries]
    if not isinstance(entries, list) or not entries:
        raise AssertionError(f"{operation} receipt has no leader_receipt entries")

    returns: list[Any] = []
    leader_count = 0
    marker_count = 0
    for entry in entries:
        if not isinstance(entry, dict):
            raise AssertionError(f"{operation} leader_receipt entry is malformed")
        mode = entry.get("mode")
        if mode not in {"leader", "validator"}:
            raise AssertionError(f"{operation} receipt has an unsupported execution mode")
        if mode == "leader":
            leader_count += 1
        if mode == "validator" and entry.get("execution_result") == "ERROR":
            result = entry.get("result")
            genvm_result = entry.get("genvm_result")
            marker = {
                "mode": mode,
                "execution_result": entry.get("execution_result"),
                "vote": entry.get("vote"),
                "error_code": genvm_result.get("error_code") if isinstance(genvm_result, dict) else None,
            }
            if marker != QUORUM_MARKER:
                raise AssertionError(f"{operation} receipt contains an unexpected validator error")
            marker_result = entry.get("result")
            if not isinstance(marker_result, str):
                raise AssertionError(f"{operation} quorum marker result is malformed")
            try:
                from base64 import b64decode

                marker_bytes = b64decode(marker_result, validate=True)
            except Exception as error:  # noqa: BLE001 - convert to a test assertion
                raise AssertionError(f"{operation} quorum marker result is not base64") from error
            if not marker_bytes or marker_bytes[0] != 2:
                raise AssertionError(f"{operation} quorum marker is not a GenVM contract-error result")
            marker_count += 1
            continue
        if entry.get("execution_result") != "SUCCESS":
            raise AssertionError(f"{operation} receipt execution did not succeed")
        if "result" not in entry:
            raise AssertionError(f"{operation} receipt entry has no result")
        returns.append(decode_result_bytes(entry["result"], operation))

    if leader_count != 1:
        raise AssertionError(f"{operation} receipt does not contain exactly one leader")
    if not returns:
        raise AssertionError(f"{operation} receipt has no successful return")
    if marker_count > 1:
        raise AssertionError(f"{operation} receipt has multiple quorum markers")
    return returns


def _assert_common_receipt(
    transaction: dict[str, Any],
    expected_hash: str,
    expected_method: str,
    contract: str,
    expected_sender: str,
    dispute: dict[str, Any],
) -> None:
    if not isinstance(transaction, dict):
        raise AssertionError("Studio transaction result is not an object")
    for field in ("hash", "tx_id"):
        value = transaction.get(field)
        if not isinstance(value, str) or value.lower() != expected_hash.lower():
            raise AssertionError(f"Studio transaction {field} does not match the public hash")
    if transaction.get("status") != "FINALIZED":
        raise AssertionError("Studio transaction is not FINALIZED")
    if transaction.get("result_name") != "MAJORITY_AGREE":
        raise AssertionError("Studio transaction does not have MAJORITY_AGREE consensus")
    if transaction.get("result") != 6:
        raise AssertionError("Studio transaction does not have the reviewed consensus result code")
    if not _as_zero(transaction.get("value")):
        raise AssertionError("Studio transaction did not carry zero value")
    if transaction.get("messages") != [] or transaction.get("triggered_transactions") != []:
        raise AssertionError("Studio transaction emitted messages or child transactions")
    for field in ("recipient", "to_address"):
        value = transaction.get(field)
        if not isinstance(value, str) or value.lower() != contract.lower():
            raise AssertionError(f"Studio transaction {field} does not target the reviewed contract")
    for field in ("sender", "from_address"):
        value = transaction.get(field)
        if not isinstance(value, str) or value.lower() != expected_sender.lower():
            raise AssertionError(f"Studio transaction {field} does not match the canonical role")
    method, args = _decode_call(transaction)
    if method != expected_method:
        raise AssertionError(f"public hash is bound to an unexpected contract method")
    _assert_call_arguments(method, args, dispute)


def test_studio_receipt_backed_lifecycle(studio_rpc_call, studio_rpc: dict[str, Any]) -> None:
    """Verify each approved public hash through the official Studio receipt shape."""

    dispute = gen_call(studio_rpc_call, studio_rpc["contract"], "get_dispute", ["DSP-0001"])
    if not isinstance(dispute, dict):
        raise AssertionError("canonical dispute read is not an object")
    claimant = dispute.get("claimant")
    respondent = dispute.get("respondent")
    if not isinstance(claimant, str) or not isinstance(respondent, str):
        raise AssertionError("canonical dispute parties are malformed")
    for operation, transaction_hash, expected_method, expected_return in PUBLIC_TRANSACTIONS:
        transaction = studio_rpc_call("eth_getTransactionByHash", [transaction_hash])
        expected_sender = claimant if operation == "file_dispute" else respondent
        _assert_common_receipt(
            transaction,
            transaction_hash,
            expected_method,
            studio_rpc["contract"],
            expected_sender,
            dispute,
        )
        returns = _receipt_returns(transaction, operation)
        if any(value != expected_return for value in returns):
            raise AssertionError(f"{operation} receipt returns disagree with its reviewed result")
        if operation == "accept_dispute" and len(returns) != 1:
            raise AssertionError("accept_dispute should have one leader return plus the exact quorum marker")


def test_studio_canonical_final_state(studio_rpc_call, studio_rpc: dict[str, Any]) -> None:
    """Verify the final canonical record independently of the receipt projections."""

    state_version = gen_call(studio_rpc_call, studio_rpc["contract"], "get_state_version")
    dispute = gen_call(studio_rpc_call, studio_rpc["contract"], "get_dispute", ["DSP-0001"])
    if state_version != "DISPUTE_STATE_V3":
        raise AssertionError("canonical state version is not DISPUTE_STATE_V3")
    if not isinstance(dispute, dict):
        raise AssertionError("canonical dispute read is not an object")
    expected = {
        "id": "DSP-0001",
        "status": "FINALIZED",
        "criteria_status": "RESPONDENT_ACCEPTED",
        "verdict": "UNDETERMINED",
        "evidence_status": "AVAILABLE",
        "evidence_available": 1,
        "evidence_failed": 0,
        "reason_code": "INSUFFICIENT_EVIDENCE",
        "source_error_code": "NONE",
        "confidence_bucket": 0,
        "evidence_sufficiency": "INSUFFICIENT",
    }
    for field, value in expected.items():
        if dispute.get(field) != value:
            raise AssertionError(f"canonical dispute field {field} does not match the reviewed final state")
    if not isinstance(dispute.get("evaluated_at"), str) or not dispute["evaluated_at"]:
        raise AssertionError("canonical dispute has no evaluation timestamp")
    if dispute.get("respondent_evidence_references") != []:
        raise AssertionError("canonical dispute respondent evidence is not empty")


def test_studio_skip_policy_classifies_tls_transport_only() -> None:
    """TLS/socket outages may skip; malformed endpoint/protocol errors must fail."""

    assert RPC_USER_AGENT == "LegxusAI-ReadOnly-Integration/1.0"
    assert _transport_error(ssl.SSLError("transport unavailable"))
    assert _transport_error(URLError(ssl.SSLError("transport unavailable")))
    assert not _transport_error(URLError("malformed endpoint"))
    assert not _transport_error(ValueError("malformed JSON"))


def test_studio_transport_outage_becomes_an_explicit_unavailable_error(monkeypatch) -> None:
    attempts = 0

    def unavailable(*_args, **_kwargs):
        nonlocal attempts
        attempts += 1
        raise URLError(ssl.SSLError("transport unavailable"))

    monkeypatch.setattr(studio_helpers, "urlopen", unavailable)
    monkeypatch.setattr(studio_helpers.time, "sleep", lambda _seconds: None)
    with pytest.raises(StudioUnavailable, match="Studio RPC transport unavailable"):
        rpc_call("https://studio.invalid", "eth_chainId", [])
    assert attempts == studio_helpers.RPC_ATTEMPTS


def test_studio_protocol_and_payload_failures_are_not_skipped(monkeypatch) -> None:
    def forbidden(*_args, **_kwargs):
        raise HTTPError("https://studio.invalid", 403, "Forbidden", {}, None)

    monkeypatch.setattr(studio_helpers, "urlopen", forbidden)
    with pytest.raises(HTTPError) as forbidden_error:
        rpc_call("https://studio.invalid", "eth_chainId", [])
    assert forbidden_error.value.code == 403

    class MalformedResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self) -> bytes:
            return b"not-json"

    monkeypatch.setattr(studio_helpers, "urlopen", lambda *_args, **_kwargs: MalformedResponse())
    with pytest.raises(json.JSONDecodeError):
        rpc_call("https://studio.invalid", "eth_chainId", [])

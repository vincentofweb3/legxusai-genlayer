"""Official GenLayer direct-mode coverage for the Phase 3 evidence pipeline.

Direct mode executes the contract in memory. It proves calldata/schema and
leader/validator behavior, but it is not a substitute for Studio's public
multi-validator lifecycle.
"""

import hashlib
import json
import re
from pathlib import Path

import pytest


CONTRACT_PATH = Path(__file__).parents[2] / "contracts" / "LegxusDisputeResolution.py"
COMMIT = "abb71bf891695b737e6a4f5211f4740a3b25543d"
EVIDENCE_URL = (
    "https://raw.githubusercontent.com/genlayerlabs/genvm/"
    f"{COMMIT}/LICENSE"
)
SECOND_EVIDENCE_URL = (
    "https://raw.githubusercontent.com/genlayerlabs/genvm/"
    f"{COMMIT}/README.md"
)
EVIDENCE_BODY = "The signed milestone was missed."
SECOND_EVIDENCE_BODY = "The respondent supplied a contradictory record."
MAX_CONTENT_BYTES = 2_000
MAX_EFFECTIVE_EVIDENCE_URL_CHARS = 347


def address_hex(address) -> str:
    if hasattr(address, "as_hex"):
        return address.as_hex
    return "0x" + address.hex()


def source_id(url: str) -> str:
    parts = [part for part in url.split("/") if part]
    return f"github:{parts[2]}/{parts[3]}@{parts[4]}:{'/'.join(parts[5:])}"


def reference(
    url: str,
    body: str,
    *,
    mime_type: str = "text/plain",
    byte_size=None,
    content_hash=None,
    explicit_source_id=None,
):
    encoded = body.encode()
    return {
        "schema_version": "EVIDENCE_REFERENCE_V1",
        "provider": "GITHUB_RAW",
        "url": url,
        "content_hash": content_hash or hashlib.sha256(encoded).hexdigest(),
        "mime_type": mime_type,
        "byte_size": len(encoded) if byte_size is None else byte_size,
        "source_id": explicit_source_id or source_id(url),
    }


def file_record(contract, direct_vm, claimant, respondent_address, **overrides):
    direct_vm.sender = claimant
    values = {
        "title": "Service delivery dispute",
        "description": "The parties agreed that delivery must occur by the recorded milestone.",
        "respondent": address_hex(respondent_address),
        "amount": 100,
        "currency": "usdc",
        "evidence_references": [],
    }
    values.update(overrides)
    return contract.file_dispute(**values)


def accept_record(contract, direct_vm, respondent, dispute_id, evidence_references=None):
    direct_vm.sender = respondent
    return contract.accept_dispute(dispute_id, evidence_references or [])


def mock_response(body: str, *, status: int = 200, content_type: str = "text/plain; charset=utf-8"):
    return {
        "response": {
            "status": status,
            "headers": {"content-type": content_type.encode()},
            "body": body.encode(),
        }
    }


def configure_evidence(direct_vm, llm_result, body=EVIDENCE_BODY):
    direct_vm.mock_web(r"raw\.githubusercontent\.com/.*/LICENSE", mock_response(body))
    direct_vm.mock_llm(
        r"Return JSON only with exactly these fields",
        json.dumps(llm_result),
    )


def test_file_dispute_records_advisory_pending_state(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(str(CONTRACT_PATH))
    dispute_id = file_record(contract, direct_vm, direct_alice, direct_bob)

    assert dispute_id == "DSP-0001"
    record = contract.get_dispute(dispute_id)
    assert record.state_version == "DISPUTE_STATE_V3"
    assert record.status == "AWAITING_RESPONDENT"
    assert record.criteria_status == "CLAIMANT_DECLARED"
    assert record.verdict == "PENDING"
    assert record.reference_amount == 100
    assert record.reference_currency == "USDC"
    assert record.evidence_status == "NONE"
    assert list(record.evidence_references) == []
    assert not hasattr(record, "validators")
    assert not hasattr(contract, "resolution_fee")
    assert not hasattr(contract, "appeal_verdict")


def test_respondent_acceptance_is_required_before_evaluation(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(str(CONTRACT_PATH))
    dispute_id = file_record(contract, direct_vm, direct_alice, direct_bob)

    with direct_vm.expect_revert("must be accepted"):
        contract.evaluate(dispute_id)
    with direct_vm.expect_revert("Only the named respondent"):
        contract.accept_dispute(dispute_id, [])

    assert accept_record(contract, direct_vm, direct_bob, dispute_id) is True
    record = contract.get_dispute(dispute_id)
    assert record.status == "READY_FOR_EVALUATION"
    assert record.criteria_status == "RESPONDENT_ACCEPTED"

    with direct_vm.expect_revert("no longer awaiting"):
        accept_record(contract, direct_vm, direct_bob, dispute_id)


def test_respondent_can_decline_once_and_cannot_evaluate(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(str(CONTRACT_PATH))
    dispute_id = file_record(contract, direct_vm, direct_alice, direct_bob)
    with direct_vm.expect_revert("Only the named respondent"):
        contract.decline_dispute(dispute_id)
    direct_vm.sender = direct_bob
    assert contract.decline_dispute(dispute_id) is True
    record = contract.get_dispute(dispute_id)
    assert record.status == "DECLINED"
    assert record.criteria_status == "RESPONDENT_DECLINED"
    with direct_vm.expect_revert("no longer awaiting"):
        contract.decline_dispute(dispute_id)


def test_no_evidence_reaches_structured_undetermined_result(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(str(CONTRACT_PATH))
    dispute_id = file_record(contract, direct_vm, direct_alice, direct_bob)
    accept_record(contract, direct_vm, direct_bob, dispute_id)
    direct_vm.sender = direct_alice
    assert contract.evaluate(dispute_id) == "UNDETERMINED"
    assert direct_vm.run_validator() is True
    record = contract.get_dispute(dispute_id)
    assert record.status == "FINALIZED"
    assert record.evidence_sufficiency == "INSUFFICIENT"
    assert record.reason_code == "NO_EVIDENCE"
    assert record.confidence_bucket == 0


def test_leader_and_validator_verify_hash_and_metadata(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(str(CONTRACT_PATH))
    evidence = reference(EVIDENCE_URL, EVIDENCE_BODY)
    dispute_id = file_record(
        contract, direct_vm, direct_alice, direct_bob, evidence_references=[evidence]
    )
    accept_record(contract, direct_vm, direct_bob, dispute_id)
    direct_vm.sender = direct_alice
    configure_evidence(direct_vm, {"outcome": "CLAIMANT_UPHELD", "confidence_bucket": 8})

    assert contract.evaluate(dispute_id) == "CLAIMANT_UPHELD"
    assert direct_vm.run_validator() is True
    record = contract.get_dispute(dispute_id)
    assert record.evidence_status == "AVAILABLE"
    assert record.evidence_sufficiency == "SUFFICIENT"
    assert record.evidence_available == 1
    assert record.evidence_references[0].content_hash == evidence["content_hash"]


def test_maximum_accepted_body_reaches_model_without_tail_truncation(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(str(CONTRACT_PATH))
    body = "a" * (MAX_CONTENT_BYTES - 1) + "Z"
    evidence = reference(EVIDENCE_URL, body)
    dispute_id = file_record(
        contract, direct_vm, direct_alice, direct_bob, evidence_references=[evidence]
    )
    accept_record(contract, direct_vm, direct_bob, dispute_id)
    direct_vm.sender = direct_alice
    direct_vm.mock_web(
        r"raw\.githubusercontent\.com/.*/LICENSE", mock_response(body)
    )
    direct_vm.mock_llm(
        r"Z\n\nReturn JSON only with exactly these fields",
        json.dumps({"outcome": "CLAIMANT_UPHELD", "confidence_bucket": 8}),
    )
    assert contract.evaluate(dispute_id) == "CLAIMANT_UPHELD"
    assert direct_vm.run_validator() is True


def test_body_one_byte_over_policy_is_rejected_at_filing(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(str(CONTRACT_PATH))
    body = "x" * (MAX_CONTENT_BYTES + 1)
    with direct_vm.expect_revert("between 1 and 2000"):
        file_record(
            contract,
            direct_vm,
            direct_alice,
            direct_bob,
            evidence_references=[reference(EVIDENCE_URL, body)],
        )


def test_validator_rejects_changed_source_result(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(str(CONTRACT_PATH))
    evidence = reference(EVIDENCE_URL, EVIDENCE_BODY)
    dispute_id = file_record(
        contract, direct_vm, direct_alice, direct_bob, evidence_references=[evidence]
    )
    accept_record(contract, direct_vm, direct_bob, dispute_id)
    direct_vm.sender = direct_alice
    configure_evidence(direct_vm, {"outcome": "CLAIMANT_UPHELD", "confidence_bucket": 8})
    contract.evaluate(dispute_id)

    direct_vm.clear_mocks()
    direct_vm.mock_web(
        r"raw\.githubusercontent\.com/.*/LICENSE",
        mock_response("changed source"),
    )
    direct_vm.mock_llm(
        r"Return JSON only with exactly these fields",
        json.dumps({"outcome": "CLAIMANT_UPHELD", "confidence_bucket": 8}),
    )
    assert direct_vm.run_validator() is False


def test_confidence_bucket_tolerance_is_one(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(str(CONTRACT_PATH))
    evidence = reference(EVIDENCE_URL, EVIDENCE_BODY)
    dispute_id = file_record(
        contract, direct_vm, direct_alice, direct_bob, evidence_references=[evidence]
    )
    accept_record(contract, direct_vm, direct_bob, dispute_id)
    direct_vm.sender = direct_alice
    configure_evidence(direct_vm, {"outcome": "RESPONDENT_UPHELD", "confidence_bucket": 8})
    contract.evaluate(dispute_id)
    direct_vm.clear_mocks()
    configure_evidence(direct_vm, {"outcome": "RESPONDENT_UPHELD", "confidence_bucket": 9})
    assert direct_vm.run_validator() is True
    direct_vm.clear_mocks()
    configure_evidence(direct_vm, {"outcome": "RESPONDENT_UPHELD", "confidence_bucket": 10})
    assert direct_vm.run_validator() is False


def test_partial_evidence_is_classified_without_silent_swallowing(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(str(CONTRACT_PATH))
    first = reference(EVIDENCE_URL, EVIDENCE_BODY)
    second = reference(SECOND_EVIDENCE_URL, SECOND_EVIDENCE_BODY)
    dispute_id = file_record(
        contract,
        direct_vm,
        direct_alice,
        direct_bob,
        evidence_references=[first, second],
    )
    accept_record(contract, direct_vm, direct_bob, dispute_id)
    direct_vm.sender = direct_alice
    configure_evidence(direct_vm, {"outcome": "UNDETERMINED", "confidence_bucket": 0})
    direct_vm.mock_web(
        r"raw\.githubusercontent\.com/.*/README\.md",
        mock_response("", status=404),
    )
    assert contract.evaluate(dispute_id) == "UNDETERMINED"
    assert direct_vm.run_validator() is True
    record = contract.get_dispute(dispute_id)
    assert record.evidence_status == "PARTIAL"
    assert record.source_error_code == "HTTP_CLIENT_ERROR"
    assert record.evidence_available == 1
    assert record.evidence_failed == 1


def test_malformed_model_response_is_classified_as_llm_error(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(str(CONTRACT_PATH))
    evidence = reference(EVIDENCE_URL, EVIDENCE_BODY)
    dispute_id = file_record(
        contract, direct_vm, direct_alice, direct_bob, evidence_references=[evidence]
    )
    accept_record(contract, direct_vm, direct_bob, dispute_id)
    direct_vm.sender = direct_alice
    configure_evidence(direct_vm, {}, body=EVIDENCE_BODY)
    direct_vm.mock_llm(r"Return JSON only with exactly these fields", "not-json")
    with direct_vm.expect_revert("[LLM_ERROR]"):
        contract.evaluate(dispute_id)
    assert contract.get_dispute(dispute_id).status == "READY_FOR_EVALUATION"


@pytest.mark.parametrize(
    "field,value,error",
    [
        ("title", "tiny", "Title is too short"),
        ("description", "too short", "Decision criteria and context is too short"),
        ("currency", "btc", "Reference currency is not supported"),
        ("respondent", "0x1234", "Respondent must be a 20-byte hexadecimal address"),
        ("evidence_references", [reference("http://example.org/a", "x", explicit_source_id="invalid")], "must use HTTPS"),
        ("evidence_references", [reference("https://example.org/a", "x", explicit_source_id="invalid")], "selected GitHub raw provider"),
        ("evidence_references", [reference("https://raw.githubusercontent.com/owner/repo/main/a", "x", explicit_source_id="invalid")], "lowercase 40-character commit"),
        ("evidence_references", [dict(reference(EVIDENCE_URL, "x"), provider="OTHER")], "provider is not supported"),
        ("evidence_references", [dict(reference(EVIDENCE_URL, "x"), source_id="wrong")], "source identifier does not match"),
    ],
)
def test_file_validation_rejects_unsupported_inputs(
    direct_vm, direct_deploy, direct_alice, direct_bob, field, value, error
):
    contract = direct_deploy(str(CONTRACT_PATH))
    with direct_vm.expect_revert(error):
        file_record(contract, direct_vm, direct_alice, direct_bob, **{field: value})


def test_reference_amount_is_bounded(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(str(CONTRACT_PATH))
    with direct_vm.expect_revert("outside the supported range"):
        file_record(contract, direct_vm, direct_alice, direct_bob, amount=(1 << 128))


def test_evidence_count_and_cross_party_duplicates_are_rejected(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(str(CONTRACT_PATH))
    refs = [reference(EVIDENCE_URL, "x"), reference(SECOND_EVIDENCE_URL, "y")]
    third_url = f"https://raw.githubusercontent.com/genlayerlabs/genvm/{COMMIT}/pyproject.toml"
    fourth_url = f"https://raw.githubusercontent.com/genlayerlabs/genvm/{COMMIT}/setup.py"
    with direct_vm.expect_revert("At most 3 evidence references"):
        file_record(
            contract,
            direct_vm,
            direct_alice,
            direct_bob,
            evidence_references=refs + [reference(third_url, "z"), reference(fourth_url, "w")],
        )

    with direct_vm.expect_revert("Evidence references must be unique"):
        file_record(
            contract,
            direct_vm,
            direct_alice,
            direct_bob,
            evidence_references=[refs[0], reference(EVIDENCE_URL, "different body")],
        )
    with direct_vm.expect_revert("Evidence references must be unique"):
        file_record(
            contract,
            direct_vm,
            direct_alice,
            direct_bob,
            evidence_references=[refs[0], reference(SECOND_EVIDENCE_URL, "x")],
        )

    dispute_id = file_record(
        contract, direct_vm, direct_alice, direct_bob, evidence_references=[refs[0]]
    )
    with direct_vm.expect_revert("unique across parties"):
        accept_record(
            contract,
            direct_vm,
            direct_bob,
            dispute_id,
            [reference(EVIDENCE_URL, "different body")],
        )
    with direct_vm.expect_revert("unique across parties"):
        accept_record(
            contract,
            direct_vm,
            direct_bob,
            dispute_id,
            [reference(SECOND_EVIDENCE_URL, "x")],
        )


def test_three_references_per_party_and_six_total_quota(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(str(CONTRACT_PATH))
    claimant_refs = [
        reference(
            f"https://raw.githubusercontent.com/genlayerlabs/genvm/{COMMIT}/claimant-{index}.md",
            f"claimant-{index}",
        )
        for index in range(3)
    ]
    respondent_refs = [
        reference(
            f"https://raw.githubusercontent.com/genlayerlabs/genvm/{COMMIT}/respondent-{index}.md",
            f"respondent-{index}",
        )
        for index in range(3)
    ]
    dispute_id = file_record(
        contract,
        direct_vm,
        direct_alice,
        direct_bob,
        evidence_references=claimant_refs,
    )
    assert accept_record(contract, direct_vm, direct_bob, dispute_id, respondent_refs) is True
    record = contract.get_dispute(dispute_id)
    assert len(record.evidence_references) == 3
    assert len(record.respondent_evidence_references) == 3

    direct_vm.sender = direct_alice
    for index in range(3):
        direct_vm.mock_web(
            re.escape(claimant_refs[index]["url"]),
            mock_response(f"claimant-{index}"),
        )
        direct_vm.mock_web(
            re.escape(respondent_refs[index]["url"]),
            mock_response(f"respondent-{index}"),
        )
    direct_vm.mock_llm(
        r"Return JSON only with exactly these fields",
        json.dumps({"outcome": "UNDETERMINED", "confidence_bucket": 0}),
    )
    assert contract.evaluate(dispute_id) == "UNDETERMINED"
    assert direct_vm.run_validator() is True
    assert contract.get_dispute(dispute_id).evidence_available == 6

    direct_vm.clear_mocks()
    dispute_id = file_record(
        contract,
        direct_vm,
        direct_alice,
        direct_bob,
        evidence_references=claimant_refs,
    )
    with direct_vm.expect_revert("At most 3 evidence references"):
        accept_record(
            contract,
            direct_vm,
            direct_bob,
            dispute_id,
            respondent_refs + [
                reference(
                    f"https://raw.githubusercontent.com/genlayerlabs/genvm/{COMMIT}/respondent-3.md",
                    "respondent-3",
                )
            ],
        )


def test_source_id_boundary_matches_browser_policy(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(str(CONTRACT_PATH))
    prefix_length = len("github:owner/repo@") + len(COMMIT) + 1
    path_at_limit = "a" * (320 - prefix_length)
    accepted_url = f"https://raw.githubusercontent.com/owner/repo/{COMMIT}/{path_at_limit}"
    assert len(accepted_url) == MAX_EFFECTIVE_EVIDENCE_URL_CHARS
    dispute_id = file_record(
        contract,
        direct_vm,
        direct_alice,
        direct_bob,
        evidence_references=[reference(accepted_url, "x")],
    )
    assert dispute_id == "DSP-0001"

    over_limit_url = f"https://raw.githubusercontent.com/owner/repo/{COMMIT}/{path_at_limit}a"
    with direct_vm.expect_revert("source identifier exceeds 320"):
        file_record(
            contract,
            direct_vm,
            direct_alice,
            direct_bob,
            evidence_references=[reference(over_limit_url, "x")],
        )

    previously_demonstrated_long_path_url = over_limit_url + ("a" * 31)
    assert len(previously_demonstrated_long_path_url) == 379
    with direct_vm.expect_revert("source identifier exceeds 320"):
        file_record(
            contract,
            direct_vm,
            direct_alice,
            direct_bob,
            evidence_references=[reference(previously_demonstrated_long_path_url, "x")],
        )

    absolute_url_limit_exceeded = accepted_url + (
        "a" * (513 - len(accepted_url))
    )
    assert len(absolute_url_limit_exceeded) == 513
    with direct_vm.expect_revert("Evidence URL is invalid"):
        file_record(
            contract,
            direct_vm,
            direct_alice,
            direct_bob,
            evidence_references=[reference(absolute_url_limit_exceeded, "x")],
        )


@pytest.mark.parametrize(
    "overrides,expected_error",
    [
        (dict(content_hash="0" * 64), "CONTENT_HASH_MISMATCH"),
        (dict(byte_size=1), "CONTENT_SIZE_MISMATCH"),
        (dict(mime_type="text/html"), "UNSUPPORTED_MEDIA"),
    ],
)
def test_metadata_mismatch_classes_are_recorded(
    direct_vm, direct_deploy, direct_alice, direct_bob, overrides, expected_error
):
    contract = direct_deploy(str(CONTRACT_PATH))
    evidence = reference(EVIDENCE_URL, EVIDENCE_BODY, **overrides)
    dispute_id = file_record(
        contract, direct_vm, direct_alice, direct_bob, evidence_references=[evidence]
    )
    accept_record(contract, direct_vm, direct_bob, dispute_id)
    direct_vm.sender = direct_alice
    direct_vm.mock_web(
        r"raw\.githubusercontent\.com/.*/LICENSE", mock_response(EVIDENCE_BODY)
    )
    assert contract.evaluate(dispute_id) == "UNDETERMINED"
    assert direct_vm.run_validator() is True
    assert contract.get_dispute(dispute_id).source_error_code == expected_error


@pytest.mark.parametrize(
    "response,expected_error",
    [
        (mock_response("", status=200), "EMPTY_RESPONSE"),
        (mock_response("x" * (MAX_CONTENT_BYTES + 1)), "RESPONSE_TOO_LARGE"),
        (None, "SOURCE_UNAVAILABLE"),
    ],
)
def test_http_empty_oversized_and_unavailable_sources_are_classified(
    direct_vm, direct_deploy, direct_alice, direct_bob, response, expected_error
):
    contract = direct_deploy(str(CONTRACT_PATH))
    evidence = reference(EVIDENCE_URL, EVIDENCE_BODY)
    dispute_id = file_record(
        contract, direct_vm, direct_alice, direct_bob, evidence_references=[evidence]
    )
    accept_record(contract, direct_vm, direct_bob, dispute_id)
    direct_vm.sender = direct_alice
    if response is not None:
        direct_vm.mock_web(r"raw\.githubusercontent\.com/.*/LICENSE", response)
    assert contract.evaluate(dispute_id) == "UNDETERMINED"
    assert direct_vm.run_validator() is True
    assert contract.get_dispute(dispute_id).source_error_code == expected_error


def test_http_redirect_is_classified_explicitly(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(str(CONTRACT_PATH))
    evidence = reference(EVIDENCE_URL, EVIDENCE_BODY)
    dispute_id = file_record(
        contract, direct_vm, direct_alice, direct_bob, evidence_references=[evidence]
    )
    accept_record(contract, direct_vm, direct_bob, dispute_id)
    direct_vm.sender = direct_alice
    direct_vm.mock_web(
        r"raw\.githubusercontent\.com/.*/LICENSE",
        mock_response(EVIDENCE_BODY, status=302),
    )
    assert contract.evaluate(dispute_id) == "UNDETERMINED"
    assert direct_vm.run_validator() is True
    assert contract.get_dispute(dispute_id).source_error_code == "REDIRECT"


def test_protocol_rejection_does_not_create_application_appeal_state(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(str(CONTRACT_PATH))
    dispute_id = file_record(contract, direct_vm, direct_alice, direct_bob)
    record = contract.get_dispute(dispute_id)
    assert not hasattr(contract, "appeal_verdict")
    assert not hasattr(record, "appeal_count")
    assert not hasattr(record, "validators")

# { "Depends": "py-genlayer:test" }
from genlayer import *
import json

@gl.dataclass
class DisputeRecord:
    id: str
    title: str
    description: str
    claimant: str
    respondent: str
    amount: int
    currency: str
    evidence_urls: list[str]
    verdict: str
    confidence: int
    validators: int
    status: str
    filed_at: str

class LegxusDisputeResolution(gl.Contract):
    disputes: dict[str, DisputeRecord]
    total_disputes: int
    resolution_fee: int
    owner: str

    def __init__(self, resolution_fee: int):
        self.disputes = {}
        self.total_disputes = 0
        self.resolution_fee = resolution_fee
        self.owner = str(gl.message.sender_address)

    @gl.public.view
    def get_dispute(self, dispute_id: str) -> DisputeRecord:
        return self.disputes[dispute_id]

    @gl.public.view
    def get_all_disputes(self) -> dict[str, DisputeRecord]:
        return self.disputes

    @gl.public.view
    def get_total(self) -> int:
        return self.total_disputes

    @gl.public.write
    def file_dispute(self, title: str, description: str, respondent: str, amount: int, currency: str, evidence_urls: list[str]) -> str:
        dispute_id = f"DSP-{self.total_disputes + 1:04d}"

        def analyze():
            evidence_texts = []
            for url in evidence_urls[:3]:
                try:
                    content = gl.get_webpage(url, mode='text')
                    evidence_texts.append(f"[{url}]\n{content[:600]}")
                except Exception as e:
                    evidence_texts.append(f"[{url}]\nUnavailable")
            combined = "\n\n".join(evidence_texts)
            prompt = f"""You are a neutral AI arbitrator on the LegxusAI dispute resolution platform.

DISPUTE: {title}
DESCRIPTION: {description}
AMOUNT: {amount} {currency}
CLAIMANT: {str(gl.message.sender_address)}
RESPONDENT: {respondent}

EVIDENCE:
{combined}

Determine who wins and your confidence. Respond in JSON only:
{{"verdict": "CLAIMANT_WINS", "confidence": 87, "reasoning": "Brief reason"}}"""
            return gl.eq_principle_prompt_comparative(
                lambda: gl.exec_prompt(prompt),
                comparative_fn=lambda a, b: (
                    json.loads(a).get("verdict") == json.loads(b).get("verdict")
                    if _valid_json(a) and _valid_json(b) else False
                )
            )

        raw = analyze()
        verdict, confidence = "UNDETERMINED", 0
        try:
            p = json.loads(raw)
            verdict = p.get("verdict", "UNDETERMINED")
            confidence = int(p.get("confidence", 0))
        except Exception:
            pass

        self.disputes[dispute_id] = DisputeRecord(
            id=dispute_id, title=title, description=description,
            claimant=str(gl.message.sender_address), respondent=respondent,
            amount=amount, currency=currency, evidence_urls=evidence_urls,
            verdict=verdict, confidence=confidence, validators=7,
            status="FINALIZED", filed_at=str(gl.message.timestamp),
        )
        self.total_disputes += 1
        return dispute_id

    @gl.public.write
    def appeal_verdict(self, dispute_id: str) -> bool:
        if dispute_id not in self.disputes:
            raise Exception("Dispute not found")
        d = self.disputes[dispute_id]
        d.status = "APPEALING"
        d.validators = d.validators * 2
        self.disputes[dispute_id] = d
        return True

def _valid_json(s: str) -> bool:
    try: json.loads(s); return True
    except: return False

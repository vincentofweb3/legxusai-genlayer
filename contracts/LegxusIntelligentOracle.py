# { "Depends": "py-genlayer:test" }
from genlayer import *

@gl.dataclass
class OracleFeed:
    key: str
    value: str
    timestamp: str
    sources: list[str]
    confidence: int

class LegxusIntelligentOracle(gl.Contract):
    feeds: dict[str, OracleFeed]
    update_count: int
    owner: str

    def __init__(self):
        self.feeds = {}
        self.update_count = 0
        self.owner = str(gl.message.sender_address)

    @gl.public.view
    def get_latest_feed(self, key: str) -> OracleFeed:
        if key not in self.feeds:
            raise Exception(f"No feed for key: {key}")
        return self.feeds[key]

    @gl.public.view
    def get_all_feeds(self) -> dict[str, OracleFeed]:
        return self.feeds

    @gl.public.write
    def fetch_price(self, asset: str, sources: list[str]) -> str:
        def get_price():
            prices = []
            for url in sources[:3]:
                try:
                    content = gl.get_webpage(url, mode='text')
                    prompt = f"Extract the current USD price of {asset} from this data:\n{content[:500]}\nReturn ONLY a number. No symbols or text."
                    raw = gl.exec_prompt(prompt).strip().replace(',', '').replace('$', '')
                    price = float(raw)
                    if price > 0:
                        prices.append(price)
                except Exception:
                    pass
            if not prices:
                return "0"
            return str(round(sum(prices) / len(prices), 4))

        price = gl.eq_principle_prompt_comparative(
            get_price,
            comparative_fn=lambda a, b: (
                abs(float(a) - float(b)) < float(a) * 0.02
                if float(a) > 0 and float(b) > 0 else a == b
            )
        )
        self.feeds[f"{asset.upper()}_USD"] = OracleFeed(
            key=f"{asset.upper()}_USD", value=price,
            timestamp=str(gl.message.timestamp),
            sources=sources[:3], confidence=92,
        )
        self.update_count += 1
        return price

    @gl.public.write
    def verify_event(self, event_key: str, event_description: str, verification_urls: list[str]) -> bool:
        def check():
            evidence = []
            for url in verification_urls[:3]:
                try:
                    content = gl.get_webpage(url, mode='text')
                    evidence.append(f"[{url}]\n{content[:600]}")
                except Exception:
                    pass
            combined = "\n\n".join(evidence)
            prompt = f"""Did the following event occur?

EVENT: {event_description}

EVIDENCE:
{combined}

Answer ONLY with YES or NO."""
            return gl.exec_prompt(prompt).strip().upper() == "YES"

        occurred = gl.eq_principle_strict_eq(check)
        self.feeds[event_key] = OracleFeed(
            key=event_key, value="TRUE" if occurred else "FALSE",
            timestamp=str(gl.message.timestamp),
            sources=verification_urls[:3], confidence=88,
        )
        self.update_count += 1
        return occurred

    @gl.public.write
    def check_compliance(self, entity: str, jurisdiction: str, check_urls: list[str]) -> str:
        def evaluate():
            data = []
            for url in check_urls[:3]:
                try:
                    content = gl.get_webpage(url, mode='text')
                    data.append(content[:500])
                except Exception:
                    pass
            combined = "\n---\n".join(data)
            prompt = f"""Is {entity} compliant with {jurisdiction} regulations based on this data:
{combined}

Respond with exactly one of: COMPLIANT, NON_COMPLIANT, or UNKNOWN"""
            result = gl.exec_prompt(prompt).strip().upper()
            return result if result in ["COMPLIANT", "NON_COMPLIANT", "UNKNOWN"] else "UNKNOWN"

        status = gl.eq_principle_strict_eq(evaluate)
        self.feeds[f"COMPLIANCE_{entity}_{jurisdiction}"] = OracleFeed(
            key=f"COMPLIANCE_{entity}_{jurisdiction}", value=status,
            timestamp=str(gl.message.timestamp),
            sources=check_urls[:3], confidence=85,
        )
        self.update_count += 1
        return status

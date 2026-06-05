# { "Depends": "py-genlayer:test" }
from genlayer import *

@gl.dataclass
class Position:
    user: str
    side: str
    amount: int
    timestamp: str

@gl.dataclass
class Market:
    id: str
    question: str
    description: str
    oracle_sources: list[str]
    end_date: str
    yes_stake: int
    no_stake: int
    resolved: bool
    verdict: str
    creator: str
    category: str

class LegxusPredictionMarket(gl.Contract):
    markets: dict[str, Market]
    positions: dict[str, list[Position]]
    fee_bps: int
    market_count: int
    owner: str

    def __init__(self, fee_bps: int):
        self.markets = {}
        self.positions = {}
        self.fee_bps = fee_bps
        self.market_count = 0
        self.owner = str(gl.message.sender_address)

    @gl.public.view
    def get_market(self, market_id: str) -> Market:
        return self.markets[market_id]

    @gl.public.view
    def get_all_markets(self) -> dict[str, Market]:
        return self.markets

    @gl.public.write
    def create_market(self, question: str, description: str, oracle_sources: list[str], end_date: str, category: str) -> str:
        market_id = f"PRED-{self.market_count + 1:04d}"
        self.markets[market_id] = Market(
            id=market_id, question=question, description=description,
            oracle_sources=oracle_sources, end_date=end_date,
            yes_stake=0, no_stake=0, resolved=False, verdict="",
            creator=str(gl.message.sender_address), category=category,
        )
        self.positions[market_id] = []
        self.market_count += 1
        return market_id

    @gl.public.write
    def stake_position(self, market_id: str, side: str, amount: int) -> bool:
        if market_id not in self.markets:
            raise Exception("Market not found")
        market = self.markets[market_id]
        if market.resolved:
            raise Exception("Market already resolved")
        if side not in ["YES", "NO"]:
            raise Exception("Side must be YES or NO")
        position = Position(user=str(gl.message.sender_address), side=side, amount=amount, timestamp=str(gl.message.timestamp))
        if side == "YES":
            market.yes_stake += amount
        else:
            market.no_stake += amount
        self.markets[market_id] = market
        positions_list = self.positions.get(market_id, [])
        positions_list.append(position)
        self.positions[market_id] = positions_list
        return True

    @gl.public.write
    def resolve_market(self, market_id: str) -> str:
        if market_id not in self.markets:
            raise Exception("Market not found")
        market = self.markets[market_id]
        if market.resolved:
            raise Exception("Already resolved")

        def fetch_and_determine():
            source_data = []
            for url in market.oracle_sources[:3]:
                try:
                    content = gl.get_webpage(url, mode='text')
                    source_data.append(f"[{url}]\n{content[:800]}")
                except Exception:
                    source_data.append(f"[{url}]\nUnavailable")
            combined = "\n\n".join(source_data)
            prompt = f"""You are resolving a prediction market on the LegxusAI platform.

QUESTION: {market.question}
DESCRIPTION: {market.description}

ORACLE DATA:
{combined}

Has the event described occurred? Answer ONLY with YES or NO."""
            result = gl.exec_prompt(prompt).strip().upper()
            return result if result in ["YES", "NO"] else "NO"

        verdict = gl.eq_principle_strict_eq(fetch_and_determine)
        market.resolved = True
        market.verdict = verdict
        self.markets[market_id] = market
        return verdict

    @gl.public.write
    def claim_winnings(self, market_id: str) -> int:
        market = self.markets[market_id]
        if not market.resolved:
            raise Exception("Not yet resolved")
        user = str(gl.message.sender_address)
        positions = self.positions.get(market_id, [])
        winning_stake = sum(p.amount for p in positions if p.user == user and p.side == market.verdict)
        if winning_stake == 0:
            return 0
        total_winning = market.yes_stake if market.verdict == "YES" else market.no_stake
        total_pool = market.yes_stake + market.no_stake
        fee = (total_pool * self.fee_bps) // 10000
        return (winning_stake * (total_pool - fee)) // total_winning

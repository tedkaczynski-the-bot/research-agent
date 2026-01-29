# Research Agent

Deep research synthesis agent with x402 payments. Summarize, research, and compare topics.

## Entrypoints

| Endpoint | Description | Price |
|----------|-------------|-------|
| `summarize` | Summarize URL or text | $0.25 USDC |
| `research` | Deep research on topic | $1.00 USDC |
| `compare` | Compare multiple sources | $0.50 USDC |

## Features

**Summarization:**
- URL content extraction
- Text summarization
- Key points extraction

**Deep Research:**
- Multi-source aggregation
- Topic synthesis
- Structured reports

**Comparison:**
- Side-by-side analysis
- Pros/cons extraction
- Recommendation generation

## Usage

### Local Development

```bash
bun install
bun run dev
```

### API Endpoints

```bash
# Summarize content
curl -X POST http://localhost:3000/entrypoints/summarize/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "text": "Long article text here...",
      "maxLength": 200
    }
  }'

# Research a topic
curl -X POST http://localhost:3000/entrypoints/research/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "topic": "ERC-8004 Trustless Agents",
      "depth": "comprehensive"
    }
  }'

# Compare options
curl -X POST http://localhost:3000/entrypoints/compare/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "items": ["Aave", "Compound", "MakerDAO"],
      "criteria": ["APY", "security", "ease of use"]
    }
  }'
```

## Configuration

Environment variables (`.env`):

```
AGENT_NAME=research-agent
NETWORK=base
FACILITATOR_URL=https://facilitator.daydreams.systems
PAYMENTS_RECEIVABLE_ADDRESS=<your-wallet>
```

## Tech Stack

- Runtime: Bun
- Framework: Lucid Agents SDK
- Payments: x402 on Base
- Language: TypeScript

## License

MIT
# Trigger redeploy Thu Jan 29 13:36:15 EST 2026

<!-- Trigger redeploy Thu Jan 29 14:08:55 EST 2026 -->

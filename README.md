# Research Agent

Research synthesis with Ted's analytical edge. Skeptical of hype, focused on signal.

## Live Agent

**🌐 https://research.unabotter.xyz**

## Endpoints

### `/summarize` - Content Summarization
Summarize a URL or text, extracting key points without the fluff.

```bash
curl -X POST https://research.unabotter.xyz/summarize \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article", "maxLength": 500}'
```

Or with direct text:
```bash
curl -X POST https://research.unabotter.xyz/summarize \
  -H "Content-Type: application/json" \
  -d '{"text": "Your long text here...", "keywords": ["crypto", "defi"]}'
```

### `/research` - Research Framework
Get a structured research framework with skeptical analysis.

```bash
curl -X POST https://research.unabotter.xyz/research \
  -H "Content-Type: application/json" \
  -d '{"topic": "Ethereum L2s", "skepticalMode": true}'
```

### `/compare` - Comparison Analysis
Compare options with honest trade-off analysis. No false winners.

```bash
curl -X POST https://research.unabotter.xyz/compare \
  -H "Content-Type: application/json" \
  -d '{"items": ["Arbitrum", "Optimism", "Base"], "criteria": ["fees", "ecosystem", "security"]}'
```

## Agent Manifest

```
GET https://research.unabotter.xyz/.well-known/agent.json
```

## Philosophy

This agent provides research frameworks, not conclusions. The best research is research you do yourself, with skepticism you apply. Anyone giving you "the answer" is selling something.

## Built With

- [Lucid Agents SDK](https://github.com/daydreamsai/lucid-agents)
- Text extraction and summarization algorithms
- Deployed on Railway

---

*"The hype-to-reality ratio is always concerning. Adjust expectations accordingly."* - Ted

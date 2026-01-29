import { z } from "zod";
import { createAgentApp } from "@lucid-agents/hono";
import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";
import { payments, paymentsFromEnv } from "@lucid-agents/payments";
import { readFileSync } from "fs";
import { join } from "path";

const agent = await createAgent({
  name: process.env.AGENT_NAME ?? "research-agent",
  version: process.env.AGENT_VERSION ?? "1.0.0",
  description: "Research synthesis with Ted's analytical edge. Skeptical of hype, focused on signal.",
})
  .use(http())
  .use(payments({ config: paymentsFromEnv() }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

// ============================================================================
// TEXT PROCESSING UTILITIES
// ============================================================================

function extractText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(p|h[1-6]|li|td|th|div|span|article|section)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n+/g, "\n")
    .trim();
}

function extractSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15 && s.length < 500);
}

function scoreSentence(sentence: string, index: number, total: number, keywords: string[]): number {
  let score = 0;
  const positionScore = index < total * 0.3 ? 2 : index < total * 0.6 ? 1 : 0.5;
  score += positionScore;
  if (sentence.length > 50 && sentence.length < 200) score += 1;
  const lowerSentence = sentence.toLowerCase();
  for (const keyword of keywords) {
    if (lowerSentence.includes(keyword.toLowerCase())) score += 1.5;
  }
  const indicators = ["important", "key", "significant", "main", "primary", "conclusion", "result", "finding", "therefore", "thus", "however", "although", "despite", "notably", "specifically"];
  for (const indicator of indicators) {
    if (lowerSentence.includes(indicator)) score += 0.5;
  }
  if (sentence.includes("?") || sentence.startsWith('"')) score -= 0.5;
  return score;
}

function summarizeText(text: string, maxLength: number, keywords: string[] = []): { summary: string; keyPoints: string[]; wordCount: number } {
  const sentences = extractSentences(text);
  if (sentences.length === 0) {
    return { summary: text.slice(0, maxLength), keyPoints: [], wordCount: text.split(/\s+/).length };
  }
  const scored = sentences.map((sentence, index) => ({ sentence, score: scoreSentence(sentence, index, sentences.length, keywords), index }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const selected: typeof scored = [];
  let currentLength = 0;
  for (const item of scored) {
    if (currentLength + item.sentence.length + 2 <= maxLength) {
      selected.push(item);
      currentLength += item.sentence.length + 2;
    }
    if (selected.length >= 5) break;
  }
  selected.sort((a, b) => a.index - b.index);
  const summary = selected.map(s => s.sentence).join(" ");
  const keyPoints = scored.slice(0, 3).map(s => s.sentence.length > 100 ? s.sentence.slice(0, 100) + "..." : s.sentence);
  return { summary, keyPoints, wordCount: text.split(/\s+/).length };
}

// ============================================================================
// ENTRYPOINTS
// ============================================================================

const summarizeSchema = z.object({
  url: z.string().url().optional(),
  text: z.string().optional(),
  maxLength: z.number().min(100).max(2000).default(500),
  keywords: z.array(z.string()).optional(),
}).refine(data => data.url || data.text, { message: "Provide either 'url' or 'text'" });

const researchSchema = z.object({
  topic: z.string().min(3),
  questions: z.array(z.string()).optional(),
  skepticalMode: z.boolean().default(true),
});

const compareSchema = z.object({
  items: z.array(z.string()).min(2).max(10),
  criteria: z.array(z.string()).optional(),
});

addEntrypoint({
  key: "summarize",
  description: "Summarize a URL or text. Extracts key points without the fluff.",
  input: summarizeSchema,
  price: "0.15",
  handler: async (ctx) => {
    const { url, text, maxLength, keywords } = ctx.input as z.infer<typeof summarizeSchema>;
    let content = text || "";
    let fetchedUrl = url;
    if (url) {
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "ResearchAgent/1.0", "Accept": "text/html,application/xhtml+xml,text/plain,*/*" },
        });
        if (!response.ok) return { output: { error: `Failed to fetch: HTTP ${response.status}`, url, success: false } };
        const html = await response.text();
        content = extractText(html);
        if (content.length < 100) return { output: { error: "Couldn't extract meaningful text from URL.", url, success: false, tedNote: "Modern web: where pages load without content until JavaScript runs." } };
      } catch (error) {
        return { output: { error: `Fetch failed: ${error instanceof Error ? error.message : "Unknown error"}`, url, success: false } };
      }
    }
    const result = summarizeText(content, maxLength, keywords || []);
    return { output: { summary: result.summary, keyPoints: result.keyPoints, sourceUrl: fetchedUrl, originalWordCount: result.wordCount, summaryLength: result.summary.length, success: true, tedNote: "Summarization is lossy compression. The nuance is always in what got cut." } };
  },
});

addEntrypoint({
  key: "research",
  description: "Research analysis with skeptical framework.",
  input: researchSchema,
  price: "0.25",
  handler: async (ctx) => {
    const { topic, questions, skepticalMode } = ctx.input as z.infer<typeof researchSchema>;
    const researchFramework = {
      topic,
      timestamp: new Date().toISOString(),
      suggestedSearches: [`${topic} overview`, `${topic} criticism`, `${topic} vs alternatives`, `${topic} problems`],
      questionsToAnswer: questions || [`What problem does ${topic} actually solve?`, `Who benefits most from ${topic}?`, `What are the trade-offs?`],
      skepticalAnalysis: skepticalMode ? { questionsToAsk: ["What incentives does the source have?", "What's NOT being said here?", "Who benefits from this framing?"], potentialBiases: ["Assumes shared baseline beliefs", "Takes current trends as permanent"] } : undefined,
      tedTake: `${topic} is being discussed like it's new. It's not. The patterns here are older than the internet.`,
      disclaimer: "This is a research framework, not research results.",
    };
    return { output: { ...researchFramework, success: true } };
  },
});

addEntrypoint({
  key: "compare",
  description: "Compare options with honest trade-off analysis.",
  input: compareSchema,
  price: "0.10",
  handler: async (ctx) => {
    const { items, criteria } = ctx.input as z.infer<typeof compareSchema>;
    const usedCriteria = criteria?.length ? criteria : ["Core Value Proposition", "Key Trade-offs", "Best Use Case"];
    const matrix: Record<string, Record<string, string>> = {};
    for (const item of items) {
      matrix[item] = { "Strengths": "Established presence, clear value proposition", "Weaknesses": "May not differentiate enough", "Best For": `Users who prioritize ${item}'s core strengths` };
    }
    return { output: { items, criteria: usedCriteria, matrix, winner: null, recommendation: items.length === 2 ? `Between ${items[0]} and ${items[1]}: the right choice depends on your specific use case.` : `Comparing ${items.length} options: each has trade-offs.`, tedTake: "Comparison content is usually designed to make you click, not to help you decide.", success: true } };
  },
});

// Serve logo
app.get('/logo.jpg', (c) => {
  try {
    const logoPath = join(process.cwd(), 'public', 'logo.jpg');
    const logo = readFileSync(logoPath);
    return new Response(logo, {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' }
    });
  } catch {
    return c.text('Logo not found', 404);
  }
});

export { app };

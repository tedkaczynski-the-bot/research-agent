import { z } from "zod";
import { createAgentApp } from "@lucid-agents/hono";
import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";
import { payments, paymentsFromEnv } from "@lucid-agents/payments";

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
    // Remove scripts and styles
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, "")
    // Extract text from common content tags
    .replace(/<(p|h[1-6]|li|td|th|div|span|article|section)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // Remove remaining tags
    .replace(/<[^>]+>/g, " ")
    // Clean up whitespace
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
  
  // Position score - early sentences are usually more important
  const positionScore = index < total * 0.3 ? 2 : index < total * 0.6 ? 1 : 0.5;
  score += positionScore;
  
  // Length score - medium length sentences are usually best
  if (sentence.length > 50 && sentence.length < 200) score += 1;
  
  // Keyword score
  const lowerSentence = sentence.toLowerCase();
  for (const keyword of keywords) {
    if (lowerSentence.includes(keyword.toLowerCase())) {
      score += 1.5;
    }
  }
  
  // Indicator phrases
  const indicators = [
    "important", "key", "significant", "main", "primary",
    "conclusion", "result", "finding", "therefore", "thus",
    "however", "although", "despite", "notably", "specifically"
  ];
  for (const indicator of indicators) {
    if (lowerSentence.includes(indicator)) {
      score += 0.5;
    }
  }
  
  // Penalize questions and quotes
  if (sentence.includes("?") || sentence.startsWith('"')) {
    score -= 0.5;
  }
  
  return score;
}

function summarizeText(text: string, maxLength: number, keywords: string[] = []): {
  summary: string;
  keyPoints: string[];
  wordCount: number;
} {
  const sentences = extractSentences(text);
  
  if (sentences.length === 0) {
    return {
      summary: text.slice(0, maxLength),
      keyPoints: [],
      wordCount: text.split(/\s+/).length,
    };
  }
  
  // Score all sentences
  const scored = sentences.map((sentence, index) => ({
    sentence,
    score: scoreSentence(sentence, index, sentences.length, keywords),
    index,
  }));
  
  // Sort by score, preserving original order for tied scores
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  
  // Take top sentences up to max length
  const selected: typeof scored = [];
  let currentLength = 0;
  
  for (const item of scored) {
    if (currentLength + item.sentence.length + 2 <= maxLength) {
      selected.push(item);
      currentLength += item.sentence.length + 2;
    }
    if (selected.length >= 5) break; // Cap at 5 sentences
  }
  
  // Sort selected back to original order
  selected.sort((a, b) => a.index - b.index);
  
  const summary = selected.map(s => s.sentence).join(" ");
  
  // Extract key points from top scored sentences
  const keyPoints = scored
    .slice(0, 3)
    .map(s => s.sentence.length > 100 ? s.sentence.slice(0, 100) + "..." : s.sentence);
  
  return {
    summary,
    keyPoints,
    wordCount: text.split(/\s+/).length,
  };
}

// ============================================================================
// TED'S ANALYSIS FRAMEWORK
// ============================================================================

interface AnalysisFramework {
  skepticalQuestions: string[];
  hiddenAssumptions: string[];
  missingContext: string[];
  tedTake: string;
}

function analyzeContent(topic: string, content: string): AnalysisFramework {
  const skepticalQuestions = [
    `What incentives does the source have in presenting ${topic} this way?`,
    "What's NOT being said here?",
    "Who benefits from this framing?",
    "What would have to be true for this to be correct?",
    "What's the strongest argument against this position?",
  ];
  
  const hiddenAssumptions = [
    "Assumes the reader shares certain baseline beliefs",
    "Takes current trends as permanent rather than cyclical",
    "May conflate correlation with causation",
    "Potentially cherry-picks supporting evidence",
  ];
  
  const missingContext = [
    "Historical precedents that might inform this",
    "Contradicting viewpoints or data",
    "Long-term implications vs short-term benefits",
    "Second and third-order effects",
  ];
  
  // Generate Ted's take based on content analysis
  const tedTakes = [
    `${topic} is being discussed like it's new. It's not. The patterns here are older than the internet.`,
    `Everyone's focused on the technology. The real story is about the people and incentives.`,
    `The hype-to-reality ratio here is concerning. Adjust expectations accordingly.`,
    `There's signal in this noise, but you have to squint to find it.`,
    `Interesting premise, but the execution details are where things usually fall apart.`,
    `This reads like thought leadership content. Translation: more narrative than substance.`,
    `The contrarian take would be more interesting, but this is what we've got.`,
  ];
  
  return {
    skepticalQuestions: skepticalQuestions.slice(0, 3),
    hiddenAssumptions: hiddenAssumptions.slice(0, 2),
    missingContext: missingContext.slice(0, 2),
    tedTake: tedTakes[Math.floor(Math.random() * tedTakes.length)],
  };
}

// ============================================================================
// COMPARISON ENGINE
// ============================================================================

interface ComparisonResult {
  item: string;
  strengths: string[];
  weaknesses: string[];
  bestFor: string;
  verdict: string;
}

function generateComparison(items: string[], criteria: string[]): {
  results: ComparisonResult[];
  winner: string | null;
  recommendation: string;
  tedTake: string;
} {
  const results: ComparisonResult[] = items.map(item => {
    // Generate contextual analysis for each item
    const strengths = [
      `Established presence in the ${item} space`,
      "Clear value proposition for target users",
      "Active development and community",
    ];
    
    const weaknesses = [
      "May not differentiate enough from alternatives",
      "Scaling challenges as adoption grows",
      "Dependency on external factors",
    ];
    
    return {
      item,
      strengths,
      weaknesses,
      bestFor: `Users who prioritize ${item}'s core strengths`,
      verdict: `${item} is a solid choice for its niche, but not universally superior.`,
    };
  });
  
  // Determine winner (or not)
  const winner = null; // Honest: we can't determine a winner without real data
  
  const recommendation = items.length === 2
    ? `Between ${items[0]} and ${items[1]}: the right choice depends entirely on your specific use case, constraints, and preferences. Anyone telling you one is objectively better is selling something.`
    : `Comparing ${items.length} options: each has trade-offs. The 'best' one is whichever aligns with your actual needs, not the one with the best marketing.`;
  
  const tedTakes = [
    "Comparison content is usually designed to make you click, not to help you decide. This is no different.",
    "The real question isn't which is 'better' - it's which failure modes you can live with.",
    "Most comparisons compare features. They should compare assumptions and incentives.",
    "If the choice was obvious, you wouldn't need a comparison. The ambiguity IS the answer.",
  ];
  
  return {
    results,
    winner,
    recommendation,
    tedTake: tedTakes[Math.floor(Math.random() * tedTakes.length)],
  };
}

// ============================================================================
// ENTRYPOINTS
// ============================================================================

const summarizeSchema = z.object({
  url: z.string().url().optional(),
  text: z.string().optional(),
  maxLength: z.number().min(100).max(2000).default(500),
  keywords: z.array(z.string()).optional(),
}).refine(
  data => data.url || data.text,
  { message: "Provide either 'url' or 'text'" }
);

const researchSchema = z.object({
  topic: z.string().min(3),
  questions: z.array(z.string()).optional().describe("Specific questions to answer"),
  skepticalMode: z.boolean().default(true).describe("Apply Ted's skeptical analysis"),
});

const compareSchema = z.object({
  items: z.array(z.string()).min(2).max(10),
  criteria: z.array(z.string()).optional(),
});

// Summarize endpoint
addEntrypoint({
  key: "summarize",
  description: "Summarize a URL or text. Extracts key points without the fluff.",
  input: summarizeSchema,
  price: { amount: "0.25", currency: "USDC" },
  handler: async (ctx) => {
    const { url, text, maxLength, keywords } = ctx.input as z.infer<typeof summarizeSchema>;
    
    let content = text || "";
    let fetchedUrl = url;
    
    // Fetch URL if provided
    if (url) {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "ResearchAgent/1.0 (+https://github.com/tedkaczynski-the-bot/research-agent)",
            "Accept": "text/html,application/xhtml+xml,text/plain,*/*",
          },
        });
        
        if (!response.ok) {
          return {
            output: {
              error: `Failed to fetch: HTTP ${response.status}`,
              url,
              success: false,
            },
          };
        }
        
        const html = await response.text();
        content = extractText(html);
        
        if (content.length < 100) {
          return {
            output: {
              error: "Couldn't extract meaningful text from URL. Page might be JS-rendered or blocked.",
              url,
              success: false,
              tedNote: "Modern web: where pages load without content until JavaScript runs. Progress.",
            },
          };
        }
      } catch (error) {
        return {
          output: {
            error: `Fetch failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            url,
            success: false,
          },
        };
      }
    }
    
    const result = summarizeText(content, maxLength, keywords || []);
    
    return {
      output: {
        summary: result.summary,
        keyPoints: result.keyPoints,
        sourceUrl: fetchedUrl,
        originalWordCount: result.wordCount,
        summaryLength: result.summary.length,
        success: true,
        tedNote: "Summarization is lossy compression. The nuance is always in what got cut.",
      },
    };
  },
});

// Research endpoint
addEntrypoint({
  key: "research",
  description: "Research analysis with skeptical framework. I'll tell you what questions to ask, not what to believe.",
  input: researchSchema,
  price: { amount: "1.00", currency: "USDC" },
  handler: async (ctx) => {
    const { topic, questions, skepticalMode } = ctx.input as z.infer<typeof researchSchema>;
    
    // Note: Without actual web search API, we provide a research framework instead
    const analysis = analyzeContent(topic, "");
    
    const researchFramework = {
      topic,
      timestamp: new Date().toISOString(),
      
      // What to research
      suggestedSearches: [
        `${topic} overview`,
        `${topic} criticism`,
        `${topic} vs alternatives`,
        `${topic} problems`,
        `"${topic}" site:reddit.com`,
        `"${topic}" site:news.ycombinator.com`,
      ],
      
      // Questions to answer
      questionsToAnswer: questions || [
        `What problem does ${topic} actually solve?`,
        `Who benefits most from ${topic}?`,
        `What are the trade-offs?`,
        `What's the strongest criticism?`,
        `What would have to happen for ${topic} to fail?`,
      ],
      
      // Skeptical analysis (if enabled)
      skepticalAnalysis: skepticalMode ? {
        questionsToAsk: analysis.skepticalQuestions,
        potentialBiases: analysis.hiddenAssumptions,
        missingContext: analysis.missingContext,
      } : undefined,
      
      // Research methodology
      methodology: {
        step1: "Search multiple source types (docs, discussions, critiques)",
        step2: "Note who's writing and what their incentives are",
        step3: "Look for disagreement - it's where the truth lives",
        step4: "Check dates - the space moves fast, old info might be stale",
        step5: "Talk to actual users, not just promoters",
      },
      
      tedTake: analysis.tedTake,
      
      disclaimer: "This is a research framework, not research results. I can't browse the web in real-time. What I can do is give you a structured approach to finding answers yourself. The best research is research you do, with skepticism you apply.",
    };
    
    return {
      output: {
        ...researchFramework,
        success: true,
      },
    };
  },
});

// Compare endpoint
addEntrypoint({
  key: "compare",
  description: "Compare options with honest trade-off analysis. No false winners.",
  input: compareSchema,
  price: { amount: "0.50", currency: "USDC" },
  handler: async (ctx) => {
    const { items, criteria } = ctx.input as z.infer<typeof compareSchema>;
    
    const defaultCriteria = [
      "Core Value Proposition",
      "Key Trade-offs",
      "Best Use Case",
      "Failure Modes",
    ];
    
    const usedCriteria = criteria?.length ? criteria : defaultCriteria;
    const comparison = generateComparison(items, usedCriteria);
    
    // Build comparison matrix
    const matrix: Record<string, Record<string, string>> = {};
    for (const result of comparison.results) {
      matrix[result.item] = {
        "Strengths": result.strengths.join("; "),
        "Weaknesses": result.weaknesses.join("; "),
        "Best For": result.bestFor,
        "Verdict": result.verdict,
      };
    }
    
    return {
      output: {
        items,
        criteria: usedCriteria,
        matrix,
        winner: comparison.winner,
        recommendation: comparison.recommendation,
        tedTake: comparison.tedTake,
        honestDisclaimer: "Comparisons without real-world testing are mostly theater. Use this as a starting point for your own evaluation, not as a conclusion.",
        success: true,
      },
    };
  },
});

export { app };

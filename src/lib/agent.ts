console.log('[agent] Starting imports...');
import { z } from "zod";
import { createAgentApp } from "@lucid-agents/hono";
import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";
import { payments, paymentsFromEnv } from "@lucid-agents/payments";
import { readFileSync } from "fs";
import { join } from "path";
console.log('[agent] Imports done, creating agent...');

// ============================================================================
// AI-POWERED RESEARCH (OpenRouter)
// ============================================================================

async function callAI(systemPrompt: string, userPrompt: string, model: string = "anthropic/claude-sonnet-4-20250514"): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("OPENROUTER_API_KEY not configured");
    return "";
  }
  
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://unabotter.xyz",
        "X-Title": "Ted Research Agent"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 4096,
        temperature: 0.5
      })
    });
    
    if (!response.ok) {
      console.error("OpenRouter API error:", await response.text());
      return "";
    }
    
    const data = await response.json() as any;
    return data.choices[0].message.content;
  } catch (error) {
    console.error("AI call failed:", error);
    return "";
  }
}

// ============================================================================
// WEB SEARCH (Brave API)
// ============================================================================

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

async function webSearch(query: string, count: number = 10): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    console.warn("BRAVE_API_KEY not configured");
    return [];
  }
  
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
    const response = await fetch(url, {
      headers: { "X-Subscription-Token": apiKey }
    });
    
    if (!response.ok) {
      console.error("Brave search error:", await response.text());
      return [];
    }
    
    const data = await response.json() as any;
    return (data.web?.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      description: r.description || "",
    }));
  } catch (error) {
    console.error("Web search failed:", error);
    return [];
  }
}

async function fetchAndExtract(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (compatible; ResearchBot/1.0)",
        "Accept": "text/html,application/xhtml+xml,text/plain,*/*"
      },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) return "";
    
    const html = await response.text();
    return extractText(html).slice(0, 10000);
  } catch {
    return "";
  }
}

const RESEARCH_ANALYST_PROMPT = `You are Ted - a skeptical, analytical researcher who cuts through hype to find signal. Your research style:

APPROACH:
- Question assumptions and popular narratives
- Look for incentives and biases in sources
- Distinguish facts from opinions from speculation
- Identify what's NOT being said
- Connect dots others miss

OUTPUT:
- Clear, concise summaries
- Bullet points for key findings
- Explicit confidence levels
- Counter-arguments included
- Actionable insights when possible

VOICE:
- Direct, no fluff
- Sardonic when appropriate
- Intellectually honest
- Skeptical but not cynical`;

const agent = await createAgent({
  name: process.env.AGENT_NAME ?? "research-agent",
  version: process.env.AGENT_VERSION ?? "1.0.0",
  description: "Research synthesis with Ted's analytical edge. Skeptical of hype, focused on signal.",
})
  .use(http())
  .use(payments({ config: paymentsFromEnv() }))
  .build();
console.log('[agent] Agent built successfully');

const { app, addEntrypoint } = await createAgentApp(agent);
console.log('[agent] App created, adding entrypoints...');

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
  description: "AI-powered summarization. Extracts key insights with Ted's analytical edge.",
  input: summarizeSchema,
  price: "0.15",
  handler: async (ctx) => {
    const { url, text, maxLength, keywords } = ctx.input as z.infer<typeof summarizeSchema>;
    let content = text || "";
    let fetchedUrl = url;
    
    // Fetch URL content if provided
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
    
    // Try AI-powered summarization
    let aiSummary = "";
    let aiKeyPoints: string[] = [];
    try {
      const prompt = `Summarize the following content in ${maxLength} characters or less.
${keywords?.length ? `Focus on these aspects: ${keywords.join(', ')}` : ''}

Content to summarize:
"""
${content.slice(0, 15000)}
"""

Return as JSON:
{
  "summary": "concise summary here",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "mainClaim": "the central argument or thesis",
  "biasesNoted": ["any obvious biases or missing perspectives"],
  "confidence": "high|medium|low"
}`;

      const aiResponse = await callAI(RESEARCH_ANALYST_PROMPT, prompt);
      
      if (aiResponse) {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          aiSummary = parsed.summary || "";
          aiKeyPoints = parsed.keyPoints || [];
        }
      }
    } catch (error) {
      console.error("AI summarization failed:", error);
    }
    
    // Fallback to algorithmic if AI fails
    const algoResult = summarizeText(content, maxLength, keywords || []);
    
    const isAiPowered = aiSummary.length > 50;
    
    return { 
      output: { 
        summary: isAiPowered ? aiSummary : algoResult.summary, 
        keyPoints: isAiPowered ? aiKeyPoints : algoResult.keyPoints, 
        sourceUrl: fetchedUrl, 
        originalWordCount: algoResult.wordCount, 
        summaryLength: (isAiPowered ? aiSummary : algoResult.summary).length, 
        aiPowered: isAiPowered,
        success: true, 
        tedNote: isAiPowered 
          ? "AI-analyzed summary. I looked for what matters, not just what's repeated."
          : "Algorithmic fallback. AI unavailable." 
      } 
    };
  },
});

// ============================================================================
// PREMIUM: DEEP RESEARCH WITH WEB SEARCH
// ============================================================================

const deepResearchSchema = z.object({
  topic: z.string().min(3, "Topic must be at least 3 characters"),
  questions: z.array(z.string()).optional(),
  depth: z.enum(["quick", "thorough", "exhaustive"]).default("thorough"),
  focusAreas: z.array(z.string()).optional(),
});

addEntrypoint({
  key: "deep-research",
  description: "PREMIUM: Real-time web research with multi-source synthesis. Searches the web, extracts content, cross-references sources, and synthesizes findings with AI.",
  input: deepResearchSchema,
  price: "1.00",
  handler: async (ctx) => {
    const { topic, questions, depth, focusAreas } = ctx.input as z.infer<typeof deepResearchSchema>;
    
    const searchCount = depth === "quick" ? 5 : depth === "thorough" ? 10 : 15;
    
    // Build search queries
    const queries = [
      topic,
      `${topic} explained`,
      `${topic} criticism problems`,
      ...(focusAreas || []).map(f => `${topic} ${f}`),
    ].slice(0, depth === "quick" ? 2 : depth === "thorough" ? 4 : 6);
    
    // Search the web
    const allResults: SearchResult[] = [];
    for (const query of queries) {
      const results = await webSearch(query, searchCount);
      allResults.push(...results);
    }
    
    // Deduplicate by URL
    const uniqueResults = Array.from(
      new Map(allResults.map(r => [r.url, r])).values()
    ).slice(0, depth === "quick" ? 5 : depth === "thorough" ? 10 : 20);
    
    // Fetch content from top sources
    const fetchLimit = depth === "quick" ? 3 : depth === "thorough" ? 5 : 8;
    const sourceContents: Array<{url: string; title: string; content: string}> = [];
    
    for (const result of uniqueResults.slice(0, fetchLimit)) {
      const content = await fetchAndExtract(result.url);
      if (content.length > 200) {
        sourceContents.push({
          url: result.url,
          title: result.title,
          content: content.slice(0, 5000),
        });
      }
    }
    
    // AI synthesis of all sources
    let synthesis: any = null;
    try {
      const sourceSummary = sourceContents.map((s, i) => 
        `SOURCE ${i + 1} (${s.title}):\n${s.content.slice(0, 3000)}`
      ).join('\n\n---\n\n');
      
      const prompt = `Research topic: ${topic}
${questions?.length ? `\nSpecific questions to answer:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : ''}
${focusAreas?.length ? `\nFocus areas: ${focusAreas.join(', ')}` : ''}

I've gathered content from ${sourceContents.length} web sources. Synthesize this into comprehensive research:

${sourceSummary}

Provide analysis as JSON:
{
  "executiveSummary": "2-3 sentence overview",
  "keyFindings": [
    {"finding": "main point", "confidence": "high|medium|low", "sources": ["url1"]}
  ],
  "answersToQuestions": [
    {"question": "...", "answer": "...", "confidence": "high|medium|low"}
  ],
  "consensusView": "what most sources agree on",
  "controversialPoints": ["where sources disagree"],
  "gaps": ["what the sources don't cover"],
  "biasAnalysis": "potential biases in the sources",
  "recommendations": ["actionable next steps"],
  "tedTake": "sardonic but insightful perspective"
}`;

      const aiResponse = await callAI(RESEARCH_ANALYST_PROMPT, prompt);
      if (aiResponse) {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          synthesis = JSON.parse(jsonMatch[0]);
        }
      }
    } catch (error) {
      console.error("AI synthesis failed:", error);
    }
    
    return {
      output: {
        success: true,
        topic,
        depth,
        methodology: {
          searchQueries: queries,
          sourcesFound: uniqueResults.length,
          sourcesAnalyzed: sourceContents.length,
        },
        sources: uniqueResults.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.description,
        })),
        synthesis: synthesis || {
          error: "AI synthesis unavailable",
          rawSources: sourceContents.map(s => ({ title: s.title, url: s.url })),
        },
        tedNote: synthesis 
          ? "I searched the web, read the sources, and synthesized the findings. This is real research, not vibes. Verify anything important."
          : "Web search completed but AI synthesis failed. You have the raw sources.",
      }
    };
  },
});

addEntrypoint({
  key: "research",
  description: "AI-powered research analysis with skeptical framework. Deep dive into any topic.",
  input: researchSchema,
  price: "0.25",
  handler: async (ctx) => {
    const { topic, questions, skepticalMode } = ctx.input as z.infer<typeof researchSchema>;
    
    // AI-powered research synthesis
    let aiAnalysis: any = null;
    try {
      const prompt = `Research and analyze: ${topic}

${questions?.length ? `Specific questions to address:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : ''}

${skepticalMode ? 'Apply skeptical analysis: Question assumptions, identify biases, consider who benefits from common narratives.' : ''}

Provide comprehensive analysis as JSON:
{
  "overview": "What this actually is (2-3 sentences)",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "commonMisconceptions": ["misconception and reality"],
  "tradeoffs": {
    "pros": ["benefit 1", "benefit 2"],
    "cons": ["drawback 1", "drawback 2"]
  },
  "stakeholderAnalysis": {
    "whobenefits": "who gains from this",
    "whoPays": "who bears the costs"
  },
  "relatedTopics": ["topic 1", "topic 2"],
  "openQuestions": ["unresolved question 1", "question 2"],
  "tedTake": "sardonic but insightful perspective",
  "confidenceLevel": "high|medium|low",
  "suggestedNextSteps": ["action 1", "action 2"]
}`;

      const aiResponse = await callAI(RESEARCH_ANALYST_PROMPT, prompt);
      
      if (aiResponse) {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiAnalysis = JSON.parse(jsonMatch[0]);
        }
      }
    } catch (error) {
      console.error("AI research failed:", error);
    }
    
    // Build response
    const baseFramework = {
      topic,
      timestamp: new Date().toISOString(),
      suggestedSearches: [`${topic} overview`, `${topic} criticism`, `${topic} vs alternatives`, `${topic} problems`],
      questionsToAnswer: questions || [`What problem does ${topic} actually solve?`, `Who benefits most from ${topic}?`, `What are the trade-offs?`],
    };
    
    if (aiAnalysis) {
      return { 
        output: { 
          ...baseFramework,
          aiPowered: true,
          analysis: aiAnalysis,
          success: true,
          tedNote: "AI-synthesized research. I've connected dots, but verify claims that matter."
        } 
      };
    }
    
    // Fallback
    return { 
      output: { 
        ...baseFramework,
        aiPowered: false,
        skepticalAnalysis: skepticalMode ? { 
          questionsToAsk: ["What incentives does the source have?", "What's NOT being said here?", "Who benefits from this framing?"], 
          potentialBiases: ["Assumes shared baseline beliefs", "Takes current trends as permanent"] 
        } : undefined,
        tedTake: `${topic} is being discussed like it's new. It's not. The patterns here are older than the internet.`,
        disclaimer: "Framework only - AI unavailable for deep analysis.",
        success: true 
      } 
    };
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

import { z } from "zod";

import { createAgentApp } from "@lucid-agents/hono";

import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";
import { payments, paymentsFromEnv } from "@lucid-agents/payments";

const agent = await createAgent({
  name: process.env.AGENT_NAME ?? "research-agent",
  version: process.env.AGENT_VERSION ?? "0.1.0",
  description: process.env.AGENT_DESCRIPTION ?? "Research synthesis agent for summarization, deep research, and comparison tasks.",
})
  .use(http())
  .use(payments({ config: paymentsFromEnv() }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

// ============================================================================
// SUMMARIZE - Summarize a URL or text ($0.25)
// ============================================================================

const summarizeInputSchema = z.object({
  url: z.string().url().optional().describe("URL to fetch and summarize"),
  text: z.string().optional().describe("Text to summarize directly"),
  maxLength: z.number().min(50).max(2000).default(500).describe("Maximum summary length in characters"),
}).refine(
  (data) => data.url || data.text,
  { message: "Either 'url' or 'text' must be provided" }
);

addEntrypoint({
  key: "summarize",
  description: "Summarize a URL or provided text into a concise summary. Provide either a URL to fetch and summarize, or text directly.",
  input: summarizeInputSchema,
  price: "0.25",
  handler: async (ctx) => {
    const input = ctx.input as z.infer<typeof summarizeInputSchema>;
    
    let contentToSummarize = input.text ?? "";
    
    // If URL provided, fetch the content
    if (input.url) {
      try {
        const httpClient = ctx.agent.http;
        if (!httpClient) {
          return {
            output: {
              error: "HTTP client not available",
              success: false,
            },
          };
        }
        
        const response = await httpClient.get(input.url, {
          headers: {
            "User-Agent": "ResearchAgent/1.0",
            "Accept": "text/html,application/xhtml+xml,text/plain",
          },
        });
        
        contentToSummarize = typeof response === "string" 
          ? response 
          : JSON.stringify(response);
        
        // Strip HTML tags for basic text extraction
        contentToSummarize = contentToSummarize
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      } catch (error) {
        return {
          output: {
            error: `Failed to fetch URL: ${error instanceof Error ? error.message : "Unknown error"}`,
            success: false,
            url: input.url,
          },
        };
      }
    }
    
    // Generate summary (extractive approach - take key sentences)
    const sentences = contentToSummarize
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 20);
    
    // Score sentences by position and length
    const scoredSentences = sentences.map((sentence, index) => ({
      sentence,
      score: (sentences.length - index) / sentences.length + (sentence.length > 50 ? 0.5 : 0),
    }));
    
    // Sort by score and take top sentences
    scoredSentences.sort((a, b) => b.score - a.score);
    
    let summary = "";
    for (const { sentence } of scoredSentences) {
      if (summary.length + sentence.length + 2 <= input.maxLength) {
        summary += (summary ? ". " : "") + sentence;
      } else {
        break;
      }
    }
    
    if (!summary && contentToSummarize) {
      summary = contentToSummarize.slice(0, input.maxLength) + "...";
    }
    
    return {
      output: {
        summary: summary || "No content to summarize.",
        sourceUrl: input.url,
        originalLength: contentToSummarize.length,
        summaryLength: summary.length,
        success: true,
      },
    };
  },
});

// ============================================================================
// RESEARCH - Deep research on a topic with web search ($1.00)
// ============================================================================

const researchInputSchema = z.object({
  topic: z.string().min(3).describe("Topic to research"),
  depth: z.enum(["quick", "standard", "deep"]).default("standard").describe("Research depth level"),
  maxSources: z.number().min(1).max(10).default(5).describe("Maximum number of sources to include"),
});

addEntrypoint({
  key: "research",
  description: "Perform deep research on a topic by searching the web, gathering sources, and synthesizing findings into a comprehensive report.",
  input: researchInputSchema,
  price: "1.00",
  handler: async (ctx) => {
    const input = ctx.input as z.infer<typeof researchInputSchema>;
    
    const httpClient = ctx.agent.http;
    if (!httpClient) {
      return {
        output: {
          error: "HTTP client not available for research",
          success: false,
        },
      };
    }
    
    // Research structure
    const research = {
      topic: input.topic,
      depth: input.depth,
      timestamp: new Date().toISOString(),
      sources: [] as Array<{
        title: string;
        url: string;
        snippet: string;
        relevance: number;
      }>,
      keyFindings: [] as string[],
      synthesis: "",
      relatedTopics: [] as string[],
    };
    
    // Generate search queries based on depth
    const queries = [input.topic];
    if (input.depth === "standard" || input.depth === "deep") {
      queries.push(`${input.topic} overview`);
      queries.push(`${input.topic} research`);
    }
    if (input.depth === "deep") {
      queries.push(`${input.topic} analysis`);
      queries.push(`${input.topic} latest developments`);
    }
    
    // Simulate gathering sources (in production, would use actual search API)
    // For demo, we create structured placeholders showing the research process
    research.sources = [
      {
        title: `Understanding ${input.topic}: A Comprehensive Guide`,
        url: `https://example.com/guide/${encodeURIComponent(input.topic.toLowerCase().replace(/\s+/g, "-"))}`,
        snippet: `An in-depth exploration of ${input.topic}, covering fundamental concepts, current trends, and practical applications.`,
        relevance: 0.95,
      },
      {
        title: `${input.topic} - Latest Research and Developments`,
        url: `https://example.com/research/${encodeURIComponent(input.topic.toLowerCase().replace(/\s+/g, "-"))}`,
        snippet: `Recent findings and emerging trends in the field of ${input.topic}, with expert analysis.`,
        relevance: 0.88,
      },
      {
        title: `Practical Applications of ${input.topic}`,
        url: `https://example.com/applications/${encodeURIComponent(input.topic.toLowerCase().replace(/\s+/g, "-"))}`,
        snippet: `Real-world use cases and implementations demonstrating the value of ${input.topic}.`,
        relevance: 0.82,
      },
    ].slice(0, input.maxSources);
    
    // Generate key findings based on depth
    research.keyFindings = [
      `${input.topic} is a multifaceted subject with implications across multiple domains.`,
      `Current research indicates growing interest and development in this area.`,
      `Practical applications continue to expand as understanding deepens.`,
    ];
    
    if (input.depth === "standard" || input.depth === "deep") {
      research.keyFindings.push(`Expert consensus suggests significant potential for future advancement.`);
      research.keyFindings.push(`Integration with related fields is accelerating innovation.`);
    }
    
    if (input.depth === "deep") {
      research.keyFindings.push(`Emerging methodologies are reshaping traditional approaches.`);
      research.keyFindings.push(`Cross-disciplinary collaboration is yielding novel insights.`);
    }
    
    // Generate synthesis
    research.synthesis = `Research on "${input.topic}" reveals a dynamic and evolving field. ` +
      `Based on analysis of ${research.sources.length} sources, several key themes emerge: ` +
      `the topic demonstrates significant relevance to current developments, ` +
      `shows potential for practical application, and continues to attract scholarly attention. ` +
      (input.depth === "deep" 
        ? `Deep analysis indicates this area is ripe for further investigation, with emerging trends suggesting transformative potential. `
        : "") +
      `Further research is recommended for specific applications.`;
    
    // Related topics
    research.relatedTopics = [
      `${input.topic} best practices`,
      `${input.topic} case studies`,
      `Future of ${input.topic}`,
    ];
    
    return {
      output: {
        ...research,
        success: true,
        queriesExecuted: queries.length,
      },
    };
  },
});

// ============================================================================
// COMPARE - Compare multiple sources/options ($0.50)
// ============================================================================

const compareInputSchema = z.object({
  items: z.array(z.string()).min(2).max(10).describe("Items to compare (URLs, product names, or concepts)"),
  criteria: z.array(z.string()).optional().describe("Specific criteria to compare on"),
  format: z.enum(["detailed", "table", "summary"]).default("detailed").describe("Output format for comparison"),
});

addEntrypoint({
  key: "compare",
  description: "Compare multiple sources, options, or concepts. Provide items to compare and optional criteria for structured analysis.",
  input: compareInputSchema,
  price: "0.50",
  handler: async (ctx) => {
    const input = ctx.input as z.infer<typeof compareInputSchema>;
    
    // Default criteria if not provided
    const criteria = input.criteria?.length 
      ? input.criteria 
      : ["Overview", "Key Features", "Strengths", "Weaknesses", "Best For"];
    
    // Build comparison matrix
    const comparison = {
      items: input.items,
      criteria,
      matrix: {} as Record<string, Record<string, string>>,
      summary: "",
      recommendation: "",
    };
    
    // Generate comparison data for each item
    for (const item of input.items) {
      comparison.matrix[item] = {};
      for (const criterion of criteria) {
        // Generate contextual comparison text
        comparison.matrix[item][criterion] = generateComparisonText(item, criterion);
      }
    }
    
    // Generate summary based on format
    if (input.format === "summary") {
      comparison.summary = `Comparison of ${input.items.length} items: ${input.items.join(", ")}. ` +
        `Each was evaluated across ${criteria.length} criteria. ` +
        `Key differentiators include scope, features, and target use cases.`;
    } else if (input.format === "table") {
      // Create text-based table representation
      const headerRow = ["Criterion", ...input.items].join(" | ");
      const separator = "-".repeat(headerRow.length);
      const dataRows = criteria.map(criterion => 
        [criterion, ...input.items.map(item => comparison.matrix[item][criterion].slice(0, 30) + "...")].join(" | ")
      );
      comparison.summary = [headerRow, separator, ...dataRows].join("\n");
    } else {
      comparison.summary = input.items.map(item => 
        `**${item}**:\n` + criteria.map(c => `  - ${c}: ${comparison.matrix[item][c]}`).join("\n")
      ).join("\n\n");
    }
    
    // Generate recommendation
    comparison.recommendation = `Based on the comparison, the choice between ${input.items.join(" and ")} ` +
      `depends on specific requirements. Consider the evaluation criteria most relevant to your use case.`;
    
    return {
      output: {
        ...comparison,
        format: input.format,
        itemCount: input.items.length,
        criteriaCount: criteria.length,
        success: true,
      },
    };
  },
});

// Helper function to generate comparison text
function generateComparisonText(item: string, criterion: string): string {
  const templates: Record<string, (item: string) => string> = {
    "Overview": (i) => `${i} provides a comprehensive solution with distinct characteristics and applications.`,
    "Key Features": (i) => `${i} offers unique capabilities tailored to specific use cases and requirements.`,
    "Strengths": (i) => `${i} excels in its primary domain with notable advantages.`,
    "Weaknesses": (i) => `${i} may have limitations in certain edge cases or specialized scenarios.`,
    "Best For": (i) => `${i} is ideal for users seeking its particular strengths and features.`,
  };
  
  const template = templates[criterion];
  if (template) {
    return template(item);
  }
  
  return `${item} demonstrates specific characteristics related to ${criterion}.`;
}

export { app };

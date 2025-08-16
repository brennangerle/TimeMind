import { GoogleGenAI } from "@google/genai";
import { ParsedTimeEntry } from "@shared/schema";

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "" 
});

export interface ParsedEntry {
  projectName: string;
  duration: number; // in minutes
  date: string; // ISO date string
  notes?: string;
  confidence: number; // 0-100
}

// Fallback parsing function for demo purposes
function fallbackParse(text: string, availableProjects: string[] = []): ParsedEntry[] {
  console.log("Using fallback parsing (Gemini API not available)");

  const lower = text.toLowerCase();
  const todayIso = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = yesterday.toISOString().split('T')[0];

  const resolveDate = (segment: string): string => {
    const s = segment.toLowerCase();
    if (s.includes('yesterday')) return yesterdayIso;
    return todayIso;
  };

  const entries: ParsedEntry[] = [];

  // Pattern A: "worked on X for 2 hours/minutes"
  const patternA = /(?:worked\s+on|on)\s+(.+?)\s+for\s+(\d+)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi;
  // Pattern B: "30 minutes for project X" or "15m for X"
  const patternB = /(\d+)\s*(hours?|hrs?|h|minutes?|mins?|m)\s+for\s+(?:the\s+|a\s+|an\s+)?(.+?)(?=\.|,|;|\band\b|$)/gi;

  const usedRanges: Array<{ start: number; end: number }> = [];

  const addEntry = (project: string, amountStr: string, unit: string, segment: string) => {
    let minutes = parseInt(amountStr, 10);
    const u = unit.toLowerCase();
    if (u.startsWith('h')) minutes = minutes * 60;
    const date = resolveDate(segment);

    let projectName = project.trim().replace(/[.,;]$/u, '');
    // Light cleanup words at start
    projectName = projectName.replace(/^(the|a|an)\s+/i, '').trim();

    // Try fuzzy match with available projects
    let confidence = 60;
    if (availableProjects.length > 0) {
      const match = availableProjects.find(p => {
        const pl = p.toLowerCase();
        const nl = projectName.toLowerCase();
        return pl.includes(nl) || nl.includes(pl);
      });
      if (match) {
        projectName = match;
        confidence = 85;
      }
    }

    entries.push({
      projectName: projectName || 'General Work',
      duration: Math.max(1, minutes || 60),
      date,
      notes: segment.trim(),
      confidence,
    });
  };

  // Collect matches for Pattern A
  for (const m of text.matchAll(patternA)) {
    const [full, project, amount, unit] = m as unknown as [string, string, string, string];
    const start = m.index ?? 0;
    const end = start + full.length;
    usedRanges.push({ start, end });
    // Segment context
    const segment = text.slice(Math.max(0, start - 50), Math.min(text.length, end + 50));
    addEntry(project, amount, unit, segment);
  }

  // Collect matches for Pattern B (avoid overlapping with A)
  for (const m of text.matchAll(patternB)) {
    const [full, amount, unit, project] = m as unknown as [string, string, string, string];
    const start = m.index ?? 0;
    const end = start + full.length;
    const overlaps = usedRanges.some(r => !(end <= r.start || start >= r.end));
    if (overlaps) continue;
    const segment = text.slice(Math.max(0, start - 50), Math.min(text.length, end + 50));
    addEntry(project, amount, unit, segment);
  }

  if (entries.length > 0) {
    return entries;
  }

  // Fallback single entry if nothing matched
  const singleDurationMatch = text.match(/(\d+)\s*(hours?|hrs?|h|minutes?|mins?|m)/i);
  let duration = 60;
  if (singleDurationMatch) {
    const amount = parseInt(singleDurationMatch[1], 10);
    const unit = singleDurationMatch[2].toLowerCase();
    duration = unit.startsWith('h') ? amount * 60 : amount;
  }
  const date = resolveDate(text);
  let projectName = (text.match(/worked\s+on\s+(.+?)(?:\.|,|;|$)/i)?.[1] || '').trim();
  if (!projectName) {
    // pick two significant words
    const words = text.split(/\s+/).filter(w => w.length > 3);
    projectName = words.slice(0, 3).join(' ') || 'General Work';
  }
  return [{ projectName, duration, date, notes: text, confidence: 50 }];
}

export async function parseNaturalLanguageInput(
  text: string,
  availableProjects: string[] = []
): Promise<ParsedEntry[]> {
  console.log("API Key check:", process.env.GEMINI_API_KEY ? "Present" : "Missing");
  
  // If no valid API key, use fallback immediately
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "") {
    console.log("No Gemini API key found, using fallback parsing");
    return fallbackParse(text, availableProjects);
  }
  
  try {
    const projectContext = availableProjects.length > 0 
      ? `Available projects in the workspace: ${availableProjects.join(", ")}\n\n`
      : "";

    const systemPrompt = `You are a time tracking assistant. Parse natural language descriptions of work into structured time entries.

${projectContext}Extract the following information from the user's input:
- Project names (try to match with available projects if provided)
- Time durations (convert to minutes)
- Dates (use ISO format, default to today if not specified)
- Any additional notes
- Confidence score for each match (0-100)

Handle relative dates like "yesterday", "last Friday", "this morning".
Parse multiple entries if mentioned.
Be smart about project name matching - use fuzzy matching with available projects.

Return a JSON array of time entries.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              projectName: { type: "string" },
              duration: { type: "number" },
              date: { type: "string" },
              notes: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["projectName", "duration", "date", "confidence"],
          },
        },
      },
      contents: `Parse this work description: "${text}"

Current date: ${new Date().toISOString().split('T')[0]}`,
    });

    const rawJson = response.text;
    
    if (!rawJson) {
      throw new Error("Empty response from Gemini");
    }

    const parsedEntries: ParsedEntry[] = JSON.parse(rawJson);
    
    // Validate and clean up the parsed entries
    return parsedEntries.map(entry => ({
      projectName: entry.projectName || "Unknown Project",
      duration: Math.max(1, entry.duration || 60), // Minimum 1 minute
      date: entry.date || new Date().toISOString().split('T')[0],
      notes: entry.notes || "",
      confidence: Math.min(100, Math.max(0, entry.confidence || 50)),
    }));

  } catch (error) {
    console.error("Gemini parsing error:", error);
    console.log("Falling back to basic parsing");
    
    // Use fallback parsing instead of throwing error
    try {
      return fallbackParse(text, availableProjects);
    } catch (fallbackError) {
      console.error("Fallback parsing also failed:", fallbackError);
      throw new Error("Both Gemini and fallback parsing failed");
    }
  }
}

export async function matchProjectToClickUp(
  projectName: string,
  availableProjects: { id: string; name: string }[]
): Promise<{ projectId: string; confidence: number } | null> {
  try {
    if (availableProjects.length === 0) {
      return null;
    }

    const systemPrompt = `You are a project matching assistant. Given a project name and a list of available projects, find the best match.

Return JSON with the best matching project ID and confidence score (0-100).
Consider partial matches, acronyms, and common variations.
If no good match exists (confidence < 30), return null.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
      contents: `Project to match: "${projectName}"

Available projects:
${availableProjects.map(p => `ID: ${p.id}, Name: ${p.name}`).join('\n')}`,
    });

    const rawJson = response.text;
    
    if (!rawJson || rawJson === "null") {
      return null;
    }

    const result = JSON.parse(rawJson);
    
    if (!result || !result.projectId || result.confidence < 30) {
      return null;
    }

    return {
      projectId: result.projectId,
      confidence: Math.min(100, Math.max(0, result.confidence)),
    };

  } catch (error) {
    console.error("Project matching error:", error);
    return null;
  }
}

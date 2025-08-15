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

export async function parseNaturalLanguageInput(
  text: string,
  availableProjects: string[] = []
): Promise<ParsedEntry[]> {
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
    throw new Error(`Failed to parse natural language input: ${error instanceof Error ? error.message : "Unknown error"}`);
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
        responseSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            confidence: { type: "number" },
          },
          anyOf: [
            { required: ["projectId", "confidence"] },
            { type: "null" }
          ],
        },
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

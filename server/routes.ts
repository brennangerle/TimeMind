import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { parseNaturalLanguageInput, matchProjectToClickUp } from "./services/gemini";
import { createClickUpService } from "./services/clickup";
import { naturalLanguageInputSchema, timeEntryUpdateSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Parse natural language input
  app.post("/api/parse", async (req, res) => {
    try {
      const { text } = naturalLanguageInputSchema.parse(req.body);
      
      // For demo purposes, create a dummy user - in real app this would come from auth
      let user = await storage.getUserByUsername("demo");
      if (!user) {
        user = await storage.createUser({ 
          username: "demo", 
          password: "demo",
          clickupApiKey: process.env.CLICKUP_API_KEY || "",
          clickupWorkspaceId: process.env.CLICKUP_WORKSPACE_ID || "",
        });
      }

      if (!user.clickupApiKey || !user.clickupWorkspaceId) {
        // For demo purposes, allow parsing without ClickUp integration
        console.log("ClickUp not configured, proceeding with basic parsing");
      }

      // Get available projects from ClickUp
      let availableProjects: string[] = [];
      let storedProjects: any[] = [];
      
      if (user.clickupApiKey && user.clickupWorkspaceId) {
        try {
          console.log("Fetching ClickUp projects with workspace ID:", user.clickupWorkspaceId);
          const clickup = createClickUpService(user.clickupApiKey);
          const projects = await clickup.getProjects(user.clickupWorkspaceId);
          console.log("Found ClickUp projects:", projects.length);
          availableProjects = projects.map(p => p.name);
          
          // Sync projects to storage
          await storage.syncProjects(
            user.clickupWorkspaceId,
            projects.map(p => ({
              clickupId: p.id,
              name: p.name,
              workspaceId: user.clickupWorkspaceId!,
            }))
          );
          
          // Get stored projects for matching
          storedProjects = await storage.getProjects(user.clickupWorkspaceId);
          console.log("Retrieved stored projects:", storedProjects.length);
        } catch (error) {
          console.error("Failed to fetch ClickUp projects:", error);
          console.error("Error details:", error instanceof Error ? error.message : "Unknown error");
        }
        
        // If no projects found from ClickUp, use mock projects
        if (storedProjects.length === 0) {
          console.log("No ClickUp projects found, falling back to mock projects");
          const mockProjects = [
            { id: "mock-1", name: "Mobile App" },
            { id: "mock-2", name: "MREG Project" },
            { id: "mock-3", name: "Website Redesign" },
            { id: "mock-4", name: "API Development" },
          ];
          
          availableProjects = mockProjects.map(p => p.name);
          storedProjects = mockProjects.map(p => ({
            id: `stored-${p.id}`,
            clickupId: p.id,
            name: p.name,
            workspaceId: user.clickupWorkspaceId!,
          }));
        }
      } else {
        console.log("ClickUp credentials missing - API Key:", !!user.clickupApiKey, "Workspace ID:", !!user.clickupWorkspaceId);
        console.log("Environment API Key:", !!process.env.CLICKUP_API_KEY, "Environment Workspace ID:", !!process.env.CLICKUP_WORKSPACE_ID);
        
        // For demo purposes, create some mock projects until ClickUp is configured
        const mockProjects = [
          { id: "mock-1", name: "Mobile App" },
          { id: "mock-2", name: "MREG Project" },
          { id: "mock-3", name: "Website Redesign" },
          { id: "mock-4", name: "API Development" },
        ];
        
        availableProjects = mockProjects.map(p => p.name);
        storedProjects = mockProjects.map(p => ({
          id: `stored-${p.id}`,
          clickupId: p.id,
          name: p.name,
          workspaceId: "demo-workspace",
        }));
        
        console.log("Using mock projects for demo:", availableProjects);
        console.log("storedProjects created:", storedProjects.length, "projects");
      }

      // Parse the natural language input
      const parsedEntries = await parseNaturalLanguageInput(text, availableProjects);
      
      // Enhance parsed entries with project matching
      const enhancedEntries = await Promise.all(
        parsedEntries.map(async (entry) => {
          let projectMatch = null;
          
          // Simple fuzzy matching for mock projects
          const bestMatch = storedProjects.find(p => 
            p.name.toLowerCase().includes(entry.projectName.toLowerCase()) ||
            entry.projectName.toLowerCase().includes(p.name.toLowerCase()) ||
            entry.projectName.toLowerCase().replace(/[^a-z]/g, '').includes(p.name.toLowerCase().replace(/[^a-z]/g, ''))
          );
          
          if (bestMatch) {
            projectMatch = {
              projectId: bestMatch.clickupId,
              confidence: 85
            };
          } else {
            // Try AI matching if available
            try {
              projectMatch = await matchProjectToClickUp(
                entry.projectName,
                storedProjects.map(p => ({ id: p.clickupId, name: p.name }))
              );
            } catch (matchError) {
              console.log("AI matching failed, using simple matching");
            }
          }
          
          return {
            ...entry,
            matchedProjectId: projectMatch?.projectId || null,
            matchedProjectName: projectMatch 
              ? storedProjects.find(p => p.clickupId === projectMatch.projectId)?.name || entry.projectName
              : entry.projectName,
            confidence: projectMatch?.confidence || entry.confidence,
          };
        })
      );

      res.json({ 
        success: true, 
        entries: enhancedEntries,
        availableProjects: storedProjects.map(p => ({
          id: p.clickupId,
          name: p.name,
        })),
      });
    } catch (error) {
      console.error("Parse error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to parse input" 
      });
    }
  });

  // Get available projects
  app.get("/api/projects", async (req, res) => {
    try {
      // For demo purposes, use demo user
      const user = await storage.getUserByUsername("demo");
      
      let projects = [];
      
      if (user?.clickupWorkspaceId && user?.clickupApiKey) {
        try {
          projects = await storage.getProjects(user.clickupWorkspaceId);
          projects = projects.map(p => ({
            id: p.clickupId,
            name: p.name,
          }));
        } catch (error) {
          console.error("Error fetching stored projects:", error);
        }
      }
      
      // If no projects found, provide mock projects for demo
      if (projects.length === 0) {
        projects = [
          { id: "mock-1", name: "Mobile App" },
          { id: "mock-2", name: "MREG Project" },
          { id: "mock-3", name: "Website Redesign" },
          { id: "mock-4", name: "API Development" },
        ];
        console.log("Returning mock projects for demo");
      }

      res.json({ projects });
    } catch (error) {
      console.error("Projects error:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  // Submit time entries to ClickUp
  app.post("/api/submit", async (req, res) => {
    try {
      const { entries } = req.body;
      
      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ message: "No entries to submit" });
      }

      // For demo purposes, use demo user
      const user = await storage.getUserByUsername("demo");
      if (!user?.clickupApiKey) {
        return res.status(400).json({ message: "ClickUp API key not configured" });
      }

      const clickup = createClickUpService(user.clickupApiKey);
      const results = [];

      for (const entry of entries) {
        try {
          const validatedEntry = timeEntryUpdateSchema.parse(entry);
          
          // Get project to find a task or create one
          let taskId = validatedEntry.projectId;
          
          // Try to find existing tasks in the project, or create a generic task
          try {
            const tasks = await clickup.getTasks(validatedEntry.projectId);
            if (tasks.length > 0) {
              taskId = tasks[0].id; // Use first available task
            } else {
              // Create a generic task for time logging
              taskId = await clickup.createTask(validatedEntry.projectId, "Time Tracking Entry");
            }
          } catch (taskError) {
            console.error("Task handling error:", taskError);
            // Continue with projectId as taskId for fallback
          }

          // Log time to ClickUp
          const clickupTimeId = await clickup.logTime(
            taskId,
            validatedEntry.duration,
            new Date(validatedEntry.date),
            validatedEntry.notes
          );

          // Store the time entry
          const storedEntry = await storage.createTimeEntry({
            userId: user.id,
            projectId: validatedEntry.projectId,
            projectName: entry.projectName || "Unknown Project",
            duration: validatedEntry.duration,
            date: new Date(validatedEntry.date),
            notes: validatedEntry.notes || null,
            clickupTaskId: taskId,
            confidence: entry.confidence || 100,
          });

          // Update with ClickUp time ID
          await storage.updateTimeEntry(storedEntry.id, {
            clickupTimeId: clickupTimeId,
          });

          results.push({
            success: true,
            entryId: storedEntry.id,
            clickupTimeId: clickupTimeId,
          });
        } catch (entryError) {
          console.error("Entry submission error:", entryError);
          results.push({
            success: false,
            error: entryError instanceof Error ? entryError.message : "Failed to submit entry",
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;

      res.json({
        success: successCount === totalCount,
        message: `Successfully submitted ${successCount} of ${totalCount} entries`,
        results,
      });
    } catch (error) {
      console.error("Submit error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to submit entries" 
      });
    }
  });

  // Get time entries for user
  app.get("/api/entries", async (req, res) => {
    try {
      const user = await storage.getUserByUsername("demo");
      if (!user) {
        return res.json({ entries: [] });
      }

      const entries = await storage.getTimeEntries(user.id);
      res.json({ entries });
    } catch (error) {
      console.error("Entries error:", error);
      res.status(500).json({ message: "Failed to fetch entries" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

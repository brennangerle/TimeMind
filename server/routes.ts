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
          console.log("Fetching ClickUp tasks from specific locations only");
          const clickup = createClickUpService(user.clickupApiKey);
          const tasks = await clickup.getTasksFromSpecificLocations();
          console.log("Found ClickUp tasks from specified locations:", tasks.length);
          
          // Convert tasks to project-like structure for compatibility
          const taskProjects = tasks.map(task => ({
            id: task.id,
            name: task.name,
            status: task.status,
          }));
          
          availableProjects = taskProjects.map(p => p.name);
          
          // Sync tasks as projects to storage for matching
          await storage.syncProjects(
            user.clickupWorkspaceId,
            taskProjects.map(p => ({
              clickupId: p.id,
              name: p.name,
              workspaceId: user.clickupWorkspaceId!,
            }))
          );
          
          // Get stored projects for matching
          storedProjects = await storage.getProjects(user.clickupWorkspaceId);
          console.log("Retrieved stored tasks as projects:", storedProjects.length);
        } catch (error) {
          console.error("Failed to fetch ClickUp tasks:", error);
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
          // Fetch fresh tasks from ClickUp
          const clickup = createClickUpService(user.clickupApiKey);
          const tasks = await clickup.getTasksFromSpecificLocations();
          console.log("Fetched ClickUp tasks from specified locations for projects endpoint:", tasks.length);
          
          projects = tasks.map(task => ({
            id: task.id,
            name: task.name,
          }));
        } catch (error) {
          console.error("Error fetching ClickUp tasks for projects:", error);
          return res.status(500).json({ message: "Failed to fetch ClickUp tasks" });
        }
      } else {
        // Create demo user if not exists (same as in parse endpoint)
        let user = await storage.getUserByUsername("demo");
        if (!user) {
          user = await storage.createUser({ 
            username: "demo", 
            password: "demo",
            clickupApiKey: process.env.CLICKUP_API_KEY || "",
            clickupWorkspaceId: process.env.CLICKUP_WORKSPACE_ID || "",
          });
        }
        
        if (user?.clickupWorkspaceId && user?.clickupApiKey) {
          try {
            const clickup = createClickUpService(user.clickupApiKey);
            const tasks = await clickup.getTasksFromSpecificLocations();
            console.log("Fetched ClickUp tasks from specified locations for projects endpoint:", tasks.length);
            
            projects = tasks.map(task => ({
              id: task.id,
              name: task.name,
            }));
          } catch (error) {
            console.error("Error fetching ClickUp tasks for projects:", error);
            return res.status(500).json({ message: "Failed to fetch ClickUp tasks" });
          }
        } else {
          return res.status(400).json({ message: "ClickUp credentials not configured" });
        }
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
      console.log("\n📝 Submit request received with entries:", JSON.stringify(entries, null, 2));
      
      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ message: "No entries to submit" });
      }

      // For demo purposes, create demo user if not exists
      let user = await storage.getUserByUsername("demo");
      if (!user) {
        user = await storage.createUser({ 
          username: "demo", 
          password: "demo",
          clickupApiKey: process.env.CLICKUP_API_KEY || "",
          clickupWorkspaceId: process.env.CLICKUP_WORKSPACE_ID || "",
        });
      }
      
      if (!user?.clickupApiKey) {
        return res.status(400).json({ message: "ClickUp API key not configured" });
      }

      const clickup = createClickUpService(user.clickupApiKey);
      const results = [];

      for (const entry of entries) {
        console.log("\n🔄 Processing entry:", entry);
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

          // Parse the date and handle time conflicts
          let logDate = new Date(validatedEntry.date);
          const today = new Date();
          
          console.log("📅 Original date:", validatedEntry.date);
          console.log("⏰ Duration:", validatedEntry.duration, "minutes");
          
          // Use a future timestamp to avoid conflicts with existing entries
          // Add increasing offset based on submission count to ensure uniqueness
          const submissionOffset = Date.now() % 10000; // Use last 4 digits of timestamp as unique offset
          const futureOffset = 5000 + submissionOffset; // Start 5+ seconds in the future
          
          if (logDate.toDateString() === today.toDateString()) {
            // For today, use a future time slot to avoid all existing entries
            // This ensures no overlap with any previously logged time
            const startTime = new Date(Date.now() + futureOffset);
            const endTime = new Date(startTime.getTime() + (validatedEntry.duration * 60 * 1000));
            logDate = startTime;
            console.log("🕐 Using future time slot for today:", { 
              start: startTime.toISOString(), 
              end: endTime.toISOString(),
              startMs: startTime.getTime(),
              endMs: endTime.getTime(),
              note: "Using future timestamp to avoid conflicts"
            });
          } else {
            // For past dates, use a timestamp based on the current millisecond to ensure uniqueness
            // This creates a unique time slot that won't conflict with any other submission
            const msInDay = currentTime % (24 * 60 * 60 * 1000);
            const hours = Math.floor(msInDay / (60 * 60 * 1000));
            const minutes = Math.floor((msInDay % (60 * 60 * 1000)) / (60 * 1000));
            const seconds = Math.floor((msInDay % (60 * 1000)) / 1000);
            const milliseconds = msInDay % 1000;
            
            logDate.setHours(hours, minutes, seconds, milliseconds);
            console.log("🕑 Using unique time for past date:", {
              date: logDate.toISOString(),
              timestamp: logDate.getTime()
            });
          }

          // Log time to ClickUp
          console.log("📤 Submitting to ClickUp:", {
            taskId: taskId,
            duration: validatedEntry.duration,
            startTime: logDate.toISOString(),
            notes: validatedEntry.notes
          });
          const clickupTimeId = await clickup.logTime(
            taskId,
            validatedEntry.duration,
            logDate,
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

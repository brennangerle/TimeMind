import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  clickupApiKey: text("clickup_api_key"),
  clickupWorkspaceId: text("clickup_workspace_id"),
});

export const timeEntries = pgTable("time_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  projectId: text("project_id").notNull(),
  projectName: text("project_name").notNull(),
  duration: integer("duration").notNull(), // duration in minutes
  date: timestamp("date").notNull(),
  notes: text("notes"),
  clickupTaskId: text("clickup_task_id"),
  clickupTimeId: text("clickup_time_id"),
  confidence: integer("confidence"), // AI matching confidence 0-100
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clickupId: text("clickup_id").notNull().unique(),
  name: text("name").notNull(),
  workspaceId: text("workspace_id").notNull(),
  lastSynced: timestamp("last_synced").default(sql`now()`),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  clickupApiKey: true,
  clickupWorkspaceId: true,
});

export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({
  id: true,
  createdAt: true,
  clickupTimeId: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  lastSynced: true,
});

// Natural language parsing schemas
export const naturalLanguageInputSchema = z.object({
  text: z.string().min(1, "Please enter a description of your work"),
});

export const parsedTimeEntrySchema = z.object({
  projectName: z.string(),
  duration: z.number(), // in minutes
  date: z.string(), // ISO date string
  notes: z.string().optional(),
  confidence: z.number().min(0).max(100),
});

export const timeEntryUpdateSchema = z.object({
  projectId: z.string(),
  duration: z.number(),
  date: z.string(),
  notes: z.string().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type NaturalLanguageInput = z.infer<typeof naturalLanguageInputSchema>;
export type ParsedTimeEntry = z.infer<typeof parsedTimeEntrySchema>;
export type TimeEntryUpdate = z.infer<typeof timeEntryUpdateSchema>;

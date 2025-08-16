import { type User, type InsertUser, type TimeEntry, type InsertTimeEntry, type Project, type InsertProject } from "@shared/schema";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserClickUpConfig(id: string, apiKey: string, workspaceId: string): Promise<User>;

  // Time entry methods
  getTimeEntries(userId: string): Promise<TimeEntry[]>;
  getTimeEntry(id: string): Promise<TimeEntry | undefined>;
  createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry>;
  updateTimeEntry(id: string, entry: Partial<TimeEntry>): Promise<TimeEntry>;
  deleteTimeEntry(id: string): Promise<void>;
  
  // Project methods
  getProjects(workspaceId: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<Project>): Promise<Project>;
  syncProjects(workspaceId: string, projects: InsertProject[]): Promise<Project[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private timeEntries: Map<string, TimeEntry>;
  private projects: Map<string, Project>;
  private projectsCachePath: string;

  constructor() {
    this.users = new Map();
    this.timeEntries = new Map();
    this.projects = new Map();

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const cacheDir = path.resolve(__dirname, "cache");
    this.projectsCachePath = path.join(cacheDir, "projects.json");
    // Initialize cache directory and load projects
    this.initializeCache(cacheDir).catch(() => undefined);
  }

  private async initializeCache(cacheDir: string): Promise<void> {
    try {
      await fs.mkdir(cacheDir, { recursive: true });
      await this.loadProjectsFromDisk();
    } catch {
      // ignore
    }
  }

  private async loadProjectsFromDisk(): Promise<void> {
    try {
      const content = await fs.readFile(this.projectsCachePath, "utf8");
      const data: Project[] = JSON.parse(content);
      this.projects.clear();
      for (const project of data) {
        this.projects.set(project.id, project);
      }
    } catch {
      // No cache yet
    }
  }

  private async saveProjectsToDisk(): Promise<void> {
    try {
      const all = Array.from(this.projects.values());
      await fs.writeFile(this.projectsCachePath, JSON.stringify(all, null, 2), "utf8");
    } catch (err) {
      console.error("Failed to persist projects cache:", err);
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id,
      clickupApiKey: insertUser.clickupApiKey || null,
      clickupWorkspaceId: insertUser.clickupWorkspaceId || null,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserClickUpConfig(id: string, apiKey: string, workspaceId: string): Promise<User> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error('User not found');
    }
    
    const updatedUser: User = {
      ...user,
      clickupApiKey: apiKey,
      clickupWorkspaceId: workspaceId,
    };
    
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getTimeEntries(userId: string): Promise<TimeEntry[]> {
    return Array.from(this.timeEntries.values()).filter(
      (entry) => entry.userId === userId,
    );
  }

  async getTimeEntry(id: string): Promise<TimeEntry | undefined> {
    return this.timeEntries.get(id);
  }

  async createTimeEntry(insertEntry: InsertTimeEntry): Promise<TimeEntry> {
    const id = randomUUID();
    const entry: TimeEntry = {
      ...insertEntry,
      id,
      clickupTimeId: null,
      createdAt: new Date(),
      confidence: insertEntry.confidence ?? null,
      notes: insertEntry.notes ?? null,
      clickupTaskId: insertEntry.clickupTaskId ?? null,
    };
    this.timeEntries.set(id, entry);
    return entry;
  }

  async updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<TimeEntry> {
    const entry = this.timeEntries.get(id);
    if (!entry) {
      throw new Error('Time entry not found');
    }
    
    const updatedEntry: TimeEntry = { ...entry, ...updates };
    this.timeEntries.set(id, updatedEntry);
    return updatedEntry;
  }

  async deleteTimeEntry(id: string): Promise<void> {
    this.timeEntries.delete(id);
  }

  async getProjects(workspaceId: string): Promise<Project[]> {
    return Array.from(this.projects.values()).filter(
      (project) => project.workspaceId === workspaceId,
    );
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const project: Project = {
      ...insertProject,
      id,
      lastSynced: new Date(),
    };
    this.projects.set(id, project);
    return project;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    const project = this.projects.get(id);
    if (!project) {
      throw new Error('Project not found');
    }
    
    const updatedProject: Project = { ...project, ...updates };
    this.projects.set(id, updatedProject);
    return updatedProject;
  }

  async syncProjects(workspaceId: string, projects: InsertProject[]): Promise<Project[]> {
    // Remove existing projects for this workspace
    const existingProjects = Array.from(this.projects.entries());
    for (const [id, project] of existingProjects) {
      if (project.workspaceId === workspaceId) {
        this.projects.delete(id);
      }
    }
    
    // Add new projects
    const syncedProjects: Project[] = [];
    for (const projectData of projects) {
      const project = await this.createProject(projectData);
      syncedProjects.push(project);
    }
    // Persist to disk for cache durability
    await this.saveProjectsToDisk();
    return syncedProjects;
  }
}

export const storage = new MemStorage();

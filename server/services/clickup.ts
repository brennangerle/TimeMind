import axios, { AxiosInstance } from 'axios';

export interface ClickUpProject {
  id: string;
  name: string;
  status: string;
}

export interface ClickUpTask {
  id: string;
  name: string;
  status: string;
  project?: {
    id: string;
    name: string;
  };
}

export interface ClickUpTimeEntry {
  id: string;
  task: string;
  duration: number; // milliseconds
  start: number; // timestamp
  description?: string;
}

export class ClickUpService {
  private client: AxiosInstance;

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: 'https://api.clickup.com/api/v2',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async getWorkspaces() {
    try {
      const response = await this.client.get('/team');
      return response.data.teams || [];
    } catch (error) {
      console.error('ClickUp API error (workspaces):', error);
      throw new Error('Failed to fetch ClickUp workspaces');
    }
  }

  async getProjects(workspaceId: string): Promise<ClickUpProject[]> {
    try {
      const response = await this.client.get(`/team/${workspaceId}/space`);
      const spaces = response.data.spaces || [];
      
      const projects: ClickUpProject[] = [];
      for (const space of spaces) {
        if (space.projects) {
          projects.push(...space.projects.map((project: any) => ({
            id: project.id,
            name: project.name,
            status: project.status,
          })));
        }
      }
      
      return projects;
    } catch (error) {
      console.error('ClickUp API error (projects):', error);
      throw new Error('Failed to fetch ClickUp projects');
    }
  }

  async getTasks(projectId: string): Promise<ClickUpTask[]> {
    try {
      const response = await this.client.get(`/list/${projectId}/task`);
      return response.data.tasks?.map((task: any) => ({
        id: task.id,
        name: task.name,
        status: task.status?.status || 'unknown',
        project: task.project ? {
          id: task.project.id,
          name: task.project.name,
        } : undefined,
      })) || [];
    } catch (error) {
      console.error('ClickUp API error (tasks):', error);
      throw new Error('Failed to fetch ClickUp tasks');
    }
  }

  async logTime(taskId: string, duration: number, date: Date, description?: string): Promise<string> {
    try {
      const startTime = date.getTime();
      
      const response = await this.client.post(`/task/${taskId}/time`, {
        description: description || '',
        start: startTime,
        duration: duration * 60 * 1000, // Convert minutes to milliseconds
      });
      
      return response.data.data?.id || response.data.id;
    } catch (error) {
      console.error('ClickUp API error (log time):', error);
      throw new Error('Failed to log time in ClickUp');
    }
  }

  async createTask(projectId: string, taskName: string): Promise<string> {
    try {
      const response = await this.client.post(`/list/${projectId}/task`, {
        name: taskName,
        description: 'Task created automatically by AI Time Tracker',
      });
      
      return response.data.id;
    } catch (error) {
      console.error('ClickUp API error (create task):', error);
      throw new Error('Failed to create task in ClickUp');
    }
  }

  async searchTasks(workspaceId: string, query: string): Promise<ClickUpTask[]> {
    try {
      const response = await this.client.get(`/team/${workspaceId}/task`, {
        params: {
          search: query,
          include_closed: false,
        },
      });
      
      return response.data.tasks?.map((task: any) => ({
        id: task.id,
        name: task.name,
        status: task.status?.status || 'unknown',
        project: task.list ? {
          id: task.list.id,
          name: task.list.name,
        } : undefined,
      })) || [];
    } catch (error) {
      console.error('ClickUp API error (search tasks):', error);
      return [];
    }
  }
}

export function createClickUpService(apiKey: string): ClickUpService {
  if (!apiKey) {
    throw new Error('ClickUp API key is required');
  }
  
  return new ClickUpService(apiKey);
}

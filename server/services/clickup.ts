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
      // Create start and end times for the specified date
      const startTime = date.getTime();
      const endTime = startTime + (duration * 60 * 1000); // Add duration in milliseconds
      
      console.log("\n🚀 ClickUp API Call - Logging Time:");
      console.log("  Task ID:", taskId);
      console.log("  Duration:", duration, "minutes");
      console.log("  Start:", new Date(startTime).toISOString(), `(${startTime})`);
      console.log("  End:", new Date(endTime).toISOString(), `(${endTime})`);
      console.log("  Description:", description || "(empty)");
      
      const requestBody = {
        description: description || '',
        start: startTime,
        end: endTime,
      };
      
      console.log("  Request body:", JSON.stringify(requestBody));
      
      const response = await this.client.post(`/task/${taskId}/time`, requestBody);
      
      console.log("✅ ClickUp time logged successfully! ID:", response.data.id || response.data.data?.id);
      return response.data.data?.id || response.data.id;
    } catch (error) {
      console.error('\n❌ ClickUp API error (log time):', error);
      console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
      if (error && typeof error === 'object' && 'response' in error) {
        const apiError = (error as any).response?.data;
        console.error('API Response:', apiError);
        console.error('Error code:', apiError?.ECODE);
        console.error('Error message:', apiError?.err);
      }
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

  async getTasksFromFolder(folderId: string): Promise<ClickUpTask[]> {
    try {
      const response = await this.client.get(`/folder/${folderId}/list`);
      const lists = response.data.lists || [];
      
      const allTasks: ClickUpTask[] = [];
      for (const list of lists) {
        try {
          const tasksResponse = await this.client.get(`/list/${list.id}/task`, {
            params: { include_closed: false }
          });
          const tasks = tasksResponse.data.tasks?.map((task: any) => ({
            id: task.id,
            name: task.name,
            status: task.status?.status || 'unknown',
            project: {
              id: list.id,
              name: list.name,
            },
          })) || [];
          allTasks.push(...tasks);
        } catch (error) {
          console.error(`Failed to fetch tasks from list ${list.id}:`, error);
        }
      }
      
      return allTasks;
    } catch (error) {
      console.error('ClickUp API error (get tasks from folder):', error);
      return [];
    }
  }

  async getTasksFromSpace(spaceId: string): Promise<ClickUpTask[]> {
    try {
      const allTasks: ClickUpTask[] = [];
      
      // First, get all folders in the space
      const foldersResponse = await this.client.get(`/space/${spaceId}/folder`);
      const folders = foldersResponse.data.folders || [];
      
      // Fetch tasks from all folders in the space
      for (const folder of folders) {
        console.log(`  📂 Fetching from folder "${folder.name}" (${folder.id}) in space...`);
        try {
          const listsResponse = await this.client.get(`/folder/${folder.id}/list`);
          const lists = listsResponse.data.lists || [];
          
          for (const list of lists) {
            try {
              const tasksResponse = await this.client.get(`/list/${list.id}/task`, {
                params: { include_closed: false }
              });
              const tasks = tasksResponse.data.tasks?.map((task: any) => ({
                id: task.id,
                name: task.name,
                status: task.status?.status || 'unknown',
                project: {
                  id: list.id,
                  name: list.name,
                },
              })) || [];
              allTasks.push(...tasks);
            } catch (error) {
              console.error(`    Failed to fetch tasks from list ${list.id}:`, error);
            }
          }
        } catch (error) {
          console.error(`  Failed to fetch lists from folder ${folder.id}:`, error);
        }
      }
      
      // Also get lists directly under the space (not in folders)
      const directListsResponse = await this.client.get(`/space/${spaceId}/list`);
      const directLists = directListsResponse.data.lists || [];
      
      for (const list of directLists) {
        try {
          const tasksResponse = await this.client.get(`/list/${list.id}/task`, {
            params: { include_closed: false }
          });
          const tasks = tasksResponse.data.tasks?.map((task: any) => ({
            id: task.id,
            name: task.name,
            status: task.status?.status || 'unknown',
            project: {
              id: list.id,
              name: list.name,
            },
          })) || [];
          allTasks.push(...tasks);
        } catch (error) {
          console.error(`Failed to fetch tasks from direct list ${list.id}:`, error);
        }
      }
      
      return allTasks;
    } catch (error) {
      console.error('ClickUp API error (get tasks from space):', error);
      return [];
    }
  }

  async getTasksFromSpecificLocations(): Promise<ClickUpTask[]> {
    try {
      console.log("🎯 Starting fetch from specific locations only");
      
      const allTasks: ClickUpTask[] = [];
      
      // Fetch from folder: 92107254 (MREG folder)
      console.log("📁 Fetching from folder 92107254 (MREG)...");
      const mregFolderTasks = await this.getTasksFromFolder("92107254");
      console.log("📁 Tasks from folder 92107254:", mregFolderTasks.length);
      allTasks.push(...mregFolderTasks);
      
      // Fetch from specific Willmeng folder: 102875477 (where WMG task is)
      console.log("📁 Fetching from folder 102875477 (Willmeng)...");
      const willmengTasks = await this.getTasksFromFolder("102875477");
      console.log("📁 Tasks from Willmeng folder:", willmengTasks.length);
      allTasks.push(...willmengTasks);
      
      // Scan all folders in space 20367902 for lists with project-related keywords
      console.log("🔍 Scanning space 20367902 for lists with 'projects' in the name...");
      const projectKeywords = ['projects', 'project', 'wmg', 'mreg', 'task', 'work', 'internal', 'admin'];
      
      try {
        // Get all folders in the space
        const foldersResponse = await this.client.get(`/space/20367902/folder`);
        const folders = foldersResponse.data.folders || [];
        console.log(`  Found ${folders.length} folders in space`);
        
        // Scan ALL folders but only fetch from lists with relevant keywords
        let folderCount = 0;
        let listCount = 0;
        
        // Scan all folders - focus on "projects" keyword
        console.log(`  Scanning all ${folders.length} folders for lists with 'projects' and other keywords...`);
        
        for (const folder of folders) {
          try {
            const listsResponse = await this.client.get(`/folder/${folder.id}/list`);
            const lists = listsResponse.data.lists || [];
            
            // Only fetch tasks from lists with relevant names (prioritize "projects")
            const relevantLists = lists.filter((list: any) => {
              const listName = list.name.toLowerCase();
              // Specifically check for "projects" first
              if (listName.includes('projects')) {
                console.log(`      ✓ Found list with "projects": ${list.name}`);
                return true;
              }
              return projectKeywords.some(keyword => listName.includes(keyword));
            });
            
            if (relevantLists.length > 0) {
              folderCount++;
              listCount += relevantLists.length;
              console.log(`    📂 Found ${relevantLists.length} relevant lists in folder "${folder.name}"`);
              
              for (const list of relevantLists) {
                try {
                  const tasksResponse = await this.client.get(`/list/${list.id}/task`, {
                    params: { include_closed: false }
                  });
                  const tasks = tasksResponse.data.tasks?.map((task: any) => ({
                    id: task.id,
                    name: task.name,
                    status: task.status?.status || 'unknown',
                    project: {
                      id: list.id,
                      name: list.name,
                    },
                  })) || [];
                  allTasks.push(...tasks);
                } catch (error) {
                  console.error(`      Failed to fetch tasks from list ${list.id}`);
                }
              }
            }
          } catch (error) {
            // Silent fail to avoid cluttering logs
          }
        }
        
        console.log(`  Scanned folders with relevant lists: ${folderCount}, Total relevant lists: ${listCount}`);
        
        // Also get direct lists under the space
        const directListsResponse = await this.client.get(`/space/20367902/list`);
        const directLists = directListsResponse.data.lists || [];
        console.log(`  Found ${directLists.length} direct lists in space`);
        
        // Filter direct lists by keywords
        const relevantDirectLists = directLists.filter((list: any) => {
          const listName = list.name.toLowerCase();
          return projectKeywords.some(keyword => listName.includes(keyword));
        });
        
        console.log(`  Processing ${relevantDirectLists.length} relevant direct lists`);
        
        for (const list of relevantDirectLists) {
          try {
            const tasksResponse = await this.client.get(`/list/${list.id}/task`, {
              params: { include_closed: false }
            });
            const tasks = tasksResponse.data.tasks?.map((task: any) => ({
              id: task.id,
              name: task.name,
              status: task.status?.status || 'unknown',
              project: {
                id: list.id,
                name: list.name,
              },
            })) || [];
            allTasks.push(...tasks);
          } catch (error) {
            console.error(`  Failed to fetch tasks from list ${list.id}`);
          }
        }
      } catch (error) {
        console.error("Failed to scan space for project lists:", error);
      }
      
      // Deduplicate tasks
      const uniqueTasks = allTasks.filter((task, index, self) => 
        index === self.findIndex(t => t.id === task.id)
      );
      
      console.log("✅ Total unique tasks from all locations:", uniqueTasks.length);
      console.log("📝 Sample tasks:", uniqueTasks.slice(0, 5).map(t => t.name));
      return uniqueTasks;
    } catch (error) {
      console.error('❌ Failed to fetch tasks from specific locations:', error);
      console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
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

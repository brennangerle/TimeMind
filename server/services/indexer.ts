import { storage } from "../storage";
import { createClickUpService } from "./clickup";

export interface IndexStatus {
  isIndexing: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  current: number;
  total: number;
  message: string;
  lastIndexedAt: number | null;
}

const indexState: IndexStatus = {
  isIndexing: false,
  startedAt: null,
  finishedAt: null,
  current: 0,
  total: 0,
  message: "idle",
  lastIndexedAt: null,
};

export function getIndexStatus(): IndexStatus {
  return { ...indexState };
}

export async function startReindex(workspaceId: string, apiKey: string): Promise<IndexStatus> {
  if (indexState.isIndexing) {
    return getIndexStatus();
  }

  indexState.isIndexing = true;
  indexState.startedAt = Date.now();
  indexState.finishedAt = null;
  indexState.current = 0;
  indexState.total = 0;
  indexState.message = "Starting re-index";

  queueMicrotask(async () => {
    try {
      const clickup = createClickUpService(apiKey);
      indexState.message = "Fetching tasks from ClickUp";

      const tasks = await clickup.getTasksFromSpecificLocations();
      indexState.total = tasks.length || 0;

      // Sync projects to storage in batches to allow progress updates
      const batchSize = 100;
      const projectsData = tasks.map((t) => ({
        clickupId: t.id,
        name: t.name,
        workspaceId,
      }));

      indexState.message = "Syncing to cache";
      indexState.current = 0;

      // Replace all at once (storage.syncProjects already clears and inserts)
      await storage.syncProjects(workspaceId, projectsData);
      indexState.current = indexState.total;

      indexState.lastIndexedAt = Date.now();
      indexState.message = `Indexed ${indexState.total} items`;
    } catch (error) {
      indexState.message = error instanceof Error ? error.message : "Indexing failed";
    } finally {
      indexState.isIndexing = false;
      indexState.finishedAt = Date.now();
    }
  });

  return getIndexStatus();
}



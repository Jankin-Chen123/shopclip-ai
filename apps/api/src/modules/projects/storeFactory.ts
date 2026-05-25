import { MemoryProjectStore } from "./memoryStore.js";
import { PrismaProjectStore } from "./prismaProjectStore.js";
import type { ProjectStore } from "./projectStore.js";

export const shouldUsePrismaStore = (env: NodeJS.ProcessEnv = process.env): boolean =>
  Boolean(env.DATABASE_URL?.trim()) && env.PROJECT_STORE_MODE !== "memory";

export const createProjectStoreFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): ProjectStore => (shouldUsePrismaStore(env) ? new PrismaProjectStore() : new MemoryProjectStore());


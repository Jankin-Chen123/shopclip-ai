import type { ReferenceVideo } from "@shopclip/shared";

import type { ProjectStore } from "../projects/projectStore.js";
import { createMockViralBreakdownProvider } from "../../providers/references/mockViralBreakdownProvider.js";
import type { ViralBreakdownProvider } from "../../providers/references/viralBreakdownProvider.js";

export const analyzeReferenceVideo = async ({
  projectId,
  reference,
  store,
  viralProvider = createMockViralBreakdownProvider(),
}: {
  projectId?: string;
  reference: Omit<ReferenceVideo, "id" | "projectId" | "analysis" | "createdAt" | "updatedAt">;
  store: ProjectStore;
  viralProvider?: ViralBreakdownProvider;
}): Promise<ReferenceVideo | undefined> => {
  const registered = await store.addReferenceVideo(projectId, {
    ...reference,
    status: "analyzing",
  });
  if (!registered) {
    return undefined;
  }

  const analysis = await viralProvider.analyzeReference(registered);
  return store.updateReferenceVideoAnalysis(registered.id, analysis);
};

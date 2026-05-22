import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app";

const request = async <T>(
  baseUrl: string,
  path: string,
  options?: RequestInit,
): Promise<{ body: T; status: number }> => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "content-type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  const body = (await response.json()) as T;
  return { body, status: response.status };
};

const createProject = async (baseUrl: string): Promise<string> => {
  const created = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
    method: "POST",
    body: JSON.stringify({
      title: "Desk launch clip",
      productName: "GlowGrip Phone Stand",
      audience: "TikTok Shop buyers",
      sellingPoints: ["folds flat", "keeps product shots stable"],
      tone: "confident",
      style: "fast desk demo",
      targetDurationSeconds: 15,
    }),
  });
  expect(created.status).toBe(201);
  return created.body.project.id;
};

describe("P1 mock dashboard", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => {
      server.once("listening", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it("returns summary metrics, funnel stages, bullet factors, and readable recommendations for generated projects", async () => {
    const projectId = await createProject(baseUrl);
    const generated = await request(baseUrl, `/api/projects/${projectId}/generate-script`, {
      method: "POST",
    });
    expect(generated.status).toBe(201);

    const dashboard = await request<{
      projectId: string;
      summary: {
        predictedCompletionRate: number;
        hookStrength: number;
        subtitleClarity: number;
        productFocus: number;
      };
      funnel: Array<{ stage: string; value: number }>;
      factors: Array<{
        id: string;
        sceneId?: string;
        factor: string;
        expectedImpact: string;
        evidence: string;
        recommendation: string;
      }>;
    }>(baseUrl, `/api/projects/${projectId}/dashboard`);

    expect(dashboard.status).toBe(200);
    expect(dashboard.body.projectId).toBe(projectId);
    expect(dashboard.body.summary.predictedCompletionRate).toBeGreaterThan(0.5);
    expect(dashboard.body.summary.hookStrength).toBeGreaterThan(0.5);
    expect(dashboard.body.funnel.map((stage) => stage.stage)).toEqual([
      "Impression",
      "Watch 3s",
      "Click",
      "Add to cart",
      "Purchase",
    ]);
    expect(dashboard.body.funnel.every((stage) => stage.value > 0)).toBe(true);
    expect(dashboard.body.factors.length).toBeGreaterThanOrEqual(3);
    expect(dashboard.body.factors[0]).toMatchObject({
      expectedImpact: expect.stringMatching(/low|medium|high/),
    });
    expect(dashboard.body.factors[0].evidence.length).toBeGreaterThan(10);
    expect(dashboard.body.factors[0].recommendation.length).toBeGreaterThan(10);
  });

  it("returns a clear not found error for missing dashboard projects", async () => {
    const missing = await request<{ error: { code: string; message: string } }>(
      baseUrl,
      "/api/projects/missing-project/dashboard",
    );

    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("PROJECT_NOT_FOUND");
  });
});

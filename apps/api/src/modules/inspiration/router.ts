import { Router } from "express";
import type { Response } from "express";
import {
  InspirationGenerateRequestSchema,
  InspirationGenerateResponseSchema,
  InspirationVideoTaskRequestSchema,
  InspirationVideoTaskResponseSchema,
} from "@shopclip/shared";

import {
  generateInspiration,
  loadInspirationVideoTask,
} from "../../providers/ai/arkInspirationProvider.js";

const sendInvalidRequest = (response: Response, code: string, message: string) => {
  response.status(400).json({
    error: {
      code,
      message,
    },
  });
};

export const createInspirationRouter = (): Router => {
  const router = Router();

  router.post("/inspiration/generate", async (request, response) => {
    const parsedRequest = InspirationGenerateRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      sendInvalidRequest(
        response,
        "INVALID_INSPIRATION_REQUEST",
        "Inspiration prompt and asset type are required.",
      );
      return;
    }

    const generated = await generateInspiration(parsedRequest.data);
    const parsedResponse = InspirationGenerateResponseSchema.safeParse(generated);
    if (!parsedResponse.success) {
      sendInvalidRequest(
        response,
        "INVALID_INSPIRATION_RESPONSE",
        "Generated inspiration material failed contract validation.",
      );
      return;
    }

    response.status(201).json(parsedResponse.data);
  });

  router.post("/inspiration/video-task", async (request, response) => {
    const parsedRequest = InspirationVideoTaskRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      sendInvalidRequest(
        response,
        "INVALID_INSPIRATION_VIDEO_TASK_REQUEST",
        "Video task id, prompt, and API settings are required.",
      );
      return;
    }

    const material = await loadInspirationVideoTask(parsedRequest.data);
    const parsedResponse = InspirationVideoTaskResponseSchema.safeParse({ material });
    if (!parsedResponse.success) {
      sendInvalidRequest(
        response,
        "INVALID_INSPIRATION_VIDEO_TASK_RESPONSE",
        "Video task material failed contract validation.",
      );
      return;
    }

    response.json(parsedResponse.data);
  });

  return router;
};

import { Router } from "express";
import type { Response } from "express";
import {
  InspirationGenerateRequestSchema,
  InspirationGenerateResponseSchema,
} from "@shopclip/shared";

import { generateInspiration } from "../../providers/ai/arkInspirationProvider.js";

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

  return router;
};

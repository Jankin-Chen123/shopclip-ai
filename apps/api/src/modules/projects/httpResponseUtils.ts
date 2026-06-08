import type { Response } from "express";

export const sendNotFound = (response: Response, code: string, message: string) => {
  response.status(404).json({
    error: {
      code,
      message,
    },
  });
};

export const sendInvalidRequest = (response: Response, code: string, message: string) => {
  response.status(400).json({
    error: {
      code,
      message,
    },
  });
};

export const sendScriptGenerationFailure = (response: Response, error: unknown) => {
  response.status(502).json({
    error: {
      code: "SCRIPT_GENERATION_FAILED",
      message:
        error instanceof Error && error.message.trim()
          ? error.message
          : "Real script generation failed.",
    },
  });
};

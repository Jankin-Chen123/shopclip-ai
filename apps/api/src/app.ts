import cors from "cors";
import express from "express";
import type { Express } from "express";
import { createHealthPayload } from "@shopclip/shared";

export const createApp = (): Express => {
  const app = express();

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    }),
  );
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json(createHealthPayload("api"));
  });

  return app;
};

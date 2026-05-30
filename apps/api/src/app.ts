import cors from "cors";
import express from "express";
import type { ErrorRequestHandler, Express } from "express";
import { createHealthPayload } from "@shopclip/shared";
import { createInspirationRouter } from "./modules/inspiration/router.js";
import type { P0RouterOptions } from "./modules/projects/router.js";
import { createP0Router } from "./modules/projects/router.js";
import { createProjectStoreFromEnv } from "./modules/projects/storeFactory.js";
import { mediaOutputDir } from "./modules/media/mediaPaths.js";
import { renderExportDir } from "./providers/renderer/ffmpegComposer.js";

const parseCorsOrigins = (): string | string[] => {
  const configuredOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
  const origins = configuredOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 1 ? origins : (origins[0] ?? "http://localhost:5173");
};

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error.",
    },
  });
};

export type AppOptions = P0RouterOptions;

export const createApp = (options: AppOptions = {}): Express => {
  const app = express();
  const projectStore = options.store ?? createProjectStoreFromEnv();

  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    next();
  });
  app.use(
    cors({
      credentials: false,
      origin: parseCorsOrigins(),
    }),
  );
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? "1mb" }));
  app.use("/api/media-outputs", express.static(mediaOutputDir()));
  app.use("/api/render-exports", express.static(renderExportDir()));

  app.get("/health", (_request, response) => {
    response.json(createHealthPayload("api"));
  });
  app.use("/api", createInspirationRouter());
  app.use("/api", createP0Router({ ...options, store: projectStore }));
  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Route was not found.",
      },
    });
  });
  app.use(errorHandler);

  return app;
};

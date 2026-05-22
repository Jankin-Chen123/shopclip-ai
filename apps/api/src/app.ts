import cors from "cors";
import express from "express";
import type { ErrorRequestHandler, Express } from "express";
import { createHealthPayload } from "@shopclip/shared";
import { createP0Router } from "./modules/projects/router.js";

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

export const createApp = (): Express => {
  const app = express();

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

  app.get("/health", (_request, response) => {
    response.json(createHealthPayload("api"));
  });
  app.use("/api", createP0Router());
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

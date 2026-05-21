export type ServiceName = "web" | "api";

export interface HealthPayload {
  service: ServiceName;
  status: "ok";
  version: string;
}

export const SHOPCLIP_VERSION = "0.1.0";

export const createHealthPayload = (service: ServiceName): HealthPayload => ({
  service,
  status: "ok",
  version: SHOPCLIP_VERSION,
});

export * from "./schemas";
export type * from "./types";

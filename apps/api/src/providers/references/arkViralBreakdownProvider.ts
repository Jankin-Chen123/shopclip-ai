import { createMockViralBreakdownProvider } from "./mockViralBreakdownProvider.js";
import type { ViralBreakdownProvider } from "./viralBreakdownProvider.js";

export const createArkViralBreakdownProvider = (): ViralBreakdownProvider => {
  return createMockViralBreakdownProvider();
};

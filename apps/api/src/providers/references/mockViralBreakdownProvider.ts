import type { ReferenceVideoAnalysis } from "@shopclip/shared";

import type { ViralBreakdownProvider } from "./viralBreakdownProvider.js";

export const createMockViralBreakdownProvider = (): ViralBreakdownProvider => ({
  analyzeReference: async (reference): Promise<ReferenceVideoAnalysis> => ({
    referenceId: reference.id,
    sourceUrl: reference.sourceUrl,
    sourcePlatform: reference.sourcePlatform,
    sourceDeclaration: reference.sourceDeclaration,
    title: reference.title,
    author: reference.author,
    publicStats: reference.publicStats,
    durationSeconds: reference.analysis?.durationSeconds ?? 12,
    category: reference.category,
    hookScore: 0.9,
    hookAnalysis: "Uses an identity hook and immediate product action in the first two seconds.",
    pacingAnalysis: "Fast hook, compact demo, one trust proof, direct CTA.",
    emotionalArc: ["curiosity", "relief", "confidence"],
    targetAudience: ["busy shoppers", "scenario-driven buyers"],
    contentFormula: "Identity hook + pain cue + fast demo + trust proof + CTA.",
    keyViralFactors: ["identity_label", "demo_proof", "price_anchor", "spoken_self_correction"],
    commerceNarrativeSegments: [
      {
        role: "hook",
        startSecond: 0,
        endSecond: 2,
        summary: "Calls out a precise buyer identity or daily pain.",
        copywriting: "No time for breakfast?",
        visualPrompt: "Creator holds the product in the real usage context.",
      },
      {
        role: "demo",
        startSecond: 2,
        endSecond: 8,
        summary: "Shows the product solving the pain with visible hand interaction.",
        copywriting: "Add fruit, tap once, take it with you.",
        visualPrompt: "Close-up product demo with fast handheld push-in.",
      },
      {
        role: "trust",
        startSecond: 8,
        endSecond: 11,
        summary: "Adds proof through material, cleaning, battery, or review cue.",
        copywriting: "Leak-proof and easy to rinse.",
        visualPrompt: "Proof shot focused on product detail.",
      },
      {
        role: "cta",
        startSecond: 11,
        endSecond: 12,
        summary: "Closes with a clear shopping action.",
        copywriting: "Tap to get yours.",
        visualPrompt: "Product packshot with brand-safe end frame.",
      },
    ],
    recreationBlueprint: {
      visual: "Recreate the structure with merchant-owned close-ups, proof shots, and packshot.",
      copywriting: "Keep each line short; open with a buyer identity question.",
      shootingGuide:
        "Use this as a method blueprint only. Do not save, remix, or clip the public source video.",
    },
    commentInsights: ["Buyers ask about cleaning, battery life, and portability."],
    derivedTemplates: ["template_identity_hook_fast_demo"],
  }),
});

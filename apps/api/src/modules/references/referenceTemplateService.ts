import type { ReferenceVideo, ViralTemplate } from "@shopclip/shared";

export const buildViralTemplateFromReferences = ({
  category,
  references,
  templateName,
}: {
  category: string;
  references: ReferenceVideo[];
  templateName: string;
}): ViralTemplate => ({
  templateId: `template_${templateName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
  name: templateName,
  category,
  strategy: "Clustered reference pattern: identity hook, compact demo, trust proof, and CTA.",
  factorSet: [...new Set(references.flatMap((reference) => reference.analysis?.keyViralFactors ?? []))],
  narrativeStructure: ["hook", "demo", "trust", "cta"],
  shotRequirements: ["clear product close-up", "hand interaction", "proof shot", "packshot"],
  copywritingRules: ["Use one short hook question.", "Keep demo copy concrete and verb-led."],
  riskRules: ["Do not remix public source videos.", "Avoid unsupported claims."],
  sourceReferenceIds: references.map((reference) => reference.id),
});

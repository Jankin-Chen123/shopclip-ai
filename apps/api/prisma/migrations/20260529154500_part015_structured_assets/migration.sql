-- Part 015: structured asset slices, processing events, reference videos, and viral templates.

CREATE TYPE "ReferenceVideoStatus" AS ENUM ('registered', 'analyzing', 'ready', 'failed');

ALTER TABLE "AssetSlice"
  ADD COLUMN "thumbnailKey" TEXT,
  ADD COLUMN "embeddingText" TEXT,
  ADD COLUMN "searchText" TEXT,
  ADD COLUMN "metadata" JSONB;

ALTER TABLE "StoryboardScene"
  ADD COLUMN "assetRecallQuery" TEXT;

CREATE TABLE "AssetProcessingEvent" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "jobId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "status" "TraceEventStatus" NOT NULL,
  "message" TEXT NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "retryable" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AssetProcessingEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferenceVideo" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "sourceAssetId" TEXT,
  "sourceUrl" TEXT NOT NULL,
  "sourcePlatform" TEXT NOT NULL,
  "sourceDeclaration" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "author" TEXT,
  "category" TEXT NOT NULL,
  "publicStats" JSONB,
  "status" "ReferenceVideoStatus" NOT NULL DEFAULT 'registered',
  "analysis" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReferenceVideo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferenceVideoSegment" (
  "id" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "startSecond" DOUBLE PRECISION NOT NULL,
  "endSecond" DOUBLE PRECISION NOT NULL,
  "summary" TEXT NOT NULL,
  "copywriting" TEXT NOT NULL,
  "visualPrompt" TEXT NOT NULL,
  "metadata" JSONB,

  CONSTRAINT "ReferenceVideoSegment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ViralTemplate" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "strategy" TEXT NOT NULL,
  "factorSet" TEXT[],
  "narrativeStructure" TEXT[],
  "shotRequirements" TEXT[],
  "copywritingRules" TEXT[],
  "riskRules" TEXT[],
  "sourceReferenceIds" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ViralTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssetProcessingEvent_projectId_idx" ON "AssetProcessingEvent"("projectId");
CREATE INDEX "AssetProcessingEvent_jobId_idx" ON "AssetProcessingEvent"("jobId");
CREATE INDEX "AssetProcessingEvent_assetId_idx" ON "AssetProcessingEvent"("assetId");
CREATE INDEX "ReferenceVideo_projectId_idx" ON "ReferenceVideo"("projectId");
CREATE INDEX "ReferenceVideo_sourceAssetId_idx" ON "ReferenceVideo"("sourceAssetId");
CREATE INDEX "ReferenceVideo_sourcePlatform_idx" ON "ReferenceVideo"("sourcePlatform");
CREATE INDEX "ReferenceVideo_category_idx" ON "ReferenceVideo"("category");
CREATE INDEX "ReferenceVideoSegment_referenceId_idx" ON "ReferenceVideoSegment"("referenceId");
CREATE INDEX "ReferenceVideoSegment_role_idx" ON "ReferenceVideoSegment"("role");
CREATE INDEX "ViralTemplate_projectId_idx" ON "ViralTemplate"("projectId");
CREATE INDEX "ViralTemplate_category_idx" ON "ViralTemplate"("category");

ALTER TABLE "AssetProcessingEvent"
  ADD CONSTRAINT "AssetProcessingEvent_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssetProcessingEvent"
  ADD CONSTRAINT "AssetProcessingEvent_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "AssetProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetProcessingEvent"
  ADD CONSTRAINT "AssetProcessingEvent_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferenceVideo"
  ADD CONSTRAINT "ReferenceVideo_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReferenceVideo"
  ADD CONSTRAINT "ReferenceVideo_sourceAssetId_fkey"
  FOREIGN KEY ("sourceAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReferenceVideoSegment"
  ADD CONSTRAINT "ReferenceVideoSegment_referenceId_fkey"
  FOREIGN KEY ("referenceId") REFERENCES "ReferenceVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ViralTemplate"
  ADD CONSTRAINT "ViralTemplate_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

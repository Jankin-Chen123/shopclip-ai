-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'ready', 'rendering', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('image', 'video', 'reference');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('uploaded', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "SceneStatus" AS ENUM ('draft', 'generated', 'edited', 'regenerating', 'failed');

-- CreateEnum
CREATE TYPE "RenderTaskStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'retrying');

-- CreateEnum
CREATE TYPE "TraceEventStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'retrying');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "sellingPoints" TEXT[],
    "tone" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "targetDurationSeconds" INTEGER NOT NULL DEFAULT 15,
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'uploaded',
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetSlice" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startSecond" DOUBLE PRECISION,
    "endSecond" DOUBLE PRECISION,
    "tags" TEXT[],

    CONSTRAINT "AssetSlice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Script" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "constraints" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryboardScene" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scriptId" TEXT,
    "assetId" TEXT,
    "order" INTEGER NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "subtitle" TEXT NOT NULL,
    "voiceover" TEXT NOT NULL,
    "visualPrompt" TEXT NOT NULL,
    "status" "SceneStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryboardScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenderTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "RenderTaskStatus" NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "previewUrl" TEXT,
    "exportUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenderTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraceEvent" (
    "id" TEXT NOT NULL,
    "renderTaskId" TEXT NOT NULL,
    "status" "TraceEventStatus" NOT NULL,
    "step" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockMetric" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sceneId" TEXT,
    "factor" TEXT NOT NULL,
    "expectedImpact" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "evidence" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Asset_projectId_idx" ON "Asset"("projectId");

-- CreateIndex
CREATE INDEX "AssetSlice_assetId_idx" ON "AssetSlice"("assetId");

-- CreateIndex
CREATE INDEX "Script_projectId_idx" ON "Script"("projectId");

-- CreateIndex
CREATE INDEX "StoryboardScene_projectId_idx" ON "StoryboardScene"("projectId");

-- CreateIndex
CREATE INDEX "StoryboardScene_scriptId_idx" ON "StoryboardScene"("scriptId");

-- CreateIndex
CREATE INDEX "StoryboardScene_assetId_idx" ON "StoryboardScene"("assetId");

-- CreateIndex
CREATE INDEX "RenderTask_projectId_idx" ON "RenderTask"("projectId");

-- CreateIndex
CREATE INDEX "TraceEvent_renderTaskId_idx" ON "TraceEvent"("renderTaskId");

-- CreateIndex
CREATE INDEX "MockMetric_projectId_idx" ON "MockMetric"("projectId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSlice" ADD CONSTRAINT "AssetSlice_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryboardScene" ADD CONSTRAINT "StoryboardScene_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryboardScene" ADD CONSTRAINT "StoryboardScene_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryboardScene" ADD CONSTRAINT "StoryboardScene_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderTask" ADD CONSTRAINT "RenderTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceEvent" ADD CONSTRAINT "TraceEvent_renderTaskId_fkey" FOREIGN KEY ("renderTaskId") REFERENCES "RenderTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockMetric" ADD CONSTRAINT "MockMetric_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

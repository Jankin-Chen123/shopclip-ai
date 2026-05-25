-- CreateEnum
CREATE TYPE "AssetSource" AS ENUM ('merchant_upload', 'external_provider', 'generated', 'public_reference');

-- CreateEnum
CREATE TYPE "AssetStorageProvider" AS ENUM ('local', 'mock_cos', 'tencent_cos');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "source" "AssetSource" NOT NULL DEFAULT 'merchant_upload';
ALTER TABLE "Asset" ADD COLUMN "storageProvider" "AssetStorageProvider";
ALTER TABLE "Asset" ADD COLUMN "objectKey" TEXT;
ALTER TABLE "Asset" ADD COLUMN "thumbnailKey" TEXT;
ALTER TABLE "Asset" ADD COLUMN "embeddingText" TEXT;
ALTER TABLE "Asset" ADD COLUMN "metadata" JSONB;

-- CreateTable
CREATE TABLE "AssetProcessingJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "status" "AssetStatus" NOT NULL,
    "steps" TEXT[],
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Asset_objectKey_idx" ON "Asset"("objectKey");

-- CreateIndex
CREATE INDEX "AssetProcessingJob_projectId_idx" ON "AssetProcessingJob"("projectId");

-- CreateIndex
CREATE INDEX "AssetProcessingJob_assetId_idx" ON "AssetProcessingJob"("assetId");

-- AddForeignKey
ALTER TABLE "AssetProcessingJob" ADD CONSTRAINT "AssetProcessingJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetProcessingJob" ADD CONSTRAINT "AssetProcessingJob_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;


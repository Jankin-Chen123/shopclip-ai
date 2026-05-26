-- Global asset library: assets may exist without belonging to a video project.
ALTER TABLE "AssetProcessingJob" DROP CONSTRAINT "AssetProcessingJob_projectId_fkey";
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_projectId_fkey";

ALTER TABLE "AssetProcessingJob" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "Asset" ALTER COLUMN "projectId" DROP NOT NULL;

ALTER TABLE "AssetProcessingJob" ADD CONSTRAINT "AssetProcessingJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

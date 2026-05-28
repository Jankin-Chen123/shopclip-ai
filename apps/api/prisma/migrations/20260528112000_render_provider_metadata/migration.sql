ALTER TABLE "RenderTask" ADD COLUMN "provider" TEXT;
ALTER TABLE "RenderTask" ADD COLUMN "providerTaskId" TEXT;
ALTER TABLE "RenderTask" ADD COLUMN "mediaSettings" JSONB;
ALTER TABLE "RenderTask" ADD COLUMN "videoSettings" JSONB;
ALTER TABLE "RenderTask" ADD COLUMN "retryOfRenderTaskId" TEXT;
ALTER TABLE "TraceEvent" ADD COLUMN "retryOfTraceEventId" TEXT;

-- Add generated storyboard frame URLs expected by PrismaProjectStore project loading.
ALTER TABLE "StoryboardScene" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

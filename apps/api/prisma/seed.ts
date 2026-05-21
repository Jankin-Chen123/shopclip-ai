import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_PROJECT_ID = "demo_shopclip_glowgrip";
const DEMO_ASSET_ID = "demo_asset_glowgrip_packshot";
const DEMO_SCRIPT_ID = "demo_script_glowgrip";
const DEMO_RENDER_TASK_ID = "demo_render_glowgrip";

const main = async () => {
  await prisma.$transaction(async (tx) => {
    await tx.project.deleteMany({
      where: { id: DEMO_PROJECT_ID },
    });

    await tx.project.create({
      data: {
        id: DEMO_PROJECT_ID,
        title: "GlowGrip TikTok Shop Launch",
        productName: "GlowGrip Phone Stand",
        audience: "Busy TikTok Shop shoppers who film product demos at home",
        sellingPoints: [
          "Folds flat for travel",
          "Locks the phone angle for stable filming",
          "Soft-touch base protects desk surfaces",
        ],
        tone: "confident and practical",
        style: "fast desk-demo edit",
        targetDurationSeconds: 15,
        status: "ready",
        assets: {
          create: [
            {
              id: DEMO_ASSET_ID,
              type: "image",
              status: "ready",
              url: "/demo-assets/glowgrip-packshot.png",
              name: "GlowGrip packshot",
              mimeType: "image/png",
              sizeBytes: 248000,
              tags: ["product", "packshot", "desk", "phone-stand"],
              slices: {
                create: [
                  {
                    id: "demo_slice_glowgrip_base",
                    label: "Folded base detail",
                    tags: ["foldable", "base", "close-up"],
                  },
                  {
                    id: "demo_slice_glowgrip_phone",
                    label: "Phone mounted angle",
                    tags: ["mounted", "stability", "demo"],
                  },
                ],
              },
            },
            {
              id: "demo_asset_glowgrip_reference",
              type: "reference",
              status: "ready",
              url: "/demo-assets/glowgrip-reference-board.png",
              name: "Reference mood board",
              mimeType: "image/png",
              sizeBytes: 186000,
              tags: ["reference", "clean", "creator-desk"],
            },
          ],
        },
        scripts: {
          create: [
            {
              id: DEMO_SCRIPT_ID,
              hook: "Stop filming shaky product clips.",
              narrative:
                "Open with the pain of unstable shots, demonstrate the stand locking into place, then close with a TikTok Shop-ready product moment.",
              constraints: [
                "Keep the full storyboard under 15 seconds",
                "Use short subtitles that fit mobile video",
                "Show the product in use before the final CTA",
              ],
              scenes: {
                create: [
                  {
                    id: "demo_scene_1",
                    projectId: DEMO_PROJECT_ID,
                    order: 1,
                    durationSeconds: 3,
                    subtitle: "Shaky clips lose buyers",
                    voiceover: "Still filming shaky product clips?",
                    visualPrompt: "Quick before shot of a phone sliding on a desk while recording.",
                    assetId: DEMO_ASSET_ID,
                    status: "generated",
                  },
                  {
                    id: "demo_scene_2",
                    projectId: DEMO_PROJECT_ID,
                    order: 2,
                    durationSeconds: 5,
                    subtitle: "Lock the angle in one move",
                    voiceover: "GlowGrip folds open and locks your phone angle in one move.",
                    visualPrompt: "Close-up hand opens the stand and mounts a phone.",
                    assetId: DEMO_ASSET_ID,
                    status: "generated",
                  },
                  {
                    id: "demo_scene_3",
                    projectId: DEMO_PROJECT_ID,
                    order: 3,
                    durationSeconds: 4,
                    subtitle: "Stable desk demos, faster",
                    voiceover: "Now every desk demo stays stable, clear, and ready to post.",
                    visualPrompt: "Clean desk setup with phone recording a product shot.",
                    assetId: DEMO_ASSET_ID,
                    status: "generated",
                  },
                  {
                    id: "demo_scene_4",
                    projectId: DEMO_PROJECT_ID,
                    order: 4,
                    durationSeconds: 3,
                    subtitle: "Export for TikTok Shop",
                    voiceover: "Export a polished TikTok Shop clip in seconds.",
                    visualPrompt: "Final packshot with bright product label and CTA frame.",
                    assetId: DEMO_ASSET_ID,
                    status: "generated",
                  },
                ],
              },
            },
          ],
        },
        renderTasks: {
          create: [
            {
              id: DEMO_RENDER_TASK_ID,
              status: "completed",
              progress: 100,
              previewUrl: "/demo-exports/glowgrip-preview.mp4",
              exportUrl: "/demo-exports/glowgrip-export.mp4",
              traceEvents: {
                create: [
                  {
                    id: "demo_trace_queued",
                    status: "queued",
                    step: "render-queued",
                    message: "Demo render job queued with mock renderer.",
                  },
                  {
                    id: "demo_trace_script",
                    status: "completed",
                    step: "script-validated",
                    message: "Storyboard validated at 15 seconds total.",
                  },
                  {
                    id: "demo_trace_preview",
                    status: "completed",
                    step: "preview-created",
                    message: "Stable preview URL assigned for demo playback.",
                  },
                ],
              },
            },
          ],
        },
        mockMetrics: {
          create: [
            {
              id: "demo_metric_hook_strength",
              sceneId: "demo_scene_1",
              factor: "Hook strength",
              expectedImpact: "high",
              value: 0.86,
              evidence: "The opening line names a concrete creator pain point.",
              recommendation: "Keep the first subtitle under six words.",
            },
            {
              id: "demo_metric_product_focus",
              sceneId: "demo_scene_2",
              factor: "Product focus",
              expectedImpact: "high",
              value: 0.88,
              evidence: "The product is shown in use before the midpoint.",
              recommendation: "Keep the close-up on screen for at least two seconds.",
            },
            {
              id: "demo_metric_subtitle_clarity",
              sceneId: "demo_scene_3",
              factor: "Subtitle clarity",
              expectedImpact: "medium",
              value: 0.91,
              evidence: "Subtitles are short and map directly to the voiceover.",
              recommendation: "Avoid adding a second text layer in the same scene.",
            },
          ],
        },
      },
    });
  });
};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

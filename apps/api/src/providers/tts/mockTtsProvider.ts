import type { MediaSettings, Project } from "@shopclip/shared";

export interface MockTtsResult {
  audioUrl: string;
  provider: "mock-tts-provider";
  voice: MediaSettings["ttsVoice"];
}

export const synthesizeMockVoiceover = (
  project: Project,
  mediaSettings: MediaSettings,
): MockTtsResult => ({
  audioUrl: `/demo-audio/${project.id}/${mediaSettings.ttsVoice}.mp3`,
  provider: "mock-tts-provider",
  voice: mediaSettings.ttsVoice,
});

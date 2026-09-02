import { z } from "zod";
import { uploadResumeVersion } from "./service";

export async function resolveResumeSelection(input: { userId: string; formData: FormData }) {
  const mode = z.enum(["existing", "upload"]).parse(input.formData.get("resumeMode"));
  if (mode === "existing") {
    return z.uuid().parse(input.formData.get("resumeId"));
  }

  const file = input.formData.get("resumeFile");
  if (!(file instanceof File) || file.size === 0) throw new Error("VALIDATION_ERROR: resume file is required");
  const experienceIds = input.formData.getAll("experienceIds").map(String).map((id) => z.uuid().parse(id));
  const newExperienceNames = input.formData.getAll("newExperienceNames").map(String).map((name) => name.trim()).filter(Boolean);
  const uploaded = await uploadResumeVersion({
    userId: input.userId,
    file,
    name: z.string().trim().max(255).optional().parse(input.formData.get("resumeName") || undefined),
    experienceIds,
    newExperienceNames,
    requireExperience: true,
  });
  return uploaded.id;
}

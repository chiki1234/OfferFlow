import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExperienceDetailPage from "../src/app/experiences/[id]/page";

const { getExperienceDetail, getExperienceOptions, getCurrentActor } = vi.hoisted(() => ({
  getExperienceDetail: vi.fn(),
  getExperienceOptions: vi.fn(),
  getCurrentActor: vi.fn(),
}));

vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("lucide-react", () => ({ ArrowLeft: () => null }));
vi.mock("@/modules/interview-knowledge/queries", () => ({ getExperienceDetail, getExperienceOptions }));
vi.mock("@/shared/actor/current-actor", () => ({ getCurrentActor }));
vi.mock("@/app/faq/knowledge-forms", () => ({
  ExperienceEditor: () => null,
  FaqEditor: ({ experiences }: { experiences: Array<{ id: string; name: string }> }) => createElement("output", { "data-experience-options": experiences.map((item) => item.name).join("|") }),
}));
vi.mock("@/app/faq/faq-facts", () => ({ FaqFrequency: () => null, FaqSources: () => null }));

describe("experience FAQ editor", () => {
  beforeEach(() => {
    getCurrentActor.mockResolvedValue({ userId: "user-1" });
    getExperienceDetail.mockResolvedValue({
      experience: { id: "experience-current", name: "当前经历", content: "内容" },
      faqs: [{ id: "faq-1", question: "测试问题", answer: "", category: null, experienceId: "experience-current", frequency: 1, sources: [] }],
      resumes: [],
      faqCategories: [],
    });
    getExperienceOptions.mockResolvedValue([
      { id: "experience-current", name: "当前经历" },
      { id: "experience-other", name: "其他经历" },
    ]);
  });

  it("offers every owned experience when editing a FAQ from an experience detail page", async () => {
    const page = await ExperienceDetailPage({ params: Promise.resolve({ id: "experience-current" }) });
    const markup = renderToStaticMarkup(page);

    expect(getExperienceOptions).toHaveBeenCalledWith("user-1");
    expect(markup).toContain('data-experience-options="当前经历|其他经历"');
  });
});

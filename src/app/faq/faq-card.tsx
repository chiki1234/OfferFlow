import { isFaqSettingsComplete, type FaqCategoryConfig } from "@/modules/interview-knowledge/faq-batch";
import { FaqAnswerDisclosure } from "./faq-answer-disclosure";
import { FaqFrequency, FaqSources } from "./faq-facts";
import { FaqEditor } from "./knowledge-forms";

type FaqCardData = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  experienceId: string | null;
  experienceName?: string | null;
  frequency: number;
  sources: Array<{ id: string; label: string }>;
};

export function FaqCard({ faq, experiences, faqCategories }: {
  faq: FaqCardData;
  experiences: Array<{ id: string; name: string }>;
  faqCategories: FaqCategoryConfig;
}) {
  const settingsComplete = isFaqSettingsComplete(faq);
  const settingLabel = faq.experienceId
    ? faq.experienceName ?? experiences.find((experience) => experience.id === faq.experienceId)?.name ?? "已绑定经历"
    : faq.category ?? "暂不设置";

  const footer = <div className="faq-card-bottom">
    <FaqSources sources={faq.sources} />
    <FaqEditor faq={faq} experiences={experiences} faqCategories={faqCategories} incomplete={!settingsComplete} />
  </div>;

  return <FaqAnswerDisclosure answer={faq.answer} footer={footer} question={faq.question}>
    <div className={settingsComplete ? "faq-card-meta" : "faq-card-meta incomplete"}>
      <span>{settingLabel}</span><FaqFrequency count={faq.frequency} />
    </div>
    <h3>{faq.question}</h3>
  </FaqAnswerDisclosure>;
}

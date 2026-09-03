import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { getFaqImportReview } from "@/modules/interview-knowledge/faq-import";
import { getKnowledgeLibrary } from "@/modules/interview-knowledge/queries";
import { isDomainNotFoundError } from "@/shared/errors/domain-error";
import { FaqImportRecovery } from "../../import-recovery";
import { FaqImportReview } from "./review";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function FaqImportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const actor = await getCurrentActor();
  const review = await getFaqImportReview(actor.userId, id.data).catch((error: unknown) => {
    if (isDomainNotFoundError(error)) notFound();
    throw error;
  });
  if (review.status === "completed") redirect("/faq");
  if (review.status !== "review") {
    const options = await getKnowledgeLibrary(actor.userId);
    return <main className="page-stack"><FaqImportRecovery draft={{ batchId: review.id, items: review.items, sourceInterviewId: review.sourceInterviewId }} experiences={options.experiences} interviews={options.interviews} faqCategories={options.faqCategories} /></main>;
  }
  return <FaqImportReview review={review} />;
}

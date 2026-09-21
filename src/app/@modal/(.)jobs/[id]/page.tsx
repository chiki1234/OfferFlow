import { JobDetailContent } from "@/app/jobs/[id]/job-detail-content";
import { JobDetailModal } from "@/app/jobs/job-detail-modal";

export const dynamic = "force-dynamic";

export default async function JobDetailIntercept({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JobDetailModal intercepted><JobDetailContent id={id} /></JobDetailModal>;
}

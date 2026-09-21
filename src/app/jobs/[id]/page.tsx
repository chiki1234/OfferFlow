import { JobDetailContent } from "./job-detail-content";
import { JobDetailModal } from "../job-detail-modal";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JobDetailModal><JobDetailContent id={id} /></JobDetailModal>;
}

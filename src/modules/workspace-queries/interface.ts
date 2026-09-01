import type { ActorContext } from "@/modules/job-workflow/interface";

export type ListJobTracksQuery = {
  type: "list_job_tracks";
  lifecycle?: "planned" | "active" | "ended";
};

export type WorkspaceQuery = ListJobTracksQuery;

export type JobTrackListItem = {
  id: string;
  companyName: string;
  roleName: string;
  lifecycle: "planned" | "active" | "ended";
  submittedAt: string | null;
  hasJobDescription: boolean;
  hasResume: boolean;
  lastProgressAt: string | null;
};

export type JobTrackListView = {
  type: "job_track_list";
  items: JobTrackListItem[];
  counts: Record<"planned" | "active" | "ended", number>;
};

export type WorkspaceView = JobTrackListView;

export interface WorkspaceQueries {
  read(query: WorkspaceQuery, context: ActorContext): Promise<WorkspaceView>;
}

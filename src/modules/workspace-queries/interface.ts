import type {
  ActorContext,
  AssessmentView,
  InterviewView,
  JobEventView,
  TaskView,
} from "@/modules/job-workflow/interface";
import type { JobTrackCurrentNextView } from "./derive-job-track-current-next";

export type ListJobTracksQuery = {
  type: "list_job_tracks";
  lifecycle?: "planned" | "active" | "ended";
};

export type GetDashboardQuery = {
  type: "get_dashboard";
  waitingDays?: number;
  now?: string;
};

export type GetCalendarWeekQuery = {
  type: "get_calendar_week";
  startAt: string;
  endAt: string;
};

export type GetJobTrackDetailQuery = {
  type: "get_job_track_detail";
  jobTrackId: string;
};

export type WorkspaceQuery =
  | ListJobTracksQuery
  | GetDashboardQuery
  | GetCalendarWeekQuery
  | GetJobTrackDetailQuery;

export type JobTrackListItem = {
  id: string;
  companyName: string;
  roleName: string;
  department?: string | null;
  preferenceRank?: number | null;
  lifecycle: "planned" | "active" | "ended";
  submittedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  jobUrl?: string | null;
  selectedResume?: { name: string; assetId: string } | null;
  milestones?: Array<{ id: string; title: string; href: string; status: string; at: string | null; endAt?: string | null; timingType?: "deadline" | "fixed_slot" }>;
  pendingTasks?: Array<{ id: string; title: string; at: string | null; endAt?: string | null; timingType?: "deadline" | "fixed_slot" }>;
  latestEvent?: { kind: string; payload: Record<string, unknown>; occurredAt: string } | null;
  waitingDays?: number | null;
  hasJobDescription: boolean;
  hasResume: boolean;
  lastProgressAt: string | null;
  actionState: "action_required" | "waiting" | null;
  attentionFlags: Array<"overdue" | "waiting_long">;
  currentNext: JobTrackCurrentNextView;
  version: number;
};

export type JobTrackListView = {
  type: "job_track_list";
  items: JobTrackListItem[];
  counts: Record<"planned" | "active" | "ended", number>;
};

export type CalendarItem = {
  id: string;
  sourceType: "interview" | "assessment" | "task";
  jobTrackId: string | null;
  companyName: string | null;
  department?: string | null;
  roleName: string | null;
  title: string;
  externalUrl?: string | null;
  startAt: string;
  endAt: string | null;
  isDeadline: boolean;
  hasConflict: boolean;
};

export type DashboardActionItem = {
  id: string;
  sourceType: "assessment" | "task" | "interview_review" | "interview";
  jobTrackId: string | null;
  companyName: string | null;
  department?: string | null;
  roleName: string | null;
  title: string;
  externalUrl?: string | null;
  dueAt: string | null;
  endAt?: string | null;
  overdue: boolean;
  taskKind?: TaskView["kind"];
  interviewId?: string | null;
  timeSource?: "deadline" | "start" | "interview";
};

export type DashboardView = {
  type: "dashboard";
  counts: Record<"planned" | "active" | "ended", number>;
  todayItems: DashboardActionItem[];
  upcomingItems: CalendarItem[];
  attentionJobs: JobTrackListItem[];
};

export type CalendarWeekView = {
  type: "calendar_week";
  startAt: string;
  endAt: string;
  items: CalendarItem[];
};

export type JobTrackDetailView = {
  type: "job_track_detail";
  jobTrack: JobTrackListItem & {
    jobUrl: string | null;
    jobDescription: string | null;
  };
  assessments: AssessmentView[];
  interviews: InterviewView[];
  tasks: TaskView[];
  events: JobEventView[];
  resumes: Array<{ id: string; name: string }>;
  selectedResume: { id: string; name: string; assetId: string } | null;
  selectedResumeExperiences: Array<{ id: string; name: string; faqCount: number }>;
  jobDescriptionImages: Array<{ id: string; originalName: string; mimeType: string }>;
};

export type WorkspaceView = JobTrackListView | DashboardView | CalendarWeekView | JobTrackDetailView;

export type WorkspaceViewFor<TQuery extends WorkspaceQuery> =
  TQuery extends ListJobTracksQuery
    ? JobTrackListView
    : TQuery extends GetDashboardQuery
      ? DashboardView
      : TQuery extends GetCalendarWeekQuery
        ? CalendarWeekView
        : TQuery extends GetJobTrackDetailQuery
          ? JobTrackDetailView
          : never;

export interface WorkspaceQueries {
  read<TQuery extends WorkspaceQuery>(
    query: TQuery,
    context: ActorContext,
  ): Promise<WorkspaceViewFor<TQuery>>;
}

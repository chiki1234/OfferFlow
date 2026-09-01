type PreparationTask = {
  id: string;
  kind: "generic" | "interview_prep" | "assessment";
  interviewId: string | null;
  completedAt: unknown | null;
  cancelledAt: unknown | null;
};

type PreparationInterview = {
  id: string;
  status: "scheduled" | "cancelled";
  startAt: string | Date;
};

export function findImminentInterviewPreparationTasks<TTask extends PreparationTask>(
  tasks: readonly TTask[],
  interviews: readonly PreparationInterview[],
  now: Date,
  endAt: Date,
) {
  const nowMs = now.getTime();
  const endMs = endAt.getTime();
  const interviewsById = new Map(interviews.map((interview) => [interview.id, interview]));
  return tasks.flatMap((task) => {
    if (task.kind !== "interview_prep" || task.completedAt || task.cancelledAt || !task.interviewId) return [];
    const interview = interviewsById.get(task.interviewId);
    if (!interview || interview.status !== "scheduled") return [];
    const startMs = new Date(interview.startAt).getTime();
    if (startMs <= nowMs || startMs > endMs) return [];
    return [{ task, dueAt: new Date(startMs).toISOString() }];
  }).sort((left, right) => left.dueAt.localeCompare(right.dueAt));
}

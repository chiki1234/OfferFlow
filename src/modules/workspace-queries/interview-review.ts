export function interviewReviewDeadline(endAt: string | Date): Date {
  return new Date(new Date(endAt).getTime() + 3 * 60 * 60 * 1000);
}

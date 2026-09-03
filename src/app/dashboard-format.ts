const timeZone = "Asia/Shanghai";
const dayMs = 86_400_000;

export function dateParts(value: string) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      month: "numeric",
      day: "numeric",
    }).format(date),
    weekday: new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      weekday: "short",
    }).format(date),
    time: new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date),
  };
}

export function relativeTime(value: string, now: string) {
  const day = (input: string) =>
    Math.floor((new Date(input).getTime() + 8 * 3_600_000) / dayMs);
  const difference = day(value) - day(now);
  const parts = dateParts(value);
  const prefix =
    difference === 0
      ? "今天"
      : difference === 1
        ? "明天"
        : difference === 2
          ? "后天"
          : parts.date;
  return `${prefix} ${parts.time}`;
}

export function fullDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function greeting(now: string) {
  const hour = (new Date(now).getUTCHours() + 8) % 24;
  return hour < 6
    ? "夜深了"
    : hour < 12
      ? "上午好"
      : hour < 18
        ? "下午好"
        : "晚上好";
}

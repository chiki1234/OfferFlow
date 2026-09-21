/** Parse explicit calendar expressions in Asia/Shanghai; never guess invalid dates. */
export function parseTimeInput(input: string, options: { now?: Date; selectedDate?: string; deadline?: boolean } = {}): string {
  const now = new Date((options.now ?? new Date()).getTime() + 8 * 3600000);
  let year = now.getUTCFullYear(), month = now.getUTCMonth() + 1, day = now.getUTCDate();
  let text = input.trim().replace(/T/, " ").replace(/：/g, ":");
  if (!text) return "";
  let hasDate = false;
  const relative = text.match(/^(今天|明天|后天|下周[一二三四五六日天])/);
  if (relative) {
    const token = relative[1];
    const offset = token === "今天" ? 0 : token === "明天" ? 1 : token === "后天" ? 2 : 7 - ((now.getUTCDay() + 6) % 7) + "一二三四五六日".indexOf(token.slice(-1).replace("天", "日"));
    now.setUTCDate(now.getUTCDate() + offset);
    year = now.getUTCFullYear(); month = now.getUTCMonth() + 1; day = now.getUTCDate();
    text = text.slice(token.length).trim(); hasDate = true;
  } else {
    const date = text.match(/^(?:(\d{4})[-/年])?(\d{1,2})[-/月](\d{1,2})(?:日)?/);
    if (date) {
      year = date[1] ? Number(date[1]) : year; month = Number(date[2]); day = Number(date[3]);
      text = text.slice(date[0].length).trim(); hasDate = true;
    } else if (options.selectedDate) {
      [year, month, day] = options.selectedDate.slice(0, 10).split("-").map(Number);
    }
  }
  let hour: number, minute: number;
  if (!text && hasDate && options.deadline) { hour = 23; minute = 59; }
  else {
    const time = text.match(/^(上午|下午|晚上|中午|凌晨)?\s*(\d{1,2})(?::(\d{2})|[点时](?:(半)|(\d{1,2})分?)?)$/);
    if (!time) throw new Error("请输入完整时间，例如：明天下午3点、9月10日14点半、2026-09-10 14:30");
    hour = Number(time[2]); minute = time[4] ? 30 : Number(time[3] ?? time[5] ?? 0);
    if (time[1] && (hour < 1 || hour > 12)) throw new Error("上午/下午请使用 1–12 点");
    if (["下午", "晚上", "中午"].includes(time[1]) && hour < 12) hour += 12;
    if (["凌晨", "上午"].includes(time[1]) && hour === 12) hour = 0;
  }
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (year < 1000 || year > 9999 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day || hour > 23 || minute > 59) throw new Error("日期或时间不存在，请检查输入");
  return date.toISOString().slice(0, 16);
}

export function localTimeToIso(value: string): string {
  const normalized = parseTimeInput(value);
  if (!normalized) throw new Error("请填写时间");
  return new Date(`${normalized}:00+08:00`).toISOString();
}

/** Keep explicit-offset callers compatible while validating the calendar date. */
export function formTimeToIso(value: string): string {
  const iso = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/);
  if (!iso) return localTimeToIso(value);
  parseTimeInput(iso[1]);
  const date = new Date(value);
  if (Number(iso[2] ?? 0) > 59 || Number.isNaN(date.getTime())) throw new Error("日期或时间不存在，请检查输入");
  return date.toISOString();
}

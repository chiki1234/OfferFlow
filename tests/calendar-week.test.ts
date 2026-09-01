import { describe, expect, it } from "vitest";
import { getShanghaiCalendarWeek } from "@/modules/workspace-queries/calendar-week";

describe("getShanghaiCalendarWeek", () => {
  it("按上海本地日期计算周一到下周一的 UTC 区间", () => {
    expect(getShanghaiCalendarWeek(new Date("2026-09-06T18:00:00.000Z"))).toEqual({
      key: "2026-09-07",
      previousKey: "2026-08-31",
      nextKey: "2026-09-14",
      startAt: "2026-09-06T16:00:00.000Z",
      endAt: "2026-09-13T16:00:00.000Z",
    });
  });

  it("URL 中任意一天都会正规化到其所在周的周一", () => {
    expect(getShanghaiCalendarWeek(new Date("2026-09-01T00:00:00.000Z"), "2027-01-03")).toMatchObject({
      key: "2026-12-28",
      previousKey: "2026-12-21",
      nextKey: "2027-01-04",
    });
  });

  it("忽略无效 URL 日期并回退到当前上海周", () => {
    expect(getShanghaiCalendarWeek(new Date("2026-09-01T00:00:00.000Z"), "not-a-date").key).toBe("2026-08-31");
  });
});

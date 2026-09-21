import { describe, expect, it } from "vitest";
import { parseTimeInput, localTimeToIso, formTimeToIso } from "@/shared/time/parse-time-input";
const now = new Date("2026-12-31T15:00:00Z");
describe("北京时间文本输入", () => {
  it.each([
    ["2026-09-10 14:30", "2026-09-10T14:30"],
    ["9月10日14点半", "2026-09-10T14:30"],
    ["明天下午3点", "2027-01-01T15:00"],
    ["下周一10点", "2027-01-04T10:00"],
    ["2028/2/29 09:00", "2028-02-29T09:00"],
  ])("%s → %s", (input, result) => expect(parseTimeInput(input, { now })).toBe(result));
  it("缺省日期使用选中日期，Deadline 纯日期补 23:59", () => {
    expect(parseTimeInput("14:30", { now, selectedDate: "2027-01-03T09:00" })).toBe("2027-01-03T14:30");
    expect(parseTimeInput("明天", { now, deadline: true })).toBe("2027-01-01T23:59");
    expect(localTimeToIso("2026-09-10T14:30")).toBe("2026-09-10T06:30:00.000Z");
  });
  it.each(["930", "半小时后", "2026-02-29 10:00", "2026-13-01 10:00", "25:00", "12:60", "明天", "明天下午15点", "明天3点abc"])("拒绝错误或不支持的输入 %s", input => expect(() => parseTimeInput(input, { now })).toThrow());
});

it("服务端时间转换也拒绝日期滚动归一化，并兼容显式时区", () => {
  expect(() => formTimeToIso("2026-02-29T10:00")).toThrow();
  expect(() => formTimeToIso("2026-02-29T10:00:00Z")).toThrow();
  expect(() => formTimeToIso("2026-09-10T10:00:60Z")).toThrow();
  expect(formTimeToIso("2026-09-10T10:00:00.123+08:00")).toBe("2026-09-10T02:00:00.123Z");
});

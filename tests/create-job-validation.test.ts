import { describe, expect, it } from "vitest";
import { validateCreateJobForm } from "../src/app/jobs/create-job-validation";

function form(mode = "planned") {
  const data = new FormData();
  data.set("companyName", "公司"); data.set("creationMode", mode);
  for (const key of ["0", "4"]) {
    data.append("roleKeys", key);
    data.set(`roles.${key}.roleName`, "岗位"); data.set(`roles.${key}.jobDescription`, "JD");
    data.set(`roles.${key}.preferenceRank`, String(Number(key) + 1));
  }
  return data;
}
describe("create job form validation", () => {
  it("collects errors across stable role keys including both conflicting preferences", () => {
    const data = form();
    data.set("companyName", " "); data.set("roles.4.roleName", " ");
    data.set("roles.0.jobDescription", ""); data.set("roles.4.preferenceRank", "1");
    data.set("roles.4.jobUrl", "bad-link");
    expect(Object.keys(validateCreateJobForm(data)).sort()).toEqual([
      "companyName", "roles.0.preferenceRank", "roles.4.preferenceRank", "roles.4.roleName", "roles.4.jobUrl",
    ].sort());
  });
  it("accepts empty or omitted JD and still enforces its length limit", () => {
    const data = form(); data.set("roles.0.jobDescription", ""); data.delete("roles.4.jobDescription");
    expect(validateCreateJobForm(data)).toEqual({});
    data.set("roles.4.jobDescription", "x".repeat(50001));
    expect(Object.keys(validateCreateJobForm(data))).toEqual(["roles.4.jobDescription"]);
  });
  it("validates each active role's resume and associated experiences", () => {
    const data = form("active");
    data.set("roles.0.resumeMode", "existing"); data.set("roles.4.resumeMode", "upload");
    expect(Object.keys(validateCreateJobForm(data)).sort()).toEqual(["roles.0.resumeId", "roles.4.experiences", "roles.4.resumeFile"]);
    data.set("roles.0.resumeId", "12345678-1234-4234-8234-123456789012");
    data.set("roles.4.resumeFile", new File(["pdf"], "cv.pdf", { type: "application/pdf" }));
    data.append("roles.4.newExperienceNames", "项目经历");
    expect(validateCreateJobForm(data)).toEqual({});
  });
});

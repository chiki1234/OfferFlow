// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CreateJobForm } from "../src/app/jobs/company-job-form";

const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("../src/app/jobs/actions", () => ({ createJobTrackAction: save }));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  save.mockReset();
  save.mockResolvedValue({ error: "保存失败", success: null });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
function field(name: string) { return container.querySelector<HTMLInputElement>(`[name="${name}"]`)!; }
async function render() {
  await act(async () => root.render(createElement(CreateJobForm, { idempotencyKey: "test-create-job", resumes: [], experiences: [], initialCompany: "测试公司", fixedCreationMode: "planned" })));
  field("roles.0.roleName").value = "产品经理";
  field("roles.0.department").value = "产品部";
  field("roles.0.jobDescription").value = "岗位职责与要求";
  field("roles.0.jobUrl").value = "https://example.com/job";
}
it("retains every entered value after a server validation failure and marks the field", async () => {
  save.mockResolvedValue({ error: "志愿已被占用", success: null, fieldErrors: { "roles.0.preferenceRank": "志愿已被占用" } });
  await render();
  await act(async () => container.querySelector("form")!.requestSubmit());
  expect(save).toHaveBeenCalledOnce();
  expect(field("roles.0.roleName").value).toBe("产品经理");
  expect(field("roles.0.department").value).toBe("产品部");
  expect(field("roles.0.jobDescription").value).toBe("岗位职责与要求");
  expect(field("roles.0.jobUrl").value).toBe("https://example.com/job");
  expect(field("roles.0.preferenceRank").getAttribute("aria-invalid")).toBe("true");
});
it("marks all missing fields without clearing the draft or contacting the server", async () => {
  await render();
  field("roles.0.roleName").value = " "; field("roles.0.jobDescription").value = "";
  await act(async () => container.querySelector("form")!.requestSubmit());
  expect(save).not.toHaveBeenCalled();
  expect(field("roles.0.roleName").getAttribute("aria-invalid")).toBe("true");
  expect(field("roles.0.jobDescription").getAttribute("aria-invalid")).toBeNull();
  expect(field("roles.0.department").value).toBe("产品部");
});

it("retains the draft after a network rejection and succeeds on retry", async () => {
  const success = vi.fn();
  await render();
  await act(async () => root.render(createElement(CreateJobForm, { idempotencyKey: "test-create-job", resumes: [], experiences: [], initialCompany: "测试公司", fixedCreationMode: "planned", onSuccess: success })));
  save.mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValueOnce({ error: null, success: "已保存" });
  await act(async () => container.querySelector("form")!.requestSubmit());
  expect(field("roles.0.roleName").value).toBe("产品经理");
  expect(success).not.toHaveBeenCalled();
  await act(async () => container.querySelector("form")!.requestSubmit());
  expect(success).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][1].get("roles.0.department")).toBe("产品部");
});

it("prevents repeated submissions while a save is pending", async () => {
  let finish!: (value: { error: string; success: null }) => void;
  save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render();
  await act(async () => container.querySelector("form")!.requestSubmit());
  expect(container.querySelector('button[type="submit"]')!.hasAttribute("disabled")).toBe(true);
  await act(async () => container.querySelector("form")!.requestSubmit());
  expect(save).toHaveBeenCalledOnce();
  await act(async () => finish({ error: "保存失败", success: null }));
  expect(container.querySelector('button[type="submit"]')!.hasAttribute("disabled")).toBe(false);
});

it("submits an active job without JD or image upload and retains its resume after failure", async () => {
  const resumeId = "12345678-1234-4234-8234-123456789012";
  await act(async () => root.render(createElement(CreateJobForm, { idempotencyKey: "test-create-job", resumes: [{ id: resumeId, name: "简历" }], experiences: [], initialCompany: "测试公司", fixedCreationMode: "active" })));
  field("roles.0.roleName").value = "工程师";
  field("roles.0.jobDescription").value = "";
  field("roles.0.resumeId").value = resumeId;
  expect(field("roles.0.jobDescriptionImages")).toBeNull();
  const reset = vi.spyOn(container.querySelector("form")!, "reset");
  await act(async () => container.querySelector("form")!.requestSubmit());
  expect(save).toHaveBeenCalledOnce();
  expect(reset).not.toHaveBeenCalled();
  expect(field("roles.0.resumeId").value).toBe(resumeId);
});

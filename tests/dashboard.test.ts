// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dashboard } from "../src/app/dashboard";
import type {
  DashboardView,
  JobTrackListItem,
} from "../src/modules/workspace-queries/interface";

const now = "2026-09-03T01:00:00.000Z";
let container: HTMLDivElement;
let root: Root;

function view(): DashboardView {
  return {
    type: "dashboard",
    counts: { planned: 3, active: 5, ended: 2 },
    attentionJobs: [],
    upcomingItems: [],
    todayItems: Array.from({ length: 5 }, (_, index) => ({
      id: `task-${index}`,
      sourceType: "task",
      jobTrackId: null,
      companyName: null,
      roleName: null,
      title: `准备事项 ${index + 1}`,
      dueAt: "2026-09-03T10:00:00.000Z",
      overdue: false,
    })),
  };
}

function attentionJob(
  flags: JobTrackListItem["attentionFlags"] = ["overdue"],
): JobTrackListItem {
  return {
    id: "job-1",
    companyName: "示例公司",
    roleName: "产品经理",
    lifecycle: "active",
    submittedAt: null,
    endedAt: null,
    endReason: null,
    hasJobDescription: true,
    hasResume: false,
    lastProgressAt: "2026-08-20T02:00:00Z",
    actionState: "waiting",
    attentionFlags: flags,
    currentNext: {
      state: "waiting",
      title: "等待公司下一步",
      detail: "",
      scheduledAt: null,
      waitingDays: 14,
    },
    version: 1,
  };
}

async function click(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );
  expect(button, text).toBeDefined();
  await act(async () => {
    button!.click();
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("工作台展示与跳转", () => {
  it("测评完成请求未返回时禁用按钮，网络失败保留事项并支持重试", async () => {
    const data = view();
    data.todayItems = [{ ...data.todayItems[0], sourceType: "assessment" }];
    const response = Promise.withResolvers<{
      error: string | null;
      success: string | null;
    }>();
    let attempts = 0;
    const completeAction = async (_state: unknown, form: FormData) => {
      expect(form.get("sourceType")).toBe("assessment");
      attempts += 1;
      if (attempts === 1) return response.promise;
      return { error: null, success: "测评已完成。" };
    };
    await act(async () => {
      root.render(
        createElement(Dashboard, {
          view: data,
          displayName: "张三",
          now,
          completeAction,
        }),
      );
    });
    const button = container.querySelector<HTMLButtonElement>(
      '[aria-label="完成：准备事项 1"]',
    )!;
    await act(async () => {
      button.click();
    });
    expect(button.disabled).toBe(true);
    await act(async () => {
      response.reject(new Error("offline"));
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "暂时无法完成",
    );
    expect(container.textContent).toContain("准备事项 1");
    expect(button.disabled).toBe(false);
    await act(async () => {
      button.click();
    });
    expect(container.textContent).not.toContain("准备事项 1");
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "测评已完成",
    );
  });

  it("统计卡保留三个筛选入口，跨午夜的相对日期使用北京时间", async () => {
    const data = view();
    data.todayItems = [
      { ...data.todayItems[0], dueAt: "2026-09-04T02:00:00Z" },
    ];
    await act(async () => {
      root.render(
        createElement(Dashboard, {
          view: data,
          displayName: "张三",
          now: "2026-09-03T16:15:00Z",
        }),
      );
    });
    expect(
      Array.from(
        container.querySelectorAll('[aria-label="求职进度概览"] a'),
      ).map((link) => link.getAttribute("href")),
    ).toEqual(["/jobs?tab=planned", "/jobs?tab=active", "/jobs?tab=ended"]);
    expect(container.textContent).toContain("夜深了，张三");
    expect(container.textContent).toContain("今天 10:00");
  });
  it("全部事项弹窗有可访问标题，Tab 不离开弹窗，关闭后焦点回到入口", async () => {
    await act(async () => {
      root.render(
        createElement(Dashboard, { view: view(), displayName: "张三", now }),
      );
    });
    const opener = container.querySelector<HTMLButtonElement>(
      '[aria-label="查看全部今日事项"]',
    )!;
    await act(async () => {
      opener.focus();
      opener.click();
    });
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    const focusable = dialog.querySelectorAll<HTMLElement>("a, button");
    await act(async () => {
      focusable[focusable.length - 1].focus();
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.activeElement).toBe(focusable[0]);
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(opener);
  });
  it("空状态的添加待办在原页面打开表单并显示保存成功", async () => {
    const data = view();
    data.todayItems = [];
    const createTaskAction = async (_state: unknown, form: FormData) => {
      expect(form.get("title")).toBe("完善作品集");
      expect(form.get("jobTrackId")).toBe("");
      return { error: null, success: "待办已创建。" };
    };
    await act(async () => {
      root.render(
        createElement(Dashboard, {
          view: data,
          displayName: "张三",
          now,
          createTaskAction,
        }),
      );
    });
    await click("添加待办");
    const title = container.querySelector<HTMLInputElement>(
      'input[name="title"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(title, "完善作品集");
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("创建待办");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "待办已创建",
    );
    expect(window.location.pathname).toBe("/");
  });
  it("临近面试准备保留在今日区，时间明确标为面试时间且直接进入该面试", async () => {
    const data = view();
    data.todayItems = [
      {
        ...data.todayItems[0],
        title: "准备明天的二面",
        taskKind: "interview_prep",
        interviewId: "interview-prep",
        timeSource: "interview",
        dueAt: "2026-09-04T02:00:00Z",
      },
    ];
    await act(async () => {
      root.render(
        createElement(Dashboard, { view: data, displayName: "张三", now }),
      );
    });
    const tasks = container.querySelector(
      '[aria-labelledby="dashboard-tasks-heading"]',
    )!;
    expect(tasks.textContent).toContain("面试准备");
    expect(tasks.textContent).toContain("面试 明天 10:00");
    expect(tasks.querySelector("a")?.getAttribute("href")).toBe(
      "/interviews/interview-prep",
    );
  });
  it("日程与关注区也只预览三项，剩余事项可在各自的全部列表中查看", async () => {
    const data = view();
    data.todayItems = data.todayItems.map((item, index) => ({
      ...item,
      sourceType: "interview_review",
      title: `复盘事项 ${index + 1}`,
    }));
    data.upcomingItems = data.todayItems.map((item, index) => ({
      id: `interview-${index}`,
      sourceType: "interview",
      jobTrackId: "job-1",
      companyName: "示例公司",
      roleName: "产品经理",
      title: `面试安排 ${index + 1}`,
      startAt: "2026-09-04T02:00:00Z",
      endAt: "2026-09-04T03:00:00Z",
      isDeadline: false,
      hasConflict: false,
    }));
    await act(async () => {
      root.render(
        createElement(Dashboard, { view: data, displayName: "张三", now }),
      );
    });
    expect(container.textContent).not.toContain("面试安排 4");
    expect(container.textContent).not.toContain("复盘事项 4");
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="查看全部日程"]')!
        .click();
    });
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      "面试安排 5",
    );
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="关闭弹窗"]')!
        .click();
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="查看全部关注事项"]')!
        .click();
    });
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      "复盘事项 5",
    );
  });
  it("跟进弹窗固定岗位，失败保留文本，重试成功关闭并反馈", async () => {
    const data = view();
    data.todayItems = [];
    data.attentionJobs = [attentionJob(["waiting_long"])];
    let attempts = 0;
    const progressAction = async (_state: unknown, form: FormData) => {
      expect(form.get("jobTrackId")).toBe("job-1");
      expect(form.get("progressType")).toBe("generic");
      expect(form.get("summary")).toBe("已联系招聘方，等待回复");
      return attempts++ === 0
        ? { error: "暂时无法保存", success: null }
        : { error: null, success: "进展已记录。" };
    };
    await act(async () => {
      root.render(
        createElement(Dashboard, {
          view: data,
          displayName: "张三",
          now,
          progressAction,
        }),
      );
    });
    await click("记录跟进");
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      "示例公司 · 产品经理",
    );
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(textarea, "已联系招聘方，等待回复");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("保存跟进");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "暂时无法保存",
    );
    expect(textarea.value).toBe("已联系招聘方，等待回复");
    await click("保存跟进");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "进展已记录",
    );
    expect(window.location.pathname).toBe("/");
  });
  it("完成待办后保持在工作台，显示成功反馈并从今日和日程列表移除", async () => {
    const data = view();
    data.todayItems = [data.todayItems[0]];
    data.upcomingItems = [
      {
        id: "task-0",
        sourceType: "task",
        jobTrackId: null,
        companyName: null,
        roleName: null,
        title: "准备事项 1",
        startAt: "2026-09-03T10:00:00Z",
        endAt: null,
        isDeadline: true,
        hasConflict: false,
      },
    ];
    // This callback represents the browser-to-server transport boundary.
    const completeAction = async (_state: unknown, form: FormData) => {
      expect(form.get("sourceType")).toBe("task");
      expect(form.get("itemId")).toBe("task-0");
      return { error: null, success: "待办已完成。" };
    };
    await act(async () => {
      root.render(
        createElement(Dashboard, {
          view: data,
          displayName: "张三",
          now,
          completeAction,
        }),
      );
    });
    const complete = container.querySelector<HTMLButtonElement>(
      'button[aria-label="完成：准备事项 1"]',
    );
    expect(complete).not.toBeNull();
    await act(async () => {
      complete!.click();
    });
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "待办已完成",
    );
    expect(container.textContent).not.toContain("准备事项 1");
    expect(window.location.pathname).toBe("/");
  });
  it("逾期事项已在今日区时不再重复生成关注卡，复盘只出现一次且直达对应面试", async () => {
    const data = view();
    data.todayItems = [
      {
        ...data.todayItems[0],
        jobTrackId: "job-1",
        companyName: "示例公司",
        overdue: true,
      },
      {
        ...data.todayItems[0],
        id: "review-1",
        jobTrackId: "job-1",
        sourceType: "interview_review",
        title: "复盘一面",
      },
    ];
    data.attentionJobs = [attentionJob()];
    await act(async () => {
      root.render(
        createElement(Dashboard, { view: data, displayName: "张三", now }),
      );
    });
    const attention = container.querySelector(
      '[aria-labelledby="dashboard-attention-heading"]',
    )!;
    expect(attention.textContent).not.toContain("有事项已逾期");
    expect(container.textContent?.match(/复盘一面/g)).toHaveLength(1);
    expect(attention.querySelector("a")?.getAttribute("href")).toBe(
      "/interviews/review-1",
    );
  });
  it("首页只显示三项待办，查看全部在当前页面展示剩余事项并能关闭", async () => {
    await act(async () => {
      root.render(
        createElement(Dashboard, { view: view(), displayName: "张三", now }),
      );
    });
    expect(container.textContent).toContain("准备事项 3");
    expect(container.textContent).not.toContain("准备事项 4");
    await click("查看全部");
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("准备事项 5");
    expect(window.location.pathname).toBe("/");
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="关闭弹窗"]')!
        .click();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});

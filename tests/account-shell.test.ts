import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "@/components/workspace-shell";

const { currentPath } = vi.hoisted(() => ({ currentPath: { value: "/register" } }));
vi.mock("next/navigation", () => ({ usePathname: () => currentPath.value }));
vi.mock("@/components/global-quick-actions", () => ({ GlobalQuickActions: () => createElement("button", null, "全局快捷操作") }));
vi.mock("@/components/logout-button", () => ({ LogoutButton: () => createElement("button", null, "退出登录") }));

describe("公开账号页面布局", () => {
  it.each(["/login", "/register", "/forgot-password", "/reset-password"])("%s 不显示工作台导航和操作", (path) => {
    currentPath.value = path;
    const markup = renderToStaticMarkup(createElement(WorkspaceShell, null, createElement("main", null, "账号页面")));
    expect(markup).toContain("账号页面");
    expect(markup).not.toContain("一级导航");
    expect(markup).not.toContain("退出登录");
    expect(markup).not.toContain("全局快捷操作");
  });
});

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 本项目验收偏好

- 适用范围：`E:\CodingProject\JobHuntingWeb` 的所有需求改动，跨会话持续生效。本规则覆盖此前跨项目的验收子智能体要求。
- 所有测试与验收由用户人工执行。智能体完成实现后不调用验收子智能体，也不自行运行测试、类型检查、Lint、验收构建或浏览器验收；用户后续明确要求执行时再按该次要求处理。
- 完成任务后简要说明如何人工验收：操作入口、关键步骤及预期结果。未执行的检查不得写成已通过；迭代记录的验证部分标记为“待用户人工验收”。

## 本项目 Git 交付偏好

- 每次任务完成后，将该任务的相关改动创建 Git commit 并推送到当前分支对应的远端仓库；此为用户长期授权，无需每次询问。仅修改规则或文档的任务同样适用。
- 提交前核对改动范围与敏感信息，避免混入无关的既有工作区改动；不强制推送、不覆盖远端历史。上述 Git 交付检查不属于功能测试或验收。
- 推送成功后简要报告提交号和目标分支，并按需提供人工验收步骤。如提交或推送失败，明确说明未同步及原因，不宣称任务已交付到远端。

## Project iteration log

After every independently deliverable change that adds, modifies, or removes project behavior, read `docs/迭代记录.md` and add or update one iteration entry before reporting completion. The background and its evidence are required; when the reason is not established by the user request, a reproducible finding, or repository history, ask the user and mark it pending confirmation instead of inventing it. Completion requires the entry to account for added, changed, and removed behavior, data or compatibility impact, actual verification, remaining work, and associated changes.

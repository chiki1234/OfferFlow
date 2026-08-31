# 采用模块化单体并让 UI 与 AI 共用业务动作

系统采用单个 Next.js 应用和 PostgreSQL 数据库，按 JobWorkflow、InterviewKnowledge 与 WorkspaceQueries 划分 module。页面 Server Actions 和未来 AI Route Handlers 只是位于同一 seam 上的 adapter，统一调用业务动作；这样可以在不过早引入微服务和消息队列的前提下，集中维护跨 Task、Assessment、Interview、Event 与 JobTrack 的一致性。

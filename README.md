# 求职轨迹

围绕一次具体求职推进，统一管理岗位 JD、投递简历、测评、面试、待办、Timeline 和面试 FAQ。

当前已完成：

- Next.js 16 + TypeScript + PostgreSQL/Drizzle 工程基础
- `JobWorkflow.execute(command)` 业务动作 interface
- 新增待投递、完成投递、记录 Deadline 型测评的领域行为
- PostgreSQL schema 与两份 migration
- 工作台、求职页、日历和 FAQ 一级页面
- 新增待投递 Server Action 与响应式表单

## 本地启动

前置环境：Node.js 20.9+、pnpm、Docker Desktop。

```bash
pnpm install
cp .env.example .env.local
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Windows PowerShell 可以用下面的命令复制环境文件：

```powershell
Copy-Item .env.example .env.local
```

打开 <http://localhost:3000>。

## 质量门禁

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 项目资料

- [领域词汇](./CONTEXT.md)
- [技术方案 V1](./docs/技术方案V1.md)
- [架构决策](./docs/adr/)

## 当前开发顺序

1. Release A：投递、测评、面试、待办、Timeline、工作台与周日历。
2. Release B：Experience、Resume 关联、FAQ Block 解析与知识库。
3. 文件上传、交互式认证和部署加固。

# 求职轨迹

围绕一次具体求职推进，统一管理岗位 JD、投递简历、测评、面试、待办、Timeline 和面试 FAQ。

当前已完成：

- Next.js 16 + TypeScript + PostgreSQL/Drizzle 工程基础
- `JobWorkflow.execute(command)` 业务动作 interface
- 待投递、批量快速导入、岗位信息编辑、JD 文本 / 私有图片、简历版本上传和投递
- Deadline / 固定时间测评创建、完成和取消联动
- 面试创建、改期、取消、发生确认、文本 / 私有文件 Transcript 和复盘闭环
- 待办创建、完成、取消，以及岗位拒信 / 主动结束处理
- 全局快捷记录页、可选岗位 / 面试关联，以及无岗位通用待办
- 行动状态、逾期 / 等待较久标记、待复盘推导
- Experience、Resume 关联、FAQ Block 批量解析、搜索筛选和知识库维护
- 日历时间冲突提示和通用进展 Timeline 记录
- PostgreSQL schema、MinIO 私有对象存储和四份 migration
- 真实数据驱动的工作台关注区、岗位“当前 / 下一步”、分组列表、可翻周日历和 Timeline
- GitHub Actions 持续运行 Lint、测试、类型检查、生产构建，并用真实 PostgreSQL + MinIO 执行迁移、健康检查与导出烟测
- 登录用户可从侧边栏导出完整结构化 JSON（私有文件以受保护下载路径列入清单）

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

服务就绪检查：<http://localhost:3000/api/health>。数据库和私有对象存储均可用时返回 `200`。

生产容器镜像可以用 `docker build -t job-hunting-web .` 构建；运行时需注入 `.env.example` 中列出的环境变量。

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
3. 交互式认证、部署加固与数据导出。

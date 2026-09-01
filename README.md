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
- CI 集成场景会真实执行简历 / Transcript 上传、投递、测评、面试、准备任务与 FAQ 知识回流，并从五个读取视图反向验收
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

服务就绪检查：<http://localhost:3000/api/health>。认证配置、数据库和私有对象存储均可用时返回 `200`，并分别报告三项非敏感检查结果。

当前认证入口是显式的本地单用户模式：`AUTH_MODE=local` 会把所有请求映射到 `APP_USER_ID`。开发环境可直接使用；生产环境默认拒绝启动业务请求，只有受信任、访问边界已由反向代理或内网控制的单用户部署，才可显式设置 `ALLOW_LOCAL_AUTH_IN_PRODUCTION=true`。公开部署前必须先接入真正的登录与会话方案，不能把这个开关当作登录功能。

生产容器镜像可以用 `docker build -t job-hunting-web .` 构建；运行时需注入 `.env.example` 中列出的环境变量。正式的多实例镜像构建还应通过安全的 CI secret 向 Dockerfile 的同名 build args 注入 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` 与 `DEPLOYMENT_VERSION`。

自托管生产环境应在构建与运行阶段使用同一份 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`，并为每次发布设置唯一 `DEPLOYMENT_VERSION`。前者避免多实例间 Server Action 无法解密，后者让滚动发布发生版本偏差时自动回退到完整页面导航。不要在生产环境沿用 `.env.example` 的示例密钥。

## 质量门禁

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration # 需要已迁移的 PostgreSQL 与已创建 Bucket 的 MinIO
```

## 项目资料

- [领域词汇](./CONTEXT.md)
- [技术方案 V1](./docs/技术方案V1.md)
- [一期验收清单](./docs/一期验收清单.md)
- [架构决策](./docs/adr/)

## 当前开发顺序

1. Release A：投递、测评、面试、待办、Timeline、工作台与周日历。
2. Release B：Experience、Resume 关联、FAQ Block 解析与知识库。
3. 选择并接入交互式认证方案；本地单用户模式和生产防误用边界已建立。

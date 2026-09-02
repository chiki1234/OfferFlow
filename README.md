# OfferFlow（求职轨迹）

围绕一次具体求职推进，统一管理岗位 JD、投递简历、测评、面试、待办、Timeline 和面试 FAQ。

当前已完成：

- Next.js 16 + TypeScript + PostgreSQL/Drizzle 工程基础
- `JobWorkflow.execute(command)` 业务动作 interface
- 待投递、批量快速导入、岗位信息编辑/删除、JD 文本 / 私有图片、简历版本上传和投递
- Deadline / 固定时间测评创建、完成、取消和彻底删除联动
- 面试创建、改期、取消、彻底删除、发生确认、文本 / 私有文件 Transcript 和复盘闭环
- 待办创建、完成、取消，以及岗位拒信 / 主动结束处理
- 全局快捷记录页、可选岗位 / 面试关联，以及无岗位通用待办
- 行动状态、逾期 / 等待较久标记、待复盘推导
- Experience、Resume 强关联、FAQ Block 批量解析、独立或面试来源 FAQ、搜索筛选和知识库维护
- 未绑定 FAQ 的自定义分类、待补充筛选，以及经历/FAQ 的编辑、删除与引用保护
- 日历时间冲突提示和通用进展 Timeline 记录
- Better Auth 账号密码登录、数据库会话、关闭公开注册、全站访问保护和退出登录
- PostgreSQL schema、MinIO 私有对象存储和十份 migration
- 真实数据驱动的工作台关注区、岗位“当前 / 下一步”、分组列表、可翻周日历和 Timeline
- GitHub Actions 持续运行 Lint、测试、类型检查、生产构建，并用真实 PostgreSQL + MinIO 执行迁移、健康检查与导出烟测
- CI 集成场景会真实执行简历 / Transcript 上传、投递、测评、面试、准备任务与 FAQ 知识回流，并从五个读取视图和双用户隔离场景反向验收
- 全局浮动快捷操作可新增岗位、记录进展、创建待办和知识；`/quick` 同时保留完整快捷页
- 登录用户可从侧边栏导出完整结构化 JSON（包含 FAQ 分类；私有文件以受保护下载路径列入清单）

## 本地启动

前置环境：Node.js 22、pnpm 11.19。Windows 可直接使用项目内便携服务，不要求安装 Docker Desktop。

```powershell
pnpm install
Copy-Item .env.example .env.local
# 先修改 .env.local 中的数据库、MinIO 和 AUTH_SECRET 示例密钥
pnpm services:setup
pnpm db:migrate
pnpm storage:ensure
$env:INITIAL_USER_EMAIL="you@example.com"
$env:INITIAL_USER_NAME="你的名字"
$env:INITIAL_USER_PASSWORD="至少10位的安全密码"
pnpm auth:create-user
pnpm dev
```

以后重新开机只需启动已有服务：

```powershell
pnpm services:start
pnpm dev
```

需要关闭便携服务时运行 `pnpm services:stop`。便携版 PostgreSQL、MinIO 和本地数据都保存在被 Git 忽略的 `.runtime/` 中；下载脚本固定版本并校验 SHA-256。Docker 用户也可继续使用 `docker compose up -d`。

打开 <http://localhost:3000>。

服务就绪检查：<http://localhost:3000/api/health>。认证配置、数据库和私有对象存储均可用时返回 `200`，并分别报告三项非敏感检查结果。

默认认证入口是 `AUTH_MODE=password`：使用邮箱账号、scrypt 密码哈希和数据库会话，公开注册关闭，只能通过 `pnpm auth:create-user` 创建账号。`AUTH_MODE=local` 仅保留给 CI 和受信任的单用户开发环境；生产环境默认拒绝固定用户模式。

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

## 当前交付状态

Release A（投递、测评、面试、待办、Timeline、工作台与周日历）和 Release B（Experience、Resume 关联、FAQ Block 解析与知识库）均已实现。账号密码认证、本机真实依赖验收、生产容器、安全响应头、健康检查和结构化导出也已完成。

进入正式部署前仍需确定域名、反向代理、部署平台、数据库/对象存储托管方案，以及找回密码或邀请流程。

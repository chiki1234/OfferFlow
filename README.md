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
- FAQ 导入可选 AI 相似识别、人工分组复核与按需合并答案，累计出现次数并保留全部来源面试
- 日历时间冲突提示和通用进展 Timeline 记录
- Better Auth 账号密码登录、数据库会话、关闭公开注册、全站访问保护和退出登录
- PostgreSQL schema、MinIO 私有对象存储和十一份 migration
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
pnpm test:faq-ai # 真实 PostgreSQL：导入暂存、合并、频率、来源、幂等、隔离与冲突保护
```

## FAQ AI 配置与运行

批量导入 FAQ 时，来源面试必须明确选择且新表单默认为空，可以选择具体面试或“无来源面试”。导入按钮始终可点击，点击后统一检查来源、FAQ 内容、已勾选问题及经历绑定；缺项加粗标红并滚动聚焦到第一处，补齐后再选择是否使用 AI。答案和未绑定 FAQ 的分类仍可留空，未勾选条目不参与校验。暂无可选面试时也可明确选择“无来源面试”后导入。恢复编辑保留已有来源，无来源草稿恢复为“无来源面试”，已失效的具体面试须重新选择；历史 FAQ/出现记录不强制回填，也不改动此前已暂存批次的直接确认流程。

在服务端 `.env.local` 或部署平台环境变量中设置 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`。地址填写服务商的 API 根路径（例如 `https://api.openai.com/v1`），程序追加 `/chat/completions`；模型需支持 Chat Completions 的 JSON object 输出。密钥不发送给浏览器。`AI_TIMEOUT` 单位为秒，默认 120，允许 5～600。

默认 `AI_EXECUTOR=web`，适合本机和常驻 Node 服务：请求返回后继续分析，浏览器轮询结果。任务持久化在数据库中，刷新后可从知识库的未完成批次入口继续；确认前不会写入正式 FAQ，失败可重试或明确确认跳过 AI。复核页未提交的选择与答案编辑暂不持久化，刷新后需重新决定。

页面连接失败后最多自动重试 3 次（首次请求加 3 次重试），间隔 2.5 秒；状态查询与启动请求每次等待最多 10 秒，成功完成一轮后重置连续失败次数。达到上限即停止轮询，显示“重新分析”“跳过 AI 导入”“返回编辑”，不会一直锁住页面。手动恢复请求也有等待超时；此超时结束前端等待，不代表服务端一定没有执行，重复确认仍依靠批次幂等保护。

返回编辑立即关闭分析遮罩，原问答、绑定和来源面试保留；从知识库的未完成批次进入时也能恢复编辑。断网时不能保证后台立即停止，但后台不会自动写入正式 FAQ；重新提交编辑内容时复用原批次、更新提交标识、清空旧匹配并撤销旧执行租约，旧结果不能覆盖新内容。编辑后可重新分析或直接导入。前端连接恢复失败不代表后台已停止，因此明确选择跳过时，待分析/分析中/待复核/失败的批次均可直接确认导入，完成后旧执行不能继续写入。

若部署平台会在请求结束后冻结进程，或限制请求执行时长，请设置 `AI_EXECUTOR=worker`，并在同一版本代码、同一数据库与 AI 环境配置下常驻运行 `pnpm ai:worker`。用平台进程管理器自动重启此进程；Web 容器本身不能代替独立 worker。数据库租约避免重复执行，意外中断后可重新领取任务。按需答案生成仍是请求内操作，平台请求时限应大于 `AI_TIMEOUT`；不要使用只支持短请求的平台承载这个接口。

每批最多 100 条、输入总量最多约 100 万字符；每次“完整历史候选 + 一条新问题”的 AI 输入最多约 20 万字符，超限明确报错，不会悄悄忽略历史候选。批次内严格按导入顺序逐条串行：前一条返回并保存结果后才开始下一条，没有历史候选的条目直接记为无匹配。不比较本批问题彼此，不跨用户或经历。每条结果立即保存，失败重试或执行中断后跳过已保存结果（收到响应但尚未保存就中断的当前条仍可能重新调用）；所有条目完成后才进入人工复核。

相似识别请求使用固定的三条消息：`system` 匹配规则 → `user` 完整历史候选（按 FAQ ID 稳定排序，只含 ID/Q）→ `user` 当前唯一新问题（ID/Q）。公共候选与规则始终在前，新问题在最后，不插入批次 ID、时间戳或进度等易变字段，便于服务商复用相同前缀。仍需每次发送完整候选，不使用上次 AI 回答充当上下文，也不额外发起缓存预热请求。为兼容尚未指定的服务商，不强塞模型专属缓存参数；具体命中门槛、写入时机、保留时长和费用以所选服务为准，不保证“第三次一定命中”。[OpenAI 官方缓存说明](https://developers.openai.com/api/docs/guides/prompt-caching)

串行不等于 TPM/RPM 限流器：单次大输入、快速响应或多个用户/执行进程共享密钥仍可能触发限流。当前遇到 429 会暂停该批次并保留已完成结果，稍后人工重试；未实现跨用户的全局配额调度或自动退避。大批次总耗时可能超过 1～2 分钟和 Web 平台的单次执行上限（此接口 `maxDuration=300`），此时应使用独立 worker。状态弹窗会展示已完成条数。相似识别只发送问题及标识，按需答案合并才发送所选答案，请在上线前明确告知用户所用 AI 服务及数据处理方式。

### AI 调用日志

每次实际的相似识别、AI 合并答案调用都会生成独立的服务端 JSON 日志，默认位置为 `.runtime/logs/ai/YYYY-MM-DD/时间-操作-调用ID.json`，可通过 `AI_LOG_DIR` 修改。按请求开始日期归档，文件内时间使用 UTC ISO 格式（`Z` 表示 UTC，北京时间加 8 小时）。打开日志目录，按修改时间查看最新文件即可；本地可运行：

```powershell
Get-ChildItem .runtime/logs/ai -Recurse -Filter *.json | Sort-Object LastWriteTime -Descending | Select-Object -First 10 FullName, LastWriteTime
```

- `status`：请求发出前写入 `running`，结束后更新为 `succeeded` 或 `failed`。重试生成新文件，不覆盖历史调用。成功只表示本次接口响应及输出格式通过校验，不表示 FAQ 已导入或所有业务校验已通过。
- `startedAt`、`finishedAt`、`durationMs`：开始/结束时间与耗时（毫秒，从建立开始记录到响应处理结束，不含最终写盘）；另有调用 ID、操作类型、模型、用户/批次关联。
- `request`：完整请求地址、方法、脱敏后的应用请求头与请求体，包含原始 system/user 消息和所有模型参数；不往 AI 消息中增加日志元数据，保持原有缓存前缀与逐条串行规则。
- `response`：HTTP 状态、脱敏后的响应头和完整原始响应文本（`body`，不截断、不仅保存提取后的答案）。供应商提供的请求 ID、Token/缓存用量等原始字段随之保留，不估算费用或补造缺失用量。参见 [OpenAI 响应字段](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)和[请求排障字段](https://developers.openai.com/api/reference/overview#debugging-requests)；兼容服务商返回字段以其实际响应为准。
- `error`：HTTP 错误、网络错误、超时或响应格式错误及原因。没有收到响应时 `response=null`；接收中断保留已收到文本并标记 `bodyComplete=false`，不会伪装成完整响应。

日志属于含个人数据的管理员资料：**按需求保存完整问答正文，不是匿名日志**。认证头、Cookie 等敏感头会遮蔽，配置的 API Key 在正文或错误中被回显时也会脱敏；其他问答中的隐私信息仍完整保留。没有提供公开下载或普通用户查看接口，不随用户数据导出。默认目录已被 Git 与 Docker 构建排除；禁止配置到项目的 `public`、`.next/static` 或 `out` 公开目录。Linux 新目录/文件分别采用 `0700`/`0600` 权限；Windows 还需依靠目录 ACL 限制管理员以外的访问。

上线时将 `AI_LOG_DIR` 指向**私有、可写、持久化**的目录或挂载卷，Web 与 worker 均须配置；不要放在公开静态资源、仓库或公共日志收集渠道中。镜像预建了默认目录供非 root 运行用户写入，但容器本地文件不会跨容器替换保留；只读文件系统或临时文件系统必须另挂私有持久化存储。完整正文日志会占用磁盘，应制定访问、备份和保留期限，本次不自动删除历史记录。

日志保存失败会明确报错：开始记录失败时不调用 AI；收到响应后保存失败也会报告日志问题，此时服务商可能已经计费。若进程被强制终止，可能只留下 `running` 记录（及原子写入的 `.tmp` 文件），表示终态未知，而非仍有活跃请求。配置/输入校验失败、没有候选而跳过 AI 的条目不属于实际调用，不生成调用日志；新日志不能补回此功能启用前的请求。

迁移 `0010_faq_ai_review` 为每条历史 FAQ 回填 1 次出现，保留原来源面试，再移除旧的单来源与未使用母问题字段。历史上手动拼接在一个 Q 中的多种表述不能反推真实出现次数，因此不会按斜杠数量增加频率。完整 JSON 导出版本升级为 2，新增 `faqOccurrences`；消费导出的程序需使用出现记录读取来源。

## 项目资料

- [领域词汇](./CONTEXT.md)
- [技术方案 V1](./docs/技术方案V1.md)
- [一期验收清单](./docs/一期验收清单.md)
- [迭代记录](./docs/迭代记录.md)
- [架构决策](./docs/adr/)

## 当前交付状态

Release A（投递、测评、面试、待办、Timeline、工作台与周日历）和 Release B（Experience、Resume 关联、FAQ Block 解析与知识库）均已实现。账号密码认证、本机真实依赖验收、生产容器、安全响应头、健康检查和结构化导出也已完成。

进入正式部署前仍需确定域名、反向代理、部署平台、数据库/对象存储托管方案，以及找回密码或邀请流程。

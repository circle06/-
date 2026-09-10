# MultiProvider LLM Toolbox 最终需求基线

## 1. 文档目的

本文是阶段一形成、并在阶段二和阶段三结束后按最终实现校正的需求基线。它描述本次作业实际交付范围，不再使用已被后续需求替代的早期假设。需求与三个阶段、代码和验收证据的逐项对应关系见 `docs/traceability-matrix.md`。

## 2. 项目目标与阶段

项目交付一个本地优先的网页版多模型对话工具箱，以统一界面和 API 屏蔽不同模型服务的协议差异。

- 阶段一：明确需求、架构、UI、API、安全边界和验收标准，提交设计文档。
- 阶段二：按设计实现可运行代码，以 Git 管理版本并由 CI 验证，提交 Git 仓库和面向用户的使用手册。
- 阶段三：完成回归测试、API 安全测试和依赖漏洞修复，构建并导出 Linux/amd64 镜像，提交测试记录、测试报告和面向运维的部署手册。

OpenAI、Anthropic 是核心 Provider；DeepSeek、GLM 是必须实现的扩展 Provider。四者均须具备服务端模型目录、Adapter、Mock 行为和自动化契约测试。真实 API 验收受账号和网络条件约束，最终完成 DeepSeek 受控 Live 烟囱测试，其余 Provider 通过 mock fetch 验证。

## 3. 用户角色

### 3.1 普通使用者

- 在一个响应式网页中选择 Provider 和模型并进行文本对话。
- 使用流式输出、停止、重试、参数设置、提示词和本地文档。
- 管理浏览器本地会话，并复制或导出回答。
- 看到不泄露密钥和内部配置的运行状态与错误提示。

### 3.2 运维与部署人员

- 以 Mock 或 Live 模式运行应用。
- 通过服务端环境变量或只读密钥文件注入 API Key。
- 构建、导入、启动、检查、升级和回滚 amd64 Docker 镜像。
- 使用健康检查、容器状态和脱敏错误进行排障。

### 3.3 开发与测试人员

- 通过统一 `LLMProvider` 接口维护 Provider Adapter。
- 运行 lint、类型检查、自动化测试、构建和依赖审计。
- 使用 Git 分支、独立提交、阶段标签和 GitHub Actions CI 管理交付。

## 4. 功能需求

### R-F01 网页聊天工作区

- 提供消息列表、输入区、发送、停止和失败重试。
- 网页固定显示运行模式和 Provider 配置状态；Provider 与模型选择位于输入区。
- Enter 发送，Shift + Enter 换行；生成期间禁止重复发送。
- 页面在桌面视口内使用固定工作区布局；移动端允许页面滚动并保持输入区可用。
- 不提供浏览器 API Key 或 `baseUrl` 输入框。

### R-F02 Provider 与模型

- 支持 OpenAI、Anthropic、DeepSeek、GLM。
- OpenAI、DeepSeek、GLM 使用 `OpenAICompatibleAdapter`；Anthropic 使用独立 `AnthropicAdapter`。
- 模型目录由服务端静态配置并通过 `GET /api/providers` 返回；是否有权调用最终由上游账号决定。
- 最终目录包含 GPT-6 Astra、GPT-5.6/5 系列，Claude 4.5/4.1/4/3.5 系列，DeepSeek V4/Chat/Reasoner，以及 GLM-5/4 Flash 系列。
- 客户端只能选择目录中的 Provider 和模型，不能覆盖上游地址。

### R-F03 对话协议

- `POST /api/chat` 同时支持 `stream=false` 的统一 JSON 和 `stream=true` 的 SSE。
- 网页固定使用 SSE，并解析 `message_start`、`message_delta`、`message_end`、`error`。
- 服务端生成 `requestId`，执行超时和客户端取消传播，并归一化上游错误。
- 支持 `temperature`（0 到 2）和 `max_tokens`（整数 1 到 8192）。

### R-F04 会话与提示词

- 最多保存 5 个本地会话，支持新建、切换、删除和刷新恢复。
- 会话消息、Provider、模型和更新时间只保存到当前浏览器 localStorage。
- `GET /api/prompts` 返回 3 个服务端内置只读提示词。
- 本地自定义提示词支持保存、更新、插入和删除；只保存在当前浏览器。
- 提示词选择只插入输入框，不自动发送。

### R-F05 内容展示与导出

- Assistant 回答使用受控 React 元素渲染基础 Markdown，不执行原始 HTML 或脚本。
- 支持标题、列表、粗体、行内代码、代码块和基础表格。
- 支持复制 Assistant 回复和将当前会话导出为 Markdown。

### R-F06 本地文档

- 用户可主动选择 TXT、Markdown、JSON 文档作为当前问题的参考资料。
- 最多同时选择 3 个文件，每个文件不超过 100 KB；空文件、非法 JSON 和其他扩展名必须拒绝。
- 文档正文只存在于当前页面内存，并随本次聊天消息发送；会话只保存附件名称和类型。
- Live 模式下文档内容会发送至所选上游，因此不得导入密钥、隐私或未经授权的数据。

### R-F07 运行模式和密钥

- `LLM_MODE=mock` 为默认模式，不访问真实上游。
- `LLM_MODE=live` 使用对应 Adapter 和服务端密钥。
- 密钥支持 `*_API_KEY` 环境变量和 `*_API_KEY_FILE` 只读文件两种来源。
- Windows Docker 本地测试提供通用 `run-live.ps1`，按 Provider 安全提示输入密钥、只读挂载临时密钥文件并在停止时清理。

### R-F08 交付与质量

- Git 仓库保存完整源代码和文档，GitHub Actions 在 `main`、`phase/**` 和面向 `main` 的 PR 上运行检查。
- CI 执行 `npm ci`、lint、TypeScript、80 项 Vitest 测试和 Next.js 构建。
- 提供非 root、Next.js standalone、多阶段构建的 Linux/amd64 Docker 镜像。
- 交付镜像 `.tar`、SHA-256 校验文件、用户手册、测试记录、测试报告和部署手册。

## 5. API 与数据限制

- 实际路由：`GET /api/healthz`、`GET /api/providers`、`GET /api/prompts`、`POST /api/chat`。
- Chat 请求体最大 512 KiB；消息 1 到 50 条；单条内容最大 320 KiB；总内容最大 384 KiB。
- Chat 请求只允许 `provider`、`model`、`messages`、`stream`、`temperature`、`max_tokens`；消息只允许 `role` 和 `content`。
- 消息角色只允许 `system`、`user`、`assistant`。
- 模型标识最大 256 字符且必须存在于对应 Provider 目录。
- 服务端不保存聊天、文档或自定义提示词。

## 6. 安全和非功能需求

### 已实现控制

- API Key 不进入浏览器、URL、Git、镜像默认配置或 API 响应。
- 客户端敏感字段和任意 `baseUrl` 因严格字段校验被拒绝。
- 上游初始地址来自代码内固定 HTTPS 白名单。
- API 默认不返回跨域许可头。
- 错误响应不透传上游正文、密钥、Authorization 或堆栈。
- 请求长度、角色、Provider、模型、生成参数、超时和取消均有服务端验证。
- Docker 默认以 `nextjs` 非 root 用户运行；`.dockerignore` 排除 Git、环境文件、依赖和构建缓存。
- npm 已知漏洞在最终审计时为 0；这不等于未来或镜像系统层永久无漏洞。

### 部署侧要求和已知边界

- 当前定位为本机或受控内网工具，不可未经额外保护直接暴露公网。
- `ACCESS_CODE` 当前只保护 `/api/providers` 和 `/api/prompts`，不能视为完整应用认证；`/api/chat` 需要可信反向代理或网关保护。
- 应在部署层补充 HTTPS、身份认证、限流、CSP/安全头、资源限制和 Provider 出口 ACL。
- 当前未实现 DNS 重绑定/IP 复核、重定向链白名单、结构化审计日志、应用级并发限流或自定义跨域来源开放。
- SBOM、镜像签名、压力测试、密钥轮换演练和生产镜像持续扫描属于增强项。

## 7. 不做范围

- 用户注册、登录、多租户、计费和企业权限系统。
- 云端聊天同步、服务端数据库和跨设备备份。
- MCP、插件市场、复杂 Agent 编排。
- 图片、语音、PDF/Office 文件解析和向量知识库。
- 浏览器配置密钥或任意自定义 API URL。
- 宣称所有模型标识均已由真实账号验证；目录项仍受上游发布状态与账号权限影响。

## 8. 最终验收基线

- 自动化：lint、typecheck、16 个测试文件/80 项测试、Next.js build 和 `npm audit` 通过。
- Live：DeepSeek 完成受控鉴权和聊天烟囱测试；其余 Provider 使用 mock fetch 契约测试。
- 容器：镜像 `linux/amd64`、默认用户 `nextjs`，healthz、首页、Provider 目录和 Mock chat 均为 HTTP 200。
- 交付：镜像 ID、导出文件、大小和 SHA-256 记录在 `docs/test-records.md`。

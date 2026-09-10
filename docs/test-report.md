# 阶段三测试报告

## 1. 测试结论

阶段三当前代码通过代码质量、类型检查、80 个自动化测试、Next.js 生产构建和 npm 依赖审计。Mock 页面功能已完成浏览器验收；DeepSeek 已使用用户自有密钥完成受控 Live 烟囱测试，密钥未写入代码、Git 或测试记录。最终 Linux/amd64 镜像已基于 Commit `32ad2a5` 构建并以非 root 用户 `nextjs` 完成运行验证，健康检查、首页、Provider 目录和 Mock 聊天 API 均返回 HTTP 200。

本版本满足本阶段已实现范围的交付条件，可用于本地或受控内网部署验证。对公网或其他 Provider 的 live 模式投产结论仍为“有条件通过”：必须完成对应 Provider 烟囱测试、部署层 HTTPS/访问控制/网络出口限制，并复核剩余安全风险。

## 2. 测试范围与结果

| 范围 | 结果 | 主要证据 |
|---|---|---|
| 静态质量 | 通过 | ESLint、TypeScript 均以退出码 0 完成 |
| 自动化测试 | 通过 | 16 个测试文件、80 个测试全部通过 |
| 页面与本地功能 | 通过 | 页面逻辑、本地会话、提示词、参数、安全 Markdown、本地文档和导出测试；浏览器手工验收通过 |
| API 与 SSE | 通过 | providers、prompts、chat、healthz；非流式与流式正常/错误/超时/取消测试 |
| Provider 层 | 通过 | 四 Provider 元数据、Registry、Factory、Mock Provider、兼容 Adapter 与 Anthropic Adapter 契约测试 |
| 安全边界 | 通过 | 敏感字段拒绝、日志/响应不泄密、白名单、输入限制、默认同源 CORS、timeout/AbortSignal |
| 生产构建 | 通过 | Next.js 16.3.4 build 成功并生成 standalone 输出 |
| npm 依赖审计 | 通过 | 漏洞总数由 13 项降至 0 项 |
| amd64 容器 | 通过 | 最终镜像为 `linux/amd64`，以 `nextjs` 运行；healthz、首页、Provider 目录和 Mock 聊天 API 均为 HTTP 200 |
| 真实 Provider API | 部分通过 | DeepSeek 完成真实鉴权、非流式和页面流式烟囱测试；OpenAI、Anthropic、GLM 未使用真实账户测试 |

详细命令和实际结果见 `docs/test-records.md`。

## 3. 安全漏洞修复情况

阶段三依赖治理前，`npm audit` 基线共报告 13 项漏洞。首次升级后降至 0；2026-09-10 审计源新增 Vitest `@vitest/mocker` 路径穿越公告并报告 2 项 Moderate，项目随后将 Vitest 3.2.6 升级到 5.0.0，再次完成完整回归，当前 `npm audit` 结果为 0 项漏洞。

安全回归同时验证：

- 客户端不能通过请求覆盖 API Key 或 `baseUrl`，敏感输入不会被错误响应回显；
- 服务端 API Key 不出现在响应或 console 日志；
- 未批准的 Provider、模型、消息长度、消息数量、`temperature` 和 `max_tokens` 会被拒绝；
- API 默认不返回跨域允许头；
- 超时会触发 AbortSignal 并返回统一安全错误；客户端已取消的请求不会继续调用 Provider；
- OpenAI、DeepSeek、GLM 使用固定白名单地址的兼容 Adapter，Anthropic 使用独立 Adapter；测试不访问真实上游。

0 项 npm 漏洞表示审计数据库当前没有匹配到已知问题，不代表业务逻辑、基础镜像、操作系统或未来新增依赖永久无漏洞。上线前后仍需持续审计和镜像扫描。

## 4. Docker 交付结果

- 镜像标签：`multi-provider-llm-toolbox:phase3`
- 镜像 ID：`sha256:44d6d7b920333166facc502289f8c594eeafcd50b04b0c6054b606c2b347cac0`
- 构建 Commit：`32ad2a5`
- 平台：`linux/amd64`
- 运行用户：`nextjs`（非 root）
- 默认模式：`LLM_MODE=mock`
- `GET /api/healthz`：HTTP 200
- `GET /`：HTTP 200
- `GET /api/providers`：HTTP 200
- `POST /api/chat`（Mock）：HTTP 200
- 导出文件：`multi-provider-llm-toolbox-stage3-amd64.tar`，92,624,384 bytes（88.33 MiB）
- SHA-256：`b41c4a83f29a619862033f47f8ad840c91f5aae4fc58fddbbe64ec2166761d48`

镜像采用依赖、构建、运行三阶段构建。`.dockerignore` 排除了环境变量文件、Git 数据、宿主机依赖、构建输出和测试缓存。`ACCESS_CODE` 以及四个 Provider API Key 没有写入 Dockerfile 或镜像默认环境，只允许在启动容器时注入。最终镜像已经导出为 `.tar` 并提供独立 SHA-256 校验文件。

## 5. 剩余风险与边界

1. 真实 Provider 边界：DeepSeek 已完成受控烟囱测试，但 OpenAI、Anthropic、GLM 尚未使用真实账户验证鉴权、模型可用性、限额、实际 SSE 差异和上游错误文案变化；启用对应 Provider 前必须执行受控烟囱测试。
2. SSRF 深度验证：当前测试证明客户端任意 `baseUrl` 被拒绝且 Adapter 使用固定 HTTPS 白名单；重定向链、DNS 重绑定、解析后 IP 复核和容器出口 ACL 仍需集成或部署层测试。
3. 公开访问：`ACCESS_CODE` 当前只覆盖 providers/prompts，不覆盖 chat，也不替代身份认证、租户隔离或权限系统；公开部署需要可信网关统一保护全部路由，并提供 HTTPS、限流和日志保护。
4. 容量与可用性：尚未执行压力、并发长连接、资源耗尽和长时间稳定性测试，应在确定目标容量后补充。
5. 供应链增强：SBOM、镜像签名、构建证明、基础镜像持续扫描和密钥轮换演练属于增强项，当前未完成。
6. 浏览器数据：聊天会话和自定义提示词只保存在当前浏览器 localStorage，不具备云端备份、跨设备同步或企业数据治理能力。

## 6. 验收判断

依据 `docs/acceptance-criteria.md`：

- 阶段三必做项中，功能回归、安全字段与参数边界、日志脱敏、默认同源 CORS、timeout/AbortSignal、非 root Docker、Linux/amd64 构建及 healthz 验证已有可观察证据；
- 四个 Provider 均具备实现、元数据和 mock 契约覆盖，OpenAI、Anthropic 为核心 Provider，DeepSeek、GLM 为必须实现的扩展 Provider；
- DeepSeek 已完成最小真实 API 验收，但不能据此宣称其他 Provider 的 live 环境已完全验收；
- SSRF 的重定向/DNS/网络出口、并发限流和生产资源策略仍需部署环境补充验证。

综合结论：阶段三代码、文档和 amd64 镜像交付在 mock、本地和受控内网范围内满足验收。其他 Provider 的 live 或公开生产部署为有条件通过，完成上述上线前检查后方可批准。

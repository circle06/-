# MultiProvider LLM Toolbox 安全设计

## 1. API Key 生命周期

密钥由部署系统注入服务端环境变量（例如 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`DEEPSEEK_API_KEY`、`GLM_API_KEY`）。应用启动时读取并校验存在性，仅保存在进程内受控配置对象中；不写入数据库、浏览器、配置导出或响应。轮换通过替换部署密钥并重启/热加载完成，旧值不得出现在日志和崩溃转储中。

## 2. 访问控制与部署模式

- 默认部署模式为本地使用：服务绑定本机或受控内网接口，不实现用户注册、登录、多租户或企业权限。
- 若需要公开部署，必须在服务端设置 `ACCESS_CODE`，客户端通过 `X-Access-Code` 提交；访问码只在内存中校验，不进入 URL、日志、浏览器持久化存储或错误响应。
- 访问码是轻量门禁，不替代完整身份认证、会话管理或租户隔离；公开部署仍需 HTTPS、反向代理和限流。`X-Access-Code` 不得进入 URL、日志、浏览器持久化存储、异常、镜像和响应体。

## 3. 日志脱敏

- 禁止记录 Authorization、API Key、完整请求头、上游原始响应和用户完整消息。
- 对疑似密钥模式执行结构化脱敏（保留类型和长度，不保留可还原片段）。
- 日志只记录 `requestId`、Provider、模型、状态类别、耗时、字数和错误码。
- 测试快照、异常对象、Tracing attributes 和 Git hooks 同样执行脱敏。

## 4. Provider 白名单与 SSRF 防护

- Provider 地址在服务端配置文件/环境变量中按 Provider 固定声明，例如 OpenAI `https://api.openai.com/v1`、Anthropic `https://api.anthropic.com`、DeepSeek `https://api.deepseek.com/v1`、GLM `https://open.bigmodel.cn/api/paas/v4`；实际模型名称可配置。
- 请求只携带 ProviderId 和模型Id；服务端从 Registry 解析地址。
- 拒绝客户端 `baseUrl`、重定向到非白名单主机、内网 IP、环回地址、链路本地地址和非 HTTPS 生产地址。
- HTTP 客户端禁用或严格限制自动重定向，并在连接后再次校验解析出的 IP。

## 5. 输入校验

- 使用严格 JSON schema，拒绝未知字段、NaN、过深嵌套和超大字符串。
- 校验消息角色、顺序、数量、总长度及 `max_tokens`/`temperature` 范围。
- Provider 与模型必须来自服务端目录；提示词 id 使用不透明标识符并校验归属。
- 输出流增量必须限制大小和事件类型，避免上游恶意数据导致内存增长。

## 6. CORS 与浏览器边界

- 默认同源；跨域仅允许显式配置的来源列表，不使用 `*` 搭配凭据。
- 生产启用 HTTPS、`Content-Security-Policy`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer` 等安全头。
- 前端 localStorage/sessionStorage 不保存 API Key、Authorization 或访问码；仅保存最多 5 个本地会话和用户自定义提示词等非密钥数据。

## 7. 超时、取消与资源控制

- 分离 DNS/连接、TLS、首字节、读取和总超时；建议总超时 60 秒，流式空闲超时 30 秒（具体值可配置）。每次 Provider 调用必须接收 `requestId`、`AbortSignal` 和 timeout；客户端断开、主动停止或超时均取消上游。
- 浏览器断开连接时取消上游请求；限制并发请求数和单请求缓冲。
- 上游 4xx/5xx 映射为固定错误码，禁止直接透传原文。

## 8. 限流与滥用控制

- 按来源 IP、会话（未来）和 Provider 维度进行令牌桶或滑动窗口限流。
- 对请求体大小、消息长度、`max_tokens`、并发数和每日配额预留配置项。
- 限流响应返回 `Retry-After`（若适用）和不含敏感信息的错误体。

## 9. Docker 运行安全

- 使用最小运行时镜像、固定依赖版本和非 root 用户。
- 只读根文件系统，使用临时目录承载必要缓存；删除 shell、包管理器和调试工具（若运行时允许）。
- 通过编排器 Secret/环境变量注入密钥，不在 Dockerfile、镜像层或 compose 文件提交真实值。
- 限制 CPU、内存、进程数和网络出口；生产仅暴露必要端口。
- 阶段三增加镜像漏洞扫描、SBOM、签名和 amd64 构建验证。

## 10. 威胁模型

| 资产/边界 | 威胁 | 防护与验证 |
|---|---|---|
| API Key | 浏览器、日志、错误或镜像泄露 | 仅服务端环境变量；脱敏测试；镜像与 Git 扫描 |
| 上游网络 | 任意 URL/重定向导致 SSRF | Provider 白名单、禁止 `baseUrl`、解析后 IP 校验、禁用开放重定向 |
| 聊天输入 | 超大请求、非法角色、提示词注入和 SSE 注入 | JSON schema、长度/角色/事件限制、输出编码和限流 |
| 服务可用性 | 慢上游、长连接、并发耗尽 | 分层 timeout、AbortSignal、并发/速率限制、资源上限 |
| 浏览器会话 | XSS、宽松 CORS、访问码窃取 | CSP、显式来源白名单、同源默认、访问码不持久化 |
| 容器主机 | root 越权、镜像漏洞、密钥落盘 | 非 root、只读根、最小镜像、网络/资源限制；扫描列为增强项 |

## 11. 安全事件处理

- 每个请求具备 requestId，便于在脱敏日志中追踪。
- 发现密钥泄露迹象时立即吊销/轮换对应上游密钥，保留最小必要审计信息。
- 安全测试覆盖 SSRF、日志泄露、CORS、SSE 注入、资源耗尽和错误信息披露。


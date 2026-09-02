# MultiProvider LLM Toolbox 验收标准

所有条目都必须可通过自动化测试、人工操作、日志/配置观察或构建产物检查验证。OpenAI、Anthropic 是核心必需 Provider；DeepSeek、GLM 是必须实现的扩展 Provider，不得按“可选功能”处理。

## 阶段一：设计验收

1. requirements.md 明确项目目标、用户角色、功能范围、四个 Provider、非功能需求、安全需求、约束和假设。
2. architecture.md 包含四层架构、模块边界、数据流、错误流、地址白名单、模型配置和带 requestId、AbortSignal、timeout 的 Provider 接口。
3. ui-design.md 明确页面结构、本地会话、页面状态、停止与重试、Markdown 和密钥边界。
4. api-contract.md 覆盖 healthz、providers、chat、内置提示词 List、错误码、SSE 事件和参数限制。
5. security-design.md 包含 API Key、访问控制、日志脱敏、SSRF、CORS、限流、超时、浏览器存储、Docker 安全和威胁模型。
6. README.md 说明项目目标、技术路线、安全边界、阶段状态和后续交付计划。
## 阶段二：最小可用实现验收

1. 启动后 `GET /healthz` 返回 200 和 `status=ok`。
2. `GET /api/providers` 只返回服务端启用且白名单内的四个 Provider/模型，不返回地址、密钥或访问码。
3. OpenAI 非流式和流式调用均通过 mock 上游契约测试；真实 API 条件具备时再增加真实烟囱测试。
4. Anthropic 非流式和流式调用均通过 mock 上游契约测试，并完成原生事件到统一事件的映射。
5. DeepSeek 必须实现 `OpenAICompatibleAdapter`（或经 ADR 说明的专用适配器），并通过至少一条非流式、一条流式 mock 契约测试。
6. GLM 必须实现兼容适配器；若鉴权、请求字段、响应结构或流式事件无法稳定映射，则实现 `GLMAdapter`，并通过非流式/流式 mock 契约测试。
7. 四个 Provider 均覆盖 requestId、AbortSignal、timeout、客户端取消、上游超时、401/429/5xx 和统一错误映射。
8. 任意客户端提交 `baseUrl`、未知 Provider/模型、非法角色或超限请求都会被拒绝。
9. 内置提示词 List 可观察；浏览器端自定义提示词可创建、编辑、删除，并执行长度和数量限制；API Key/ACCESS_CODE 不得进入本地存储。
10. 默认本地部署可用；公开部署未配置 `ACCESS_CODE` 时启动或请求被拒绝，配置后错误访问码返回统一未授权错误。
11. 自动化测试覆盖领域校验、Registry、四个 Adapter、错误归一化和 SSE 解析；CI 在干净环境通过。
12. 代码审查确认真实 API Key/ACCESS_CODE 未出现在前端构建产物、日志、异常、响应、URL、测试快照和 Git。

## 阶段三：生产与安全增强验收

### 必做项

1. 四个 Provider 的功能测试（非流式、流式、取消、超时和主要 4xx/5xx）在 CI 中通过；真实 API 不可用时使用 mock，不降低覆盖要求。
2. 安全测试验证日志脱敏：API Key、Authorization、ACCESS_CODE、完整用户消息和上游原文不出现在日志、异常、响应或快照。
3. 安全测试验证 SSRF 防护：任意 `baseUrl`、非白名单主机、重定向、内网/环回/链路本地地址均被拒绝。
4. 安全测试验证 CORS：默认同源；公开跨域仅允许显式来源，禁止任意来源通配。
5. Docker 镜像以非 root、最小权限、只读根文件系统（可行时）运行，并通过健康检查。
6. amd64 镜像可构建、启动并完成 `/healthz`、四 Provider mock 契约测试和安全配置检查。
7. 限制请求长度、消息角色、`max_tokens`、并发、超时和流式事件；客户端断开会取消上游。

### 增强项

1. SBOM、镜像签名、可追溯构建证明和漏洞扫描报告归档。
2. 压力测试覆盖限流、长连接、并发、内存和 CPU 资源曲线。
3. 密钥轮换演练与自动化检测，证明旧密钥不再使用且无残留。
4. 更细粒度的指标、告警、审计留存和多区域容灾。


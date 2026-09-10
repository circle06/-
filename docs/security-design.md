# MultiProvider LLM Toolbox 最终安全设计与边界

## 1. 安全定位

当前交付定位为本机或受控内网工具，不是完整公网 SaaS。本文区分“应用已经实现的控制”和“必须由部署环境补充的控制”，避免把设计建议误写为现有能力。

## 2. 密钥生命周期

已实现：

- Live Adapter 从 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`DEEPSEEK_API_KEY`、`GLM_API_KEY` 读取密钥。
- 每个 Provider 也支持对应 `*_API_KEY_FILE`，读取只读密钥文件。
- 浏览器没有密钥输入框，Provider API 只返回 `configured: boolean`。
- `.dockerignore` 排除 `.env` 与 `.env.*`，Dockerfile 不包含真实密钥。
- 统一错误不返回密钥、环境变量名、Authorization 或上游原始正文。
- `run-live.ps1` 使用 SecureString 读取密钥，在系统临时目录创建受限文件，只读挂载到容器，并在停止时删除。

运行时环境变量仍可通过容器检查权限看到其存在，因此生产环境优先使用平台 Secret 或 `*_API_KEY_FILE`。密钥轮换由部署系统替换并重启容器；项目没有密钥管理后台。

## 3. Provider 地址与 SSRF

已实现：

- 四个 Provider 的初始 HTTPS 地址固定在 `src/providers/config.ts`。
- Chat 请求严格拒绝未知顶层字段，因此客户端提交 `baseUrl`、API Key 或 Authorization 会返回 400。
- Provider 与模型必须存在于 Registry 的服务端目录。

未实现：

- fetch 重定向链白名单校验。
- DNS 解析后的私网、环回、链路本地 IP 复核和 DNS 重绑定防护。
- 容器层 Provider 出口 ACL。

因此固定初始 URL 降低了任意代理风险，但不是完整 SSRF 纵深防护。受控或生产部署必须限制容器网络出口，仅允许批准的 Provider HTTPS 主机，并由代理层限制重定向。

## 4. 输入与资源边界

Chat Handler 已实现：

- 允许字段列表和消息对象字段列表。
- Provider、模型、角色、消息数量、内容长度和总长度校验。
- 5 MiB 请求体、50 条消息、单条 3 MiB、总内容 4 MiB。
- temperature 0 到 2；max_tokens 1 到 32768 的整数；请求消息单条最大 3 MB、总正文最大 4 MB、JSON 请求体最大 5 MB。
- 服务端 UUID requestId、180 秒总超时和 AbortSignal 客户端取消传播。
- 上游错误归一化；不返回上游原始响应或堆栈。

本地文档在浏览器限制为 3 个、每个 1 MB，仅允许 TXT/MD/JSON。该限制是用户体验和基础资源控制，不是内容安全扫描；文档中的不可信指令仍可能形成提示词注入。

当前没有应用级请求频率、并发或每日配额限制。对公网或共享环境必须在反向代理/API 网关实施限流和请求体上限。

## 5. 浏览器、CORS 与访问控制

- API 默认不返回跨域许可头，因此浏览器按同源策略访问。
- 当前没有读取 `ALLOWED_ORIGINS` 来开放自定义跨域来源。
- `ACCESS_CODE` 只在 `/api/providers` 和 `/api/prompts` 中检查。
- `/api/chat` 未检查 ACCESS_CODE，网页也没有访问码输入/转发功能。

结论：ACCESS_CODE 只是部分元数据路由边界，不能作为完整认证。公开部署必须用可信反向代理或 API 网关统一保护首页和全部 `/api/*` 路由，并配置 HTTPS、身份认证、限流和 CSRF/来源策略。

当前 Next.js 配置没有自定义 CSP、HSTS、Referrer-Policy 或 Permissions-Policy。需要时由反向代理统一设置，并在目标环境验证不会破坏 SSE。

## 6. 浏览器存储和输出

- localStorage 仅保存最多 5 个会话、自定义提示词、Provider/模型和附件名称/类型。
- API Key、ACCESS_CODE、Provider 地址和文档正文不写入 localStorage。
- 本地文档正文发送后从页面状态移除，但已发送到 Live Provider 的内容受相应上游数据政策约束。
- Assistant Markdown 通过受控 React 元素生成，不使用 `dangerouslySetInnerHTML`；原始 HTML 和事件属性作为文本展示。
- 会话导出包含消息、Provider、模型、时间和附件名称，不包含密钥或文档原始正文。

## 7. 日志与错误

应用没有实现结构化审计日志或消息日志。当前代码不主动记录 API Key、完整请求头、用户消息或上游正文；自动化测试验证 Provider 异常中的测试密钥不会进入 console 和响应。

Chat 错误返回固定 code、安全 message 和 requestId。providers/prompts 的 401 响应不包含 requestId。运维排障应只记录 requestId、Provider、模型、状态和耗时，不复制密钥、完整请求或原始上游响应。

## 8. Docker 与供应链

已实现：

- Node.js 24 bookworm-slim 多阶段构建和 Next.js standalone。
- 运行用户 `nextjs`，UID/GID 1001，默认非 root。
- 镜像默认 `LLM_MODE=mock`，只暴露 3000。
- Git、环境文件、宿主机依赖、构建产物、日志和测试缓存不进入构建上下文。
- npm 依赖审计最终为 0 个已知漏洞；CI 执行安装、lint、typecheck、测试和 build。
- 最终镜像导出为 Linux/amd64 `.tar` 并提供 SHA-256。

未实现或未归档：基础镜像 CVE 扫描、SBOM、镜像签名、构建证明。容器默认根文件系统不是只读，运行镜像仍基于 Node slim；部署指南提供只读根文件系统、tmpfs 和资源限制示例。

## 9. 威胁与责任矩阵

| 风险 | 当前控制 | 仍需补充 |
|---|---|---|
| 密钥泄露 | 服务端 env/file、字段拒绝、错误脱敏、Docker 排除 | 平台 Secret、轮换和访问审计 |
| 任意上游/SSRF | 固定初始 URL、客户端无 baseUrl | 重定向/DNS/IP 检查和出口 ACL |
| XSS | 受控 Markdown React 渲染 | 部署 CSP 和持续前端审计 |
| 超大请求/慢上游 | 字段与长度限制、180 秒超时、取消 | 网关体积、并发和速率限制 |
| 未授权访问 | 默认本地部署、同源浏览器边界 | 网关统一认证；不能只依赖 ACCESS_CODE |
| 容器越权 | 非 root 用户、最小 standalone 文件 | read-only、资源限制、镜像扫描和签名 |
| 提示词注入/数据外发 | 文档类型/大小限制和 UI 提示 | 用户数据分级、内容审查和 Provider 合规策略 |

## 10. 安全验收证据

- `app/api/security.test.ts`：敏感字段拒绝、密钥不进入响应/console、Provider/模型/长度/参数边界、默认 CORS、超时和取消。
- `src/providers/adapters/adapters.test.ts`：鉴权、4xx/5xx、SSE、timeout、AbortSignal 和缺失密钥。
- `src/ui/safe-markdown.test.ts`：脚本、HTML 和事件属性不执行。
- `src/ui/local-documents.test.ts`：格式、JSON、1 MB 和 3 文件限制。
- `docs/test-records.md`：依赖审计、Docker、HTTP、镜像导出和校验记录。

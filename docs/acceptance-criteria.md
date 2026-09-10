# MultiProvider LLM Toolbox 最终验收标准

本文件将阶段一制定的标准按最终代码和交付事实校正。状态分为“通过”“部分通过”和“增强项”，不得用设计建议代替实现证据。

## 阶段一：设计文档

| 验收项 | 状态 | 证据 |
|---|---|---|
| 最终需求、角色、范围、安全边界与三阶段交付清楚 | 通过 | `requirements.md` |
| UI、API、Provider 和数据流与最终实现一致 | 通过 | `architecture.md`、`ui-design.md`、`api-contract.md` |
| 已实现控制与部署侧控制明确分开 | 通过 | `security-design.md` |
| 每项用户需求可追溯到阶段、实现和证据 | 通过 | `traceability-matrix.md` |
| README 提供文档入口和最终状态 | 通过 | `README.md` |

## 阶段二：可运行产品

| 验收项 | 状态 | 证据 |
|---|---|---|
| `/api/healthz`、providers、prompts 和 chat 路由可用 | 通过 | Route tests、production build、Docker HTTP 200 |
| OpenAI、Anthropic、DeepSeek、GLM 均有模型目录和 Adapter | 通过 | Registry/Factory/Adapter tests |
| 非流式 JSON 和 SSE `message_*`/error 契约 | 通过 | `app/api/chat/route.test.ts`、`app/page.test.ts` |
| Provider、模型、字段、角色、长度和参数校验 | 通过 | request-validation/security tests |
| 60 秒超时、AbortSignal、取消和安全错误映射 | 通过 | Mock、Adapter、route 和 security tests |
| 响应式聊天 UI、停止、重试和状态提示 | 通过 | 页面实现与人工验收 |
| 5 个本地会话和本地自定义提示词 | 通过 | local-data tests 与人工验收 |
| 3 个服务端内置只读提示词 | 通过 | prompts route tests |
| 安全 Markdown、复制和会话 Markdown 导出 | 通过 | Markdown/export tests 与人工验收 |
| TXT/MD/JSON 文档，3 个/100 KB/JSON 校验 | 通过 | local-documents tests 与人工验收 |
| Git 提交、阶段分支、标签和 CI | 通过 | Git 历史、`.github/workflows/ci.yml`、GitHub CI |
| 面向用户的使用手册 | 通过 | `user-guide.md` |

## 阶段三：测试、安全与容器交付

| 验收项 | 状态 | 证据 |
|---|---|---|
| lint、typecheck、80 项测试和 build | 通过 | `test-records.md`、CI |
| npm 已知依赖漏洞修复到 0 | 通过 | `npm audit` 记录；Vitest 新公告已二次修复 |
| 密钥/客户端 baseUrl 拒绝和响应/console 脱敏 | 通过 | `app/api/security.test.ts` |
| 默认不返回跨域许可头 | 通过 | API security tests |
| 固定 Provider 初始 HTTPS 地址 | 通过 | `src/providers/config.ts` |
| 完整 SSRF 重定向、DNS/IP 纵深防护 | 增强项 | 当前未实现；部署需限制出口 |
| 应用级速率/并发限制 | 增强项 | 当前未实现；部署需使用网关 |
| 完整公网身份认证 | 增强项 | ACCESS_CODE 仅覆盖 providers/prompts，不能保护 chat |
| DeepSeek 真实 Live 烟囱测试 | 通过 | 用户受控鉴权、非流式和页面流式测试 |
| OpenAI、Anthropic、GLM 真实账户测试 | 部分通过 | Adapter mock fetch 契约通过，未使用真实账户 |
| Linux/amd64、非 root、standalone 镜像 | 通过 | 镜像 inspect 和 test records |
| 最终容器 healthz、首页、Provider 和 Mock chat HTTP 200 | 通过 | `test-records.md` |
| `.tar` 镜像和 SHA-256 校验文件 | 通过 | 阶段三交付目录 |
| 测试记录、测试报告和运维部署手册 | 通过 | `test-records.md`、`test-report.md`、`deployment-guide.md` |
| SBOM、镜像签名、压力测试、轮换演练 | 增强项 | 未纳入本次作业范围 |

## 总体验收

阶段一设计、阶段二代码/Git/CI/用户手册、阶段三测试/漏洞修复/amd64 镜像/运维手册均已交付。当前版本适合本机或受控内网验收。公网部署或启用未真实验证的 Provider 前，必须完成表中增强项和对应 Provider 的最小 Live 测试。

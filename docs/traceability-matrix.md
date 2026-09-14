# 三阶段需求与交付追踪矩阵

## 1. 三个阶段与作业要求

| 阶段 | 用户提出的核心要求 | 最终完成内容 | 主要提交物 | 状态 |
|---|---|---|---|---|
| 阶段一：设计 | 明确架构、接口与验收标准；先制作需求 | 最终需求基线、总体架构、UI、API 契约、安全边界、验收标准 | `requirements.md`、`architecture.md`、`ui-design.md`、`api-contract.md`、`security-design.md`、`acceptance-criteria.md` | 完成，并按最终实现校正 |
| 阶段二：实现 | 按设计完成可运行代码；提交 Git 仓库和用户手册 | 四 Provider、Mock/Live、JSON/SSE Chat API、响应式 UI、本地数据、提示词、Markdown、本地文档、复制/导出 | Git 仓库、CI、`user-guide.md` | 完成 |
| 阶段三：交付 | 完成测试与漏洞修复；制作 amd64 镜像；提交测试记录、报告和部署手册 | 82 项测试、依赖审计 0、DeepSeek Live 烟囱测试、非 root amd64 镜像、镜像 tar/校验、运维流程 | `test-records.md`、`test-report.md`、`deployment-guide.md`、镜像 `.tar`/SHA-256 | 完成 |

## 2. 用户需求逐项对应

| ID | 用户提出或确认的需求 | 落地阶段 | 最终实现 | 代码/交付证据 | 状态与边界 |
|---|---|---|---|---|---|
| U-01 | 先明确需求、架构、接口和验收标准 | 一 | 六份设计文档形成统一基线 | `docs/requirements.md` 等 | 完成；本轮已按最终代码反向校正 |
| U-02 | 使用 Git 管理，每批独立提交并保留阶段版本 | 二、三 | `phase/2-mvp`、`phase/3-release`、main 合并和阶段标签 | Git log；`stage-1-approved`、`stage-2-complete`、`stage-3-complete` | 完成 |
| U-03 | 使用 CI 体现工程方法 | 二、三 | GitHub Actions 在 main、phase 分支和 PR 执行安装、lint、类型、测试、build | `.github/workflows/ci.yml` | 完成，最终 CI 通过 |
| U-04 | OpenAI、Anthropic、DeepSeek、GLM 四 Provider | 二 | Registry、Factory、MockProvider、三类兼容 Adapter + Anthropic Adapter | `src/providers/`、Adapter tests | 完成；仅 DeepSeek 使用真实账号验收 |
| U-05 | Provider/模型目录不能泄露 Key 或 baseUrl | 二、三 | `/api/providers` 返回 mode、展示名、模型和 configured 布尔值 | providers route/registry/security tests | 完成 |
| U-06 | 增加各 Provider 模型系列 | 三 | GPT-6 Astra、GPT-5.6/5，Claude 4.5/4.1/4/3.5，DeepSeek V4/Chat/Reasoner，GLM-5/4 Flash | `src/providers/config.ts` | 目录完成；模型可用性取决于厂商和账号权限 |
| U-07 | 统一请求校验、timeout、AbortSignal 和安全错误 | 二、三 | 严格字段、Provider/模型、角色、长度、参数、180 秒上游 timeout、取消传播 | validation/chat-handler/security tests | 完成 |
| U-08 | `/api/chat` 支持非流式和 SSE | 二 | JSON 响应；SSE `message_start/delta/end/error` | chat route tests、chat SSE parser | 完成 |
| U-09 | 基础聊天页和后续高级 UI | 二、三 | ModelHub 响应式工作区、侧栏、消息区、底部输入区、模型内联选择 | `app/page.tsx`、`app/page.module.css` | 完成；不含指定运营商品牌文字 |
| U-10 | 页面适配屏幕，参考编码工作台布局 | 三 | 桌面固定视口、区域内部滚动；移动端纵向响应式和 sticky 输入区 | CSS media queries、人工验收 | 完成 |
| U-11 | temperature、max_tokens 和安全 Markdown | 二、三 | 0–2、1–32768（默认 4096）；受控 React Markdown | chat-settings/safe-markdown tests | 完成 |
| U-12 | 最多 5 个本地会话 | 二 | 新建、切换、删除、刷新恢复，仅 localStorage | local-data implementation/tests | 完成 |
| U-13 | 内置提示词和本地自定义提示词 | 二 | 3 个服务端只读模板；本地保存/更新/插入/删除 | prompts route、local-data、UI | 完成；无云同步 |
| U-14 | TXT、Markdown、JSON 本地文档 | 三 | 3 个文件、单个 1 MB、JSON 校验；正文发送后清除 | local-documents implementation/tests | 完成；不是向量检索或服务端知识库 |
| U-15 | 复制回复和导出 Markdown | 三 | Assistant 复制；当前会话下载 `.md` | session-export/tests、UI | 完成 |
| U-16 | Mock/Live 状态与 Provider 配置提示 | 三 | 顶部模式徽标和 Provider 状态点；未配置时禁发 | providers API、UI | 完成，不显示密钥值 |
| U-17 | Enter 发送 | 三 | Enter 发送、Shift+Enter 换行、输入法组合保护 | `handleComposerKeyDown` | 完成 |
| U-18 | 通用安全 Live 启动脚本 | 三 | `run-live.ps1` 按 Provider读取 SecureString、挂载临时只读 Key 文件、停止清理 | `run-live.ps1`、用户/部署手册 | 完成；需要 Docker Desktop 和 PowerShell Process Bypass |
| U-19 | 真实 DeepSeek 测试和 reasoning 兼容 | 三 | DeepSeek 鉴权、模型列表、非流式/流式；`reasoning_content` 与最终正文独立流式展示 | OpenAI-compatible Adapter/tests、测试记录 | 完成；Max tokens 1024 已验证，默认已提升为 4096 |
| U-20 | 依赖漏洞修复 | 三 | 13 项降至 0；新 Vitest 公告出现 2 项 Moderate 后升级到 Vitest 5 再恢复 0 | package lock、security tests、test report | 完成，以最终审计时间为准 |
| U-21 | Docker 运行和 amd64 镜像 | 三 | Node 24 多阶段 standalone、`nextjs` 非 root、linux/amd64、HTTP 200 | Dockerfile、inspect、test records | 完成 |
| U-22 | 更方便且安全地切换 API Key | 三 | 环境变量、`*_API_KEY_FILE` 和通用启动脚本 | transport、`.env.example`、run-live | 完成；生产推荐平台 Secret |
| U-23 | 阶段三文件夹包含完整交付 | 三 | 源码/文档、镜像 tar、SHA-256；排除 Git/依赖/缓存/密钥 | `D:\E2026.08.29\中国移动\ai coding\阶段三` | 完成 |
| U-24 | 面向用户和面向运维的方法说明 | 二、三 | 用户手册覆盖页面和 Live 使用；部署手册覆盖导入、启停、密钥、升级、回滚、排障 | user-guide、deployment-guide | 完成 |
| U-25 | 最终文档与产品完全同步 | 三收口 | 阶段一设计、阶段二手册、阶段三证据统一为最终实现；披露未实现增强项 | 本矩阵和全量文档一致性检查 | 完成 |
| U-26 | 实际模型与厂商思考流 | 三 | 上游 `model` 优先；reasoning 与正文独立 SSE/UI 展示 | adapter/API/UI tests | 完成 |

## 3. Git 与阶段证据

| 里程碑 | 历史基线 | 最终说明 |
|---|---|---|
| 阶段一 | `0e74b56` / `stage-1-approved` | 标签保留当时历史快照；最终校正文档位于 `phase/3-release` 最新提交 |
| 阶段二 | `c24ae5c` / `stage-2-complete` | 标签保留阶段二可运行 MVP；后续 UI/安全/容器增强位于阶段三 |
| 阶段三 | `stage-3-complete` | 应指向包含最终文档一致性更新的最新提交 |

阶段标签表示历史里程碑。由于本次按最终结果校正了早期文档，查看最终交付时应以 `stage-3-complete` 为准，不应从阶段一标签单独取出旧需求文档作为最终需求。

## 4. 明确未交付或有条件项

- OpenAI、Anthropic、GLM 未使用真实账户执行 Live 烟囱测试，只有 mock fetch 契约覆盖。
- 模型目录是服务端允许列表，不保证所有账号或地区都可调用。
- ACCESS_CODE 未覆盖 `/api/chat`，不能作为公网完整认证。
- 未实现应用级限流、自定义跨域开放、CSP、安全头、DNS/IP/重定向纵深 SSRF 防护和结构化审计。
- SBOM、签名、压力测试、轮换演练和生产镜像持续扫描属于增强项。
- 不包含账号、数据库、云同步、图片/语音、PDF/Office、MCP、插件或知识库。

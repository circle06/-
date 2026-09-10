# MultiProvider LLM Toolbox

## 项目目标

从零设计一个网页版大模型接口调用工具箱。OpenAI、Anthropic 是核心必需 Provider，DeepSeek、GLM 是必须实现的扩展 Provider；四者均需 Adapter 和 mock 契约测试。项目提供网页聊天、Provider/模型选择、文本对话、非流式与流式响应、提示词模板、Docker 部署以及测试和 CI 规划。

## 当前状态

阶段一至阶段三功能和文档已经完成。当前 `phase/3-release` 包含 Next.js 应用、四个 Provider 的 Mock/live Adapter、非流式与 SSE 聊天 API、响应式聊天工作区、本地会话与提示词、本地文档导入、生成参数、安全 Markdown、回复复制与会话导出，以及安全的 Live 密钥启动脚本。项目已完成依赖漏洞修复、API 安全回归、CI 和 Linux/amd64 Docker 验证；最终交付镜像需基于当前提交重新构建并导出。

## 用户手册

安装、Mock/Live 启动、聊天操作、本地数据边界和常见错误请参阅 [用户使用手册](docs/user-guide.md)。

Docker 构建、部署、密钥注入、升级、回滚和运维排障请参阅 [部署指南](docs/deployment-guide.md)。测试证据见 [测试记录](docs/test-records.md) 和 [测试报告](docs/test-report.md)。

## 目录说明

- `docs/requirements.md`：项目范围、角色、故事、功能和约束。
- `docs/architecture.md`：分层架构、数据/错误流和适配器边界。
- `docs/ui-design.md`：页面结构、状态和安全交互规则。
- `docs/api-contract.md`：HTTP/SSE 接口及参数限制。
- `docs/security-design.md`：密钥、SSRF、CORS、限流、超时、Docker 等安全设计。
- `docs/acceptance-criteria.md`：阶段一至三可测试验收标准。
- `docs/user-guide.md`：安装、运行和网页功能使用说明。
- `docs/test-records.md`：质量、安全、API 和容器测试记录。
- `docs/test-report.md`：阶段三测试结论、漏洞修复和剩余风险。
- `docs/deployment-guide.md`：amd64 Docker 构建、运行、升级、回滚和排障。

## 技术路线与数据边界

项目采用 Next.js + React + TypeScript。聊天记录和用户自定义提示词只保存在浏览器本地；服务端只提供内置只读提示词。API Key 和 ACCESS_CODE 只在服务端环境变量中使用，不进入浏览器。

## 交付状态

1. 阶段一：需求、架构、UI、接口、安全设计和验收标准已完成。
2. 阶段二：可运行代码、Git/CI 和面向用户的使用手册已完成。
3. 阶段三：测试与依赖漏洞修复、amd64 容器构建验证、测试报告和面向运维的部署手册已完成。

SBOM、镜像签名、压力测试、企业身份认证和密钥轮换演练属于可选增强项，不在当前作业范围内。

## 安全边界

默认本地部署。公开部署时启用服务端 `ACCESS_CODE` 简单访问码，但不实现用户注册和多租户。真实 API Key 只能由服务端环境变量提供；浏览器不得填写或持久化密钥；客户端不得提交任意 `baseUrl`；Provider 地址必须来自服务端白名单；默认不开放任意来源 CORS；请求长度、角色、`max_tokens`、超时、4xx/5xx 和流式事件均受服务端控制。

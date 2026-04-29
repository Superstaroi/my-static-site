# AGENTS.md

## 项目定位
VXStudio 是电商产品图生成工作台：上传产品图/参考图/Excel -> 提取产品指纹 -> 生成或局部编辑图片 -> 校验生成结果 -> 保存历史。后台负责用户、配额、模型配置状态、使用日志和统计。

## 技术栈
- 前端：Vite 6 + React 19 + TypeScript + Tailwind CSS v4 + React Router 7 + lucide-react + motion + xlsx。
- 后端：Express 5 + TypeScript(strict) + mysql2 + JWT Cookie Auth + bcryptjs + @google/genai + OpenAI Responses API(fetch) + undici 代理支持。
- 数据库：MySQL 8，主 schema 在 `server/sql/init.sql`。
- 端口：前端 `9527`，后端 `9528`；Vite 将 `/api` 代理到后端。

## 关键目录
- `src/router/AppRouter.tsx`：前台/后台路由和鉴权入口。
- `src/App.tsx`：主工作台状态机，包含单图、批量、详情图、指纹、校验、历史记录调度。
- `src/features/*`：单图、批量、详情图 UI 分块。
- `src/services/*`：前端 API 包装、Prompt 构建、图片/指纹/校验调用。
- `src/auth/*`：前台登录态与后台登录态，二者隔离。
- `server/src/app.ts`：Express 中间件、CORS、路由挂载、登录限流。
- `server/src/controllers/*`：请求校验和响应封装。
- `server/src/services/*`：AI、配额、用户、日志、历史记录等核心业务。
- `server/src/utils/*`：鉴权、图片 payload、远程图片安全拉取、OpenAI/Gemini 错误处理、代理、脱敏。

## 主要功能
- 前台：登录、首页素材墙/收藏、单图生成、Excel/CSV 批量生成、Amazon/Walmart/Other 详情图组生成、单张重生成/局部编辑、生成图校验、生成历史查看/下载/删除。
- AI：OpenAI 提取产品指纹与身份识别；Gemini 生成图片、局部编辑、结构化校验、文案整理、指纹草稿更新。
- 后台：管理员登录、用户 CRUD、重置密码、启停账号、设置每日额度和今日额外次数、查看 usage logs / usage summary / 模型配置。
- 占位入口：上传素材、Prompt 模板、风格库、文生图、AI 视频；不要误判为已完整实现。

## API 与鉴权边界
- 前台 Cookie：`vxstudio_user_token`，接口：`/api/auth/front/*`、`/api/user/*`、`/api/generate/*`、`/api/analyze/*`。
- 后台 Cookie：`vxstudio_admin_token`，接口：`/api/auth/admin/*`、`/api/admin/*`；后台必须校验 `role=admin`。
- 不要把前后台登录态合并，不要让普通用户访问后台接口。
- API 错误保持 `{ success:false, code, message, detail }` 结构，前端依赖 `ApiError` 和 401 自动跳转。

## 开发命令
```bash
npm install
npm --prefix server install
npm run db:migrate
npm run seed:admin
npm run dev:server   # backend 9528
npm run dev          # frontend 9527
npm run lint         # tsc --noEmit
npm run preflight    # frontend build + backend build
npm run release:zip  # source-only release zip
```

## 环境变量规则
- `server/src/config/env.ts` 只读取 `server/.env`；必填 `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD/JWT_SECRET`。
- `GEMINI_API_KEY`、`OPENAI_API_KEY` 只能放在 `server/.env`，禁止放入前端 `.env` 或浏览器代码。
- 根目录 `.env.example` 只用于前端非敏感配置，例如 `DISABLE_HMR`。
- 管理员初始密码必须来自 `ADMIN_SEED_PASSWORD`，不要硬编码默认密码。

## 业务硬边界
- 禁止在前端直接调用 Gemini/OpenAI；所有模型调用必须走后端 controller/service。
- 新增消耗型动作必须包进 `executeQuotaControlledAction`，并写入 `usage_logs`。生成、编辑、指纹提取/更新当前消耗 1；文案整理、远程图解析、身份识别、校验、详情 Prompt 当前消耗 0。
- 远程参考图必须走 `fetchRemoteImageAsBase64` / `/api/generate/resolve-image`，不要削弱私网 IP、metadata、localhost、跳转和大小限制。
- 日志必须脱敏，禁止记录 base64、完整 URL、密钥或大图数据。
- 生成 Prompt 的核心规则不能破坏：上传产品图是唯一真实产品身份；参考图只提供场景/构图/灯光/风格，不能复制参考图产品结构、Logo 或颜色块。
- 保持 AbortController、timeout、requestId/workflowVersion 防陈旧更新逻辑；不要让旧请求覆盖新 UI 状态。
- DB 修改要同步 `server/sql/init.sql` 和 `server/src/scripts/migrate.ts`，使用参数化查询。

## 不要改/不要依赖
- 不要依赖或提交：`dist/`、`server/dist/`、`node_modules/`、`server/node_modules/`、`.git/`、`.vite/`、`release/`、`*.log`、`.env*`、`temp-*`、`test-results/`。
- 不要从 `dist` 或 `server/dist` 反向改源码。
- 不要改弱双登录、配额、SSRF 防护、日志脱敏和产品身份锁定，除非任务明确要求且同时补齐测试/验证。

## 编码风格
- UTF-8、LF、2 空格缩进；中文 UI 文案保持自然直接。
- 前端 root 使用 ESM；后端 TS 编译到 CommonJS。路径别名 `@` 指向项目根。
- 优先在 `features/`、`services/`、`utils/` 拆小函数；`src/App.tsx` 已经很大，新增逻辑不要继续无节制堆进去。

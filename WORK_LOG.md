# 2D Game Asset Studio — 工作日志

> 本地 AI 游戏素材工作台的产品化迭代记录

---

## 12. 阶段 I：公网部署 + 账号/积分底座（进行中，2026-06-29）

### I.1 公网部署闭环

当前已完成基础版阿里云 ECS 部署：

- 服务器：阿里云 ECS，Ubuntu 22.04，2 vCPU / 2 GiB 内存
- 公网 IP：`8.130.115.57`
- 项目目录：`/opt/2dplay`
- Node 服务端口：`5177`
- PM2 进程名：`2dplay`
- Nginx 已反向代理 80 端口到本机 `5177`
- 当前可通过 `http://8.130.115.57` 访问首页

部署链路已跑通：

```text
GitHub 拉取项目 -> npm install -> .env mock 配置 -> npm start 验证 -> PM2 托管 -> Nginx 反代 -> 公网 IP 访问
```

域名 `2dplay.cn` 已购买，但暂未正式绑定。由于服务器位于中国大陆，正式使用域名访问通常需要先完成 ICP 备案。备案通过后再配置 DNS、Nginx server_name 和 HTTPS。

### I.2 账号系统第一版

本地工程已新增账号系统底座，尚未同步到服务器：

- 新增 `server/auth.js`
- 使用 `sql.js` 保存 SQLite 数据，数据库文件为 `data/app.sqlite`
- 新增手机号验证码登录/注册接口：
  - `POST /api/auth/send-code`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/me`
- 使用 HttpOnly Cookie 保存登录会话，默认有效期 14 天
- 首次手机号登录即自动注册账号
- 验证码当前为开发/内测模式：后端打印日志，并在接口返回 `devCode`，方便先跑通流程；后续接短信平台时替换发送逻辑

### I.3 IP 防刷规则

第一版不做复杂设备指纹，先采用轻量 IP 限制：

```text
同手机号：每天最多 5 次验证码
同 IP：每天最多 20 次验证码
同 IP：每天最多 3 个新账号领取注册送积分
```

说明：目标不是完全阻止所有薅羊毛，而是先把低成本批量注册的门槛抬高，同时保持基础服务器压力很低。

### I.4 积分系统底座

已新增积分账户与流水表：

- `credit_accounts`：用户积分余额
- `credit_ledger`：积分流水
- 新用户注册赠送 `30` 体验积分
- 顶部前端显示当前用户与积分余额
- 新增 `GET /api/credits/ledger` 查询积分流水

当前仅完成“账号 + 余额 + 注册赠送 + 流水底座”，还未把生成任务接入扣费。

### I.5 前端登录入口

已在前端新增：

- 顶部登录按钮
- 登录后显示昵称和积分
- 手机号验证码登录弹窗
- 未登录点击主要工具时先弹登录框

### I.6 本地验证结果

已在本机验证：

- `node --check server/index.js` 通过
- `node --check server/auth.js` 通过
- 本地服务可启动
- `/api/me` 匿名状态返回正常
- 模拟手机号注册登录成功
- 注册后积分余额为 `30`

### I.7 下一步

优先级从高到低：

1. 将现有工具接入积分扣减：
   - AI 生图
   - 图片抠图
   - 动作视频
   - 视频抽帧
   - 批量 UI
2. 实现“任务开始前预扣，失败后返还”
3. 增加管理员后台最小版：
   - 用户列表
   - 积分余额
   - 手动增减积分
   - 积分流水
4. 完成本地验证后推送 GitHub
5. 服务器执行 `git pull && npm install && pm2 restart 2dplay`

---

*最后更新：2026-06-29*

## 1. 项目概述

**2D Game Asset Studio** 是一个本地运行的 AI 游戏素材生产工作站，面向独立游戏开发者 / 美术。当前覆盖五大工作流：

| 工作流 | 输入 | 输出 | 依赖 |
|--------|------|------|------|
| 生图 | 文本描述 + 参考图 | 单张图片 | 云端 API（豆包 / MiniMax / OpenAI）|
| 图片抠图 | 单张图（multiple 支持）| 透明 PNG | 本地 OpenCV + BiRefNet |
| 动作视频 | 文本描述 + 参考图 | 视频 | 云端 API（豆包 Seedance）|
| 视频抽帧 | 视频文件 | 序列帧 PNG + 动画预览 | 本地 FFmpeg + BiRefNet |
| 批量 UI 素材 | CSV / TSV / xlsx | 多个图标/按钮/面板 | 云端 API + 本地抠图 |

**核心约束**：所有素材保留本地，AI 调用仅在生图/视频环节发生，抠图与抽帧全程离线。

**前端架构**：浅色亮调（Indigo `#4f46e5` + 白底）+ 6 工具独立 URL（`/` + `/tools/{character|cutout|motion|frames|uiBatch}`）+ 单工具页单栏居中布局。

---

## 2. 工作内容总览

按阶段划分，每阶段对应一次产品化迭代。

### 阶段 A：MVP 构建（先前完成）

- 搭建本地 Node 服务器 + 静态前端
- 接入豆包 Seedream / Seedance、MiniMax image-01 / Hailuo、OpenAI gpt-image
- 实现图片抠图、动作视频、视频抽帧三条主线
- 支持 mock 模式无密钥运行

### 阶段 B：核心体验产品化（已完成）

| 日期 | 改动 | 备注 |
|------|------|------|
| 2026-06-17 | 删除顶栏"真实 API 模式…"技术字符串 | 顶栏只保留品牌 + 连接状态 |
| 2026-06-17 | 引入 staging 目录模式 | 结果先入 staging，用户点击下载才进 exports |
| 2026-06-17 | 修复 404 返回纯文本导致 JSON 解析失败 | 改为 JSON 响应 |
| 2026-06-17 | 修复参考图上传失效 | 参考图改为发送到 AI 而非本地拷贝 |
| 2026-06-17 | 修复参考图上传点击区域不响应 | file input 改为绝对定位覆盖整个卡片 |
| 2026-06-17 | 重命名"角色图"→"生图"、"角色参考图"→"参考图" | 适配场景图生成需求 |
| 2026-06-17 | 增加负面提示词（negative_prompt）| 三个图片模型均支持 |
| 2026-06-17 | 增加图片生成尺寸选择（豆包 1024/2048、OpenAI 1024/1536）| 商业级对标 |
| 2026-06-18 | 增加批量抠图功能 | 新工作流卡片 + API 路由 |
| 2026-06-18 | 增加最近生成画廊（localStorage 持久化）| 历史可回看 |

### 阶段 C：视觉重构（已完成）

- 主题色系从浅色全面重构为 GitHub Dark 风格
  - `--app-bg: #0d1117`、`--topbar-bg: #161b22`、`--panel: #161b22`
  - 主色 `--primary: #58a6ff`，悬停态使用蓝色光晕
- 引入 `.app-shell` 容器与 hero panel 强化主舞台
- 卡片采用 `backdrop-filter: blur` + 微阴影
- 按钮、输入框、进度条统一暗色化

### 阶段 D：抠图性能优化（已完成，2026-06-20）

**问题**：6 张批量抠图卡在第 1 张，串行 spawn 6 个 Python 子进程，每次冷启动 + 重新加载 BiRefNet 模型。

**方案 A：单进程 + 模型复用**

| 指标 | 改造前 | 改造后 |
|------|--------|--------|
| 6 张图串行总耗时 | 1–3 分钟 | 7 秒 |
| Python 冷启动次数 | 6 | 1 |
| BiRefNet 模型加载次数 | 6 | 1 |
| 前端进度反馈 | 仅 "抠图 1/6" | 逐张进度 + 模型加载提示 |

实现要点：
- 把 `runBatchCutoutWorkflow` 的 for 循环改为单次调用 `scripts/process_image_batch.py`
- 给 `runPython` 加 `(line) => parseProgressLine` 回调
- 顺手修复 `readMultipart` 同名字段多文件互相覆盖的潜在 bug
- 修复 `parseProgressLine` 把异常 fallback 设成 50% 的隐藏问题

**GPU 自动检测**

新增 `detectNvidiaGpu()` 函数，server 启动时跑 `nvidia-smi`：
- 有 NVIDIA 显卡 → `BIREFNET_DEVICE=cuda`
- 无显卡 → `BIREFNET_DEVICE=cpu`（避免 BiRefNet auto 探测浪费时间）
- 显式设置 `.env` 中的 `BIREFNET_DEVICE` 优先

**实测**（本机 RTX 4060 Laptop）：

| 模式 | 6 张 2048×2048 图耗时 |
|------|---------------------|
| CPU 模式 | 7 秒 |
| CUDA 模式 | **4 秒** |

### 阶段 E：核心体验闭环与视觉对齐（已完成 → 已演进为 F 阶段，2026-06-22）

按收益 / 依赖关系排列，5 项改进：

1. **核心体验闭环**：最近生成缩略图栏，生成后立即可看历史 + 一键复用 prompt
2. **画布区改造**：空状态加引导插画 / 示例；任务运行时显示模型 + 耗时 + 取消按钮
3. **参数面板分组**：用 accordion / 分组标签（"模型"、"画面"、"风格"）替代平铺
4. **预设 / 模板**：3-4 个常用场景一键填充 prompt
5. **图标系统化**：所有工作流卡片、按钮加线性图标（lucide 风格）
6. **顶部 hero 精简**：合并或去掉右侧三张说明卡片，让主舞台更突出

---

## 3. 故障记录与决策

### 3.1 抠图卡死（已解决）

- **症状**：批量抠图 6 张卡在第 1 张
- **根因**：串行 spawn Python 子进程，每次冷启动 1.5 秒 + 重新加载 BiRefNet 模型 5–15 秒
- **解决方案**：见阶段 D 方案 A
- **教训**：AI 工具前端必须给进度反馈，否则用户无法区分"在跑"和"卡死"

### 3.2 multipart 多文件覆盖（已解决）

- **症状**：`POST /api/batch-cutout` 上传 6 张图只识别到 1 张
- **根因**：`readMultipart` 把同名字段的多个文件对象互相覆盖
- **解决方案**：同名 field 累积为数组，单个保留原行为
- **影响范围**：所有依赖同名多文件上传的接口，本次一并修复

### 3.3 抠图模型选择策略

- **决策**：默认 `auto` 模式（先 OpenCV 连通域、不够再 BiRefNet）
- **理由**：游戏素材常见白底/绿底角色图，纯图像学方法毫秒级即可完成
- **未来可调**：根据历史成功率数据决定是否默认 `birefnet`

### 3.4 数据本地优先

- **决策**：所有 AI 产物先入 `staging/`，用户点下载才进 `exports/`
- **理由**：避免 exports 目录被无效生成污染，符合商业工具"用户掌控"原则
- **未来**：考虑加定时清理 staging（默认保留 7 天）

---

## 4. 阶段 E 任务清单（已演进为 F 阶段）

| # | 任务 | 状态 | 落地阶段 |
|---|------|------|----------|
| 1 | 最近生成缩略图栏 | ✅ 完成 | 阶段 C |
| 2 | 画布区空状态 + 运行态改造 | ✅ 完成 | 阶段 C / F |
| 3 | 参数面板分组（accordion） | ✅ 完成 | 阶段 F |
| 4 | 预设 / 模板 | ✅ 完成 | 阶段 C |
| 5 | 图标系统化（lucide） | ✅ 完成 | 阶段 C / F |
| 6 | 顶部 hero 精简 | ✅ 完成 | 阶段 F（信任徽章替代六色 pill） |

---

## 5. 后续计划（Backlog）

- **常驻 Python 抠图服务（方案 B）**：彻底消除冷启动，单张推理 < 1 秒（GPU）
- **批量 UI 增强**：批量抠图加并发控制（默认 2 路并行防止显存爆炸）
- **预设导出**：常用 prompt 组合支持导出 / 导入 JSON
- **历史画廊搜索与筛选**：按工作流类型、时间、模型筛选
- **国际化**：当前仅中文，预留 i18n 框架
- **多账号 API 管理**：支持多个 API 密钥轮询

---

## 7. 阶段 F：UI 浅色化重构 + 独立工具路由（已完成，2026-06-22）

**用户决策依据**：参考 [videotoframes.com](https://videotoframes.com/zh/ai-video-upscaler) 的"每个工具独立 URL + 单栏居中"风格，明确说"我想要这种有效拉框，它把每个工具都分开来了"。

**核心目标**：从暗色三栏（侧边栏 + 画布 + 参数面板）改为浅色单栏（工具下拉切换 + 居中参数面板），保留工具型专业感。

### F.1 设计令牌系统（`public/styles.css :root`）

从 36 个暗色变量重构为浅色令牌，命名采用语义化：

| 类别 | 令牌 | 值 |
|------|------|-----|
| 背景 | `--app-bg` / `--surface` / `--surface-soft` / `--surface-sunk` | `#f7f8fa` / `#ffffff` / `#f1f3f6` / `#eceff3` |
| 前景 | `--ink` / `--ink-2` / `--ink-3` | `#0f172a` / `#475569` / `#94a3b8` |
| 边框 | `--border` / `--border-strong` | `#e2e8f0` / `#cbd5e1` |
| 主色 | `--accent` / `--accent-tint` / `--accent-ring` | `#4f46e5`（Indigo-600，对比度 5.2:1 达 WCAG AA） |
| 状态 | `--danger` / `--warning` / `--success` / `--info` 各 + `-soft` + `-border` | 红/黄/绿/蓝完整 soft 系 |
| 阴影 | `--shadow-xs/sm/md/lg` + `--shadow-ring` | 极轻：`rgba(15,23,42,0.04–0.12)` |
| 棋盘格 | `--checker-a` / `--checker-b` | `#ffffff` / `#e5e7eb`（透明 PNG 预览底） |

**主色选择决策**：从 `#6366f1` (Indigo-500) 升级到 `#4f46e5` (Indigo-600)，原色在白底对比度仅 4.1:1（不达 AA），新色 5.2:1（达 AA）。

### F.2 4 阶段渐进式重构

按"低风险 → 高风险"分 7 步，每步可独立 commit + 截图：

| 阶段 | 内容 | 截图 |
|------|------|------|
| 1 | 令牌 + 全局重置 | `staging-step1-after.png` |
| 2 | 按钮 / 表单 / shadow token 化 | `staging-step2-after.png` |
| 3 | 棋盘格 + 6 个图像容器 | `staging-step3-after.png` |
| 4 | Hero 区重设计（六色 pill → 三个信任徽章） | `staging-step4-hero.png` |
| 5 | 侧边栏模式项升级 | `staging-step5-sidebar.png` |
| 6 | 画布空状态 + 参数面板分组 | `staging-step6-after.png` |
| 7 | 6 个工作模式回归 | `staging-step7-mode-*.png` |

### F.3 独立 URL 路由（`/`, `/tools/{tool}`）

**用户需求**："点击工具下拉应该只看到这个工具的页面"。

**实现要点**：

- **`public/app.js` 末尾新增路由模块**（~110 行）：`parseRoute` / `applyRoute` / `navigate` / `popstate` 监听
- **首屏 `body[data-page="home"`**：hero + 6 个工具卡片网格（3×2），隐藏参数面板和侧边栏
- **`body[data-page="tool"]`**：单栏居中（max-width 1080px → 满宽 100%），隐藏 hero 和工具卡片网格，**只显示该工具需要的 inspector-section**
- **topbar 工具下拉**：从顶部 5 个图标改为"所有工具 / 当前工具名"下拉按钮，点击展开 6 个工具项
- **首页工具卡片**：每个带 36×36 颜色图标块 + 标题 + 描述 + "进入工具 →" CTA
- **点击拦截**：所有工具下拉/卡片点击 → `history.pushState` 走客户端路由，不刷新
- **server `serveStatic` 加 SPA fallback**：找不到 `public/tools/*` 文件时返回 `index.html`

### F.4 工具页单栏布局冲突解决

**问题**：原本 frame-module 在 `main.canvas-panel` 内，但工具页下 `canvas-panel` 整个 hidden（用户要求"中间区域只要参数面板"），导致分帧工作区不可见。

**方案**：JS 在初始化时把 `frame-module` 从 `main.canvas-panel` 搬到 `inspector-panel` 顶部（用 `insertBefore` 即可），保持原代码逻辑不变。

```js
(function moveFrameModule() {
  const frameModule = document.querySelector(".frame-module");
  const inspectorPanel = document.querySelector(".inspector-panel");
  if (!frameModule || !inspectorPanel) return;
  const currentResult = inspectorPanel.querySelector("#currentResult");
  if (currentResult) inspectorPanel.insertBefore(frameModule, currentResult);
  else inspectorPanel.insertBefore(frameModule, inspectorPanel.firstChild);
})();
```

### F.5 `result.frames` → 当前结果卡片（bug 修复）

**症状**："我生图之后，网页没有看到生结果，但本地目录中能看到结果"。

**根因**：`renderResult` 把生图结果写到 `previewArea`，但工具页下 `previewArea` 整个 hidden。

**修法**：在 `inspector-panel` 顶部新增 `<section id="currentResult" hidden>` 容器，`renderResult` 同时把 `result.image` / `result.preview` / `result.uiAssets` / `result.batchResults` 写入卡片，单图直接展示，多图 grid 展示。带关闭按钮，切换工具时清空。

### F.6 关键 CSS 改动

```css
body[data-page="tool"] .canvas-panel { display: none; }
body[data-page="tool"] .workflow-sidebar { display: none; }
body[data-page="tool"] .studio-shell { 
  display: block; width: 100%; max-width: none; 
  padding: 24px 32px 60px;
}
body[data-page="tool"] .hero-panel { display: none; }
body[data-page="home"] .studio-shell { display: none; }
```

### F.7 历史截图归档

7 张原 step*.png（暗色）归档到 `staging/screenshots-before/`，新流程不再保留历史截图，验证改用 7 张 `staging-step7-mode-*.png` 重新生成。

---

## 8. 阶段 G：cutout 工具合并 + 多图批量（已完成，2026-06-22 ~ 23）

### G.1 cutout / batchCutout 合并

**用户决策**："图片抠图和批量抠图直接合并为图片抠图，上传图片是一个就扣一个，是几个就抠几个"。

**改动**：

- 路由白名单 `VALID_TOOLS` 删 `batchCutout`，`TOOL_LABELS` / `MODE_ICONS` / `MODE_LABELS` 一并清理
- `<input type="file" id="cutoutImage">` 改名为 `cutoutImages`，加 `multiple`
- 单一 upload drop-card + 数量计数 + 帧列表（带圆点序号 + 文件名 + KB 大小）
- 单一"抠图并导出"按钮（替代两个 cutoutButton / batchCutoutButton）
- "批量抠图" 在侧边栏、topbar 下拉、首页卡片、frame-settings section 的 `data-mode-only` 一并删除

### G.2 多图上传 bug 修复

**症状**："点击图片抠图，上传图片，不能选择几张图片，只能点击一张"。

**根因**：`<label class="drop-card">` 包 `<input type="file" multiple>` 时，浏览器在子元素（span/small）上反复冒泡触发 click 事件，导致系统弹窗不能稳定多选。

**修法**：把 `<label>` 改为 `<div class="drop-card" id="cutoutDropCard" role="button" tabindex="0">`，input 加 `hidden`，JS 在 div 上加 click + keydown 事件触发 `input.click()`。

**验证**：Playwright 真实打开系统文件选择器（不是模拟）→ 选 3 个文件 → 列表显示 3 行（"1 app.js 70.7 KB / 2 styles.css 48.9 KB / 3 index.html 35.7 KB"）。

### G.3 批量 API 改造（性能）

**症状**："批量抠图选择了几张图片之后，感觉没有任何反馈，只是抠图并导出那个按钮变成了暗色"。

**根因**：前端 `cutoutUploadedImages` 之前是 `for (i=0; i<N; i++)` 串行 `POST /api/cutout-image`，**每张图都新 spawn 一个 Python 子进程 + 重新加载 BiRefNet 模型**（即使模型已在本地）。N=3 张图要重复 3 次冷启动。

**修法**：

1. 前端改为单次 `POST /api/batch-cutout`（已有路由），上传 `batchImages` 字段
2. 后端 `runBatchCutoutWorkflow` 在 `scripts/process_image_batch.py` 中单次加载模型 + for 循环处理
3. Python 进度回调通过 `print("PROGRESS percent message", flush=True)` 输出，前端 `pollJob` 实时更新

**待验证**：3 张图从原来 30s × 3 = 90s 应降到 ~5s（受限于 GPU 显存，未在本会话实测）。

### G.4 进度反馈

**改动**：

- `<input type="file" id="cutoutImages">` 旁新增 `<div class="cutout-progress">`：任务状态 + 进度条（0-100%）+ 帧列表行
- 每帧状态图标：⏳ 处理中 / ✅ 完成 / ❌ 失败
- 实时秒数计数（每 2s 更新一次）

### G.5 抠图设置（cutout-mode 公共）

- **输出格式**：PNG（透明）/ JPG
- **抠图方式**：auto / BiRefNet / UI 边界 / color 绿幕白幕

---

## 9. 阶段 H：序列帧动画预览器（已完成，2026-06-23）

**用户需求**："我现在的操作是可以分帧，希望分帧完之后，旁边的窗口能看到当前序列帧播放的动画效果，如果能调整每个帧之间的播放间距就更好了。"

**后改需求**："调整帧间距的意思是：我将这些抠好的序列帧放到一个进度条上，然后我可以手动去调整每一帧之间的距离，从而控制动作的流畅度。"

### H.1 数据流

```
分帧完成 (manualCaptures / result.frames)
   ↓
initSequencePlayer(frames)
   ↓
sequencePositions = [0, 0.25, 0.5, 0.75, 1]   // 等间距默认
   ↓
播放调度: progress 0→1 → 当前帧 = progressToFrameIdx(progress)
```

### H.2 UI 组件

- **大画布**：棋盘格底（透明 PNG 友好）+ 当前帧大图
- **工具栏**：第一帧 ‹‹ / 上一帧 ‹ / 播放暂停 ▶ / 下一帧 › / 最后一帧 ›› + "i / N" 计数
- **时间轴（核心）**：每帧一个 handle（首尾固定、中间可拖），pointerdown/move/up 实现拖拽
- **总时长 slider**：0.2s ~ 10s，控制整个动画播放长度
- **循环 / 来回播放** 开关
- **缩略图条**：点击跳帧，当前帧加边框
- **等间距按钮**：一键重置为 `i/(N-1)`

### H.3 时间轴拖拽约束

```js
// 拖 handle idx 时: 严格限制在 [positions[idx-1], positions[idx+1]] 之间
const minPx = sequencePositions[idx - 1] * trackRect.width;
const maxPx = sequencePositions[idx + 1] * trackRect.width;
const x = Math.min(maxPx, Math.max(minPx, ev.clientX - trackRect.left));
```

保证拖动后 positions 仍严格递增（0 < pos[1] < pos[2] < ... < 1），不会出现"帧序错乱"。

### H.4 数据模型演进

**之前**（V1）：每帧一个固定 intervalMs（全局 100ms），所有帧用同一间隔。
**之后**（V2）：每帧一个 `sequencePositions[i] ∈ [0,1]` + 一个 `totalDurationMs` → **实际每帧间隔 = (positions[i] - positions[i-1]) × totalDurationMs**。

播放调度用累积进度（`progress`）而非固定计时器：每 33ms tick 推进 `progress += dt / totalMs`，找 `sequencePositions[i] >= progress` 的最小 `i` 作为当前帧。

### H.5 关键代码

```js
function progressToFrameIdx(progress) {
  for (let i = 0; i < sequencePositions.length; i++) {
    if (progress <= sequencePositions[i]) return i;
  }
  return sequenceFrames.length - 1;
}

function resetTimelineEqual() {
  sequencePositions = sequenceFrames.map((_, i) => i / Math.max(1, sequenceFrames.length - 1));
  sequenceProgress = 0;
  renderTimelineHandles();
  renderSequenceFrame();
}
```

### H.6 实际工作流

1. 视频抽帧后，manualCaptures / result.frames 自动加载 → sequencePlayer 显示
2. 时间轴初始为等间距（`[0, 0.25, 0.5, 0.75, 1]`）
3. 用户拖动中间 handle 改变帧间距（如拖 idx=2 到 0.45 → 第 3 帧提前）
4. 播放时按新 positions 调度 → 动作节奏精确可控

---

## 10. 验证产物归档

| 阶段 | 关键截图 |
|------|----------|
| F.1 浅色化 | `staging-step1-after.png` ~ `staging-step7-mode-*.png` |
| F.3 路由 | `staging-route-home.png`, `staging-route-cutout.png` |
| F.5 当前结果 | `staging-current-result.png` |
| G.2 多选 | `staging-cutout-multi-upload.png` |
| H 序列帧 | `staging-timeline-edited.png`（拖动 3 个 handle 后） |

---

## 11. 当前 Sprint：阶段 H 已完成

### 已完成
- ✅ 阶段 F：UI 浅色化 + 路由重构
- ✅ 阶段 G：cutout 合并 + 批量 API + 进度反馈
- ✅ 阶段 H：序列帧动画预览器（含逐帧时间轴拖拽）

### 待办
- [ ] **G.3 性能实测**：批量 API 改造完成后未实测 3 张图耗时，需要在 GPU 环境下跑一次确认（5s 目标）
- [ ] **历史截图清理**：阶段 F 前的 step*.png 已归档到 `staging/screenshots-before/` 7 张，浅色流程不再保留历史截图
- [ ] **memory 同步**：阶段 F / G / H 的核心决策写入 `~/.claude/projects/.../memory/`

---

*最后更新：2026-06-23*

## 6. 附录：技术栈与目录结构

**技术栈**：Node.js 20+ / 原生 HTTP server / Python 3.13 + torch + transformers / OpenCV / BiRefNet

**目录结构**：
```
2DGame_Tool/
├── server/index.js          # 主服务
├── public/                  # 前端
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── scripts/                 # Python 处理
│   ├── process_image.py
│   ├── process_image_batch.py
│   ├── process_video.py
│   └── extract_manual_frames.py
├── staging/                 # AI 产物暂存
├── exports/                 # 用户下载的成品
├── uploads/                 # 临时上传
└── data/                    # 历史任务数据
```

**端口**：5177

---

## 12. 阶段 J：个人备案合规 + U2Net-p 接入（进行中，2026-06-30）

### J.1 备案合规：屏蔽付费相关 UI

**背景**：当前是个人 ICP 备案，类型为"个人学习网站"（素材列表备注"个人用于记录二维图像与网页工具开发相关的学习与数据展示"），不能含充值 / 会员 / 积分 / 收费相关功能。

**已屏蔽内容**：

| 位置 | 改动 |
|------|------|
| `public/index.html` 顶部 `account-widget` | 整段注释（登录按钮 + 积分余额 + 退出） |
| `public/index.html` 登录弹窗 `.auth-card` | 整段注释（手机号 + 验证码 + 登录注册） |
| `public/index.html` 文案 | "成本提示" → "规格提示"；"当前成本档位" → "当前规格档位"；"主要成本来自" → "规格由...决定" |
| `public/index.html` 帧率提示 | "成本优化建议" → "可优先调整模型和分辨率优化生成效果" |
| `public/app.js` `requireLogin()` | 改为直接 `return true`（原本会弹登录框拦截业务函数） |
| `public/app.js` costCard 文案 | "省钱档" → "轻量档"；"偏贵" → "偏高清"；"高成本" → "高级档"；"省钱项" → "开关" |

**保留**（不构成"对外展示的敏感内容"）：
- 6 个工具本身（备案的"二维图像与网页工具开发"完全对得上）
- server 端 `/api/auth/*` / `/api/credits/*` 路由和 `server/auth.js`（后端代码不展示给审核员）
- 数据库表 `credit_accounts` / `credit_ledger`（同上）

**验证结果**（Playwright 端到端）：
- 全页面 grep：`成本` / `省钱` / `偏贵` / `高成本` / `积分` / `登录` / `充值` / `会员` 全部 **0 次**
- "规格" 出现 **3 次**（替代原"成本"措辞）
- 6 个工具仍能正常使用（`requireLogin` 改为通过）

### J.3 简化 topbar:删除 API 连接状态块(2026-06-30)

**原因**:用户认为"已连接 / 演示模式"提示对个人学习类项目无意义,删掉让 topbar 更干净。

**改动**:
- `public/index.html`:`.topbar-status` 块整段 HTML 注释
- `public/app.js`:`loadConfig()` 改成 DOM 不存在时直接 skip(避免 `Cannot set properties of null` 报错)
- `public/styles.css`:`.topbar-status` / `.status-dot` / `.status-dot.ok` / `.status-dot.warn` 相关样式整段注释
- `public/index.html`:`<script src="/app.js?v=...">` 版本号从 `20260622-productized` 改为 `20260630-topbar`(强制浏览器清缓存加载新 JS)

**结果**:
- topbar 右侧只保留"所有工具"下拉,完全没有"已连接/演示模式"字样
- 6 个工具照常使用,API Key 配置仍在 `.env`,只是不在 UI 显式提示

### J.2 U2Net-p 接入（替代 BiRefNet）

**背景**：BiRefNet 在 2GB ECS 服务器上**必 OOM**（实测：模型加载 1.8GB，单张 2048² 推理峰值 5.6GB）。改用 U2Net-p（rembg 集成）。

**实测对比**（CPU 模式，模拟 2G 服务器）：

| 抠图方式 | 内存峰值 | 速度 | 2G 服务器可用 |
|---------|---------|------|------------|
| 绿幕（OpenCV） | 412 MB | 0.2s | ✅ |
| **U2Net-p（轻量）** | **740 MB** | **1.9s** | ✅ |
| U2Net（标准） | ~1.2-1.5 GB | 3-5s | ⚠️ |
| BiRefNet | 5634 MB | 16-18s | ❌ OOM |

**改动**：
- `scripts/process_video.py`：新增 `U2NetPBackgroundRemover` 类（rembg 集成）；工厂加 `u2netp` / `u2net` 两个 mode；`AutoBackgroundRemover` 改用 U2Net-p 兜底
- `scripts/process_image.py` / `process_image_batch.py` / `extract_manual_frames.py`：argparse choices 加 `u2netp` / `u2net`；heartbeat 文案按 model 区分
- `server/index.js`：`sanitizeBackgroundMode` 接受新值；默认从 `birefnet` 改 `u2netp`
- `.env`：`BACKGROUND_MODE=birefnet` → `u2netp`
- `public/index.html`：#backgroundMode select 加三档（u2netp 默认 / u2net / birefnet）

**端到端实测**：
- 输入 2048×2048 黑色忍者角色图
- 模式 `u2netp`，耗时 5 秒（含首次模型下载）
- 输出 2048×2048 RGBA PNG，背景完全去除，主体边缘清晰（披风/剑/药水瓶都干净）
- 路径：`staging/cutouts/<name>/<name>_cutout.png`

**商业 / 授权**：
- U2Net-p 4.7MB 权重，Apache 2.0，可商用
- 比 BiRefNet 略差（发丝边缘细节），但对游戏素材（角色立绘、道具、图标）精度足够

---

*最后更新：2026-06-30*

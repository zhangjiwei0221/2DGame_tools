# 2D Game AI Workflow

本地 AI 游戏素材生产工作站 —— 一站式生成游戏角色、场景、UI 素材和动画序列帧。所有素材保留本地,抠图与抽帧全程离线,只在生图/视频环节调用云端 API。

## 快速开始

```bash
# 1. 准备环境
cp .env.example .env

# 2. (可选)安装 Python 依赖,抠图需要 torch + BiRefNet
# 参考 scripts/ 目录下的 requirements

# 3. 启动
npm start

# 4. 访问
open http://localhost:5177
```

## 工具列表(独立 URL 路由)

| URL | 工具 | 依赖 |
|----|------|------|
| `/` | 首页(工具卡片) | — |
| `/tools/character` | AI 生图 | 豆包 Seedream / MiniMax / OpenAI |
| `/tools/cutout` | 图片抠图(单张或多张) | OpenCV + U2Net-p / BiRefNet(本地) |
| `/tools/motion` | 动作视频 | 豆包 Seedance |
| `/tools/frames` | 视频抽帧 | FFmpeg + U2Net-p / BiRefNet(本地) |

切换工具:点击 topbar 右侧工具下拉按钮,或在首页点工具卡片。

## 抠图模式(本地)

| 模式 | 说明 | 速度 | 适用 |
|------|------|------|------|
| `color` | 快速绿幕/白幕检测 | < 0.1s | 背景纯色角色图 |
| `birefnet` | BiRefNet 主体分割 | 2-5s(GPU) | 复杂背景,白/绿衣角色 |
| `none` | 仅尺寸归一化 | < 0.1s | 不需要抠图 |

**多图抠图**:选 N 张图上传,后端单次 spawn Python 进程,BiRefNet 模型只加载一次,内部循环推理。比 N 次单图调用快 3-5x。

`.env` 关键项:
```env
BACKGROUND_MODE=auto
BIREFNET_MODEL=ZhengPeng7/BiRefNet
BIREFNET_DEVICE=auto    # 服务启动时自动检测 NVIDIA GPU
HF_ENDPOINT=https://hf-mirror.com    # 国内镜像,加速首次下载
```

## 序列帧动画(分帧完成后)

抽帧结果自动加载到序列帧预览器:
- **大画布 + 棋盘格底**(透明 PNG 友好)
- **时间轴拖拽**:每帧一个可拖动 handle,调整间距控制动作节奏
- **总时长 / 循环 / 来回播放** 三个控制
- **"等间距"按钮**:一键重置为平均分布

## Mock 模式(无 API 密钥)

```env
MOCK_AI=true
```

可完整跑通生图/视频/抽帧/抠图流程,生成器用占位图(开发联调用)。

## 真实 API 模式

```env
MOCK_AI=false
ARK_API_KEY=your_volcengine_ark_api_key
MINIMAX_API_KEY=...
OPENAI_API_KEY=...
```

模型选择(`.env`):
- `SEEDREAM_MODEL=doubao-seedream-5-0-260128`(豆包,主用)
- `SEEDANCE_MODEL=doubao-seedance-1-5-pro-251215`(豆包视频)
- `MINIMAX_IMAGE_MODEL=image-01`,`MINIMAX_VIDEO_MODEL=MiniMax-Hailuo-2.3-Fast`
- `OPENAI_IMAGE_MODEL=gpt-image-2`

成本控制(`SEEDANCE_DURATION` / `SEEDANCE_RESOLUTION`):
- 时长默认 5s,测试时改 4s
- 分辨率默认 720p,cheap draft 用 480p,final 才用 1080p
- 帧率固定约 24fps(API 限制),不在 UI 暴露 15/20/30 fps

## 数据流

```
用户上传 → /api/* 路由 → server spawn Python 脚本 → 云端 API 或本地模型
                                       ↓
                                  staging/<character>/<action>/
                                       ↓
                            用户点"下载" → exports/
```

所有 AI 产物先入 `staging/`,用户主动点"下载/保存"才进 `exports/`,避免 exports 目录被无效生成污染。

## 目录结构

```
2DGame_Tool/
├── server/index.js          # Node 主服务
├── public/                  # 前端
│   ├── index.html           # 单页(hero + 6 工具 + 路由)
│   ├── styles.css           # 浅色主题 + 棋盘格 + 序列帧样式
│   └── app.js               # 路由 + 工具逻辑 + 序列帧播放器
├── scripts/                 # Python 处理
│   ├── process_image.py           # 单图抠图
│   ├── process_image_batch.py     # 批量抠图(单进程,模型复用)
│   ├── process_video.py           # 视频抽帧
│   └── extract_manual_frames.py   # 手动抽帧
├── staging/                 # AI 产物暂存
├── exports/                 # 用户下载的成品
├── uploads/                 # 临时上传
└── data/                    # 历史任务数据
```

## 端口

5177(可改 `.env` 的 `PORT`)

## 文件编码

本仓库所有源码与文档统一使用 **UTF-8(无 BOM)**。浏览器中中文显示正常。
若在 Windows 终端(默认 GBK / 代码页 936)直接 `type README.md` 看到乱码,
这是终端解码问题而非文件损坏,执行 `chcp 65001` 切到 UTF-8 即可正常显示;
VS Code / 现代编辑器会自动识别,无需额外设置。

## 详细文档

- [WORK_LOG.md](WORK_LOG.md) — 产品化迭代记录(阶段 A → H)
- [CLAUDE.md](CLAUDE.md) — 协作约定(本仓库由 Claude Code 维护)

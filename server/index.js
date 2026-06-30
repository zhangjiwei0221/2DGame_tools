import http from "node:http";
import fs from "node:fs/promises";
import { existsSync, createReadStream, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { handleAuthRoute, initAuth } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "data");
const exportDir = path.join(rootDir, "exports");
const stagingDir = path.join(rootDir, "staging");
const tmpDir = path.join(rootDir, "tmp");
const uploadDir = path.join(rootDir, "uploads");
const jobStorePath = path.join(dataDir, "jobs.json");
const defaultSeedreamModel = "doubao-seedream-5-0-260128";
const defaultMinimaxImageModel = "image-01";
const defaultOpenAIImageModel = "gpt-image-2";

const env = await loadEnv();
let pythonEnv = { ...env, PYTHONIOENCODING: "utf-8" };
const port = Number(env.PORT || 5177);
const jobs = new Map();

await Promise.all([ensureDir(dataDir), ensureDir(exportDir), ensureDir(stagingDir), ensureDir(tmpDir), ensureDir(uploadDir)]);
await initAuth({ dataDir });
await loadStoredJobs();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const authHandled = await handleAuthRoute(req, res, url, { readJson, json, getClientIp });
    if (authHandled !== false) return authHandled;
    if (req.method === "GET" && url.pathname === "/api/config") {
      return json(res, {
        mock: isMock(),
        hasApiKey: Boolean(env.ARK_API_KEY),
        hasMiniMaxKey: Boolean(env.MINIMAX_API_KEY),
        hasOpenAIKey: Boolean(env.OPENAI_API_KEY),
        seedreamModel: env.SEEDREAM_MODEL || defaultSeedreamModel,
        minimaxImageModel: env.MINIMAX_IMAGE_MODEL || defaultMinimaxImageModel,
        openaiImageModel: env.OPENAI_IMAGE_MODEL || defaultOpenAIImageModel,
        seedanceModel: env.SEEDANCE_MODEL,
        seedanceRatio: env.SEEDANCE_RATIO || "16:9",
        seedanceDuration: Number(env.SEEDANCE_DURATION || 5),
        seedanceResolution: env.SEEDANCE_RESOLUTION || "720p"
      });
    }
    if (req.method === "POST" && url.pathname === "/api/workflows") {
      const body = await readRequestBody(req);
      const job = createJob(body);
      runWorkflow(job).catch((error) => failJob(job.id, error));
      return json(res, { jobId: job.id });
    }
    if (req.method === "POST" && url.pathname === "/api/prompt-preview") {
      const body = await readRequestBody(req);
      return json(res, createPromptPreview(body));
    }
    if (req.method === "POST" && url.pathname === "/api/characters") {
      const body = await readRequestBody(req);
      const result = await createCharacterOnly(body);
      return json(res, result);
    }
    if (req.method === "POST" && url.pathname === "/api/prepare-video") {
      const body = await readRequestBody(req);
      const result = await prepareUploadedVideo(body);
      return json(res, result);
    }
    if (req.method === "POST" && url.pathname === "/api/cutout-image") {
      const body = await readRequestBody(req);
      const job = createCutoutJob(body);
      runCutoutWorkflow(job).catch((error) => failJob(job.id, error));
      return json(res, { jobId: job.id });
    }
    if (req.method === "POST" && url.pathname === "/api/batch-cutout") {
      const body = await readRequestBody(req);
      const job = createBatchCutoutJob(body);
      runBatchCutoutWorkflow(job).catch((error) => failJob(job.id, error));
      return json(res, { jobId: job.id });
    }
    if (req.method === "POST" && url.pathname === "/api/ui-batch") {
      const body = await readRequestBody(req);
      const job = await createUiBatchJob(body);
      runUiBatchWorkflow(job).catch((error) => failJob(job.id, error));
      return json(res, { jobId: job.id });
    }
    if (req.method === "POST" && url.pathname === "/api/manual-export") {
      const body = await readJson(req);
      const result = await exportManualFrames(body);
      return json(res, result);
    }
    if (req.method === "POST" && url.pathname === "/api/auto-export") {
      const body = await readJson(req);
      const result = await exportAutoFrames(body);
      return json(res, result);
    }
    if (req.method === "POST" && url.pathname === "/api/download-zip") {
      const dir = url.searchParams.get("dir");
      return serveZip(res, dir);
    }
    if (req.method === "POST" && url.pathname === "/api/save-staging") {
      const body = await readJson(req);
      return json(res, await moveStagingToExport(body));
    }
    if (req.method === "POST" && url.pathname === "/api/open-folder") {
      const body = await readJson(req);
      const target = safeExportPath(body.path);
      if (!target || !existsSync(target)) {
        return json(res, { error: "目录不存在或路径不合法" }, 400);
      }
      // Windows explorer /select,"<path>" 高亮指定文件;目录 fallback 到 explorer.exe
      const isWin = process.platform === "win32";
      let cmd, args;
      if (isWin) {
        const isFile = existsSync(target) && (await fs.stat(target)).isFile();
        if (isFile) {
          cmd = "explorer.exe";
          args = [`/select,${target}`];
        } else {
          cmd = "explorer.exe";
          args = [target];
        }
      } else {
        cmd = "open";
        args = [target];
      }
      try {
        spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
        return json(res, { ok: true, path: path.relative(rootDir, target) });
      } catch (err) {
        return json(res, { error: err.message || "打开文件夹失败" }, 500);
      }
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/jobs/")) {
      const id = url.pathname.split("/").pop();
      const job = jobs.get(id);
      if (!job) return json(res, { error: "Job not found" }, 404);
      return json(res, job);
    }
    if (req.method === "POST" && /^\/api\/jobs\/[^/]+\/cancel$/.test(url.pathname)) {
      const id = url.pathname.split("/")[3];
      const job = jobs.get(id);
      if (!job) return json(res, { error: "Job not found" }, 404);
      job.cancelled = true;
      job.status = "cancelled";
      job.step = "用户已取消";
      job.updatedAt = new Date().toISOString();
      persistJobs().catch(() => {});
      return json(res, { ok: true, id, status: "cancelled" });
    }
    if (req.method === "GET" && url.pathname === "/api/jobs") {
      return json(res, [...jobs.values()].map((job) => ({
        id: job.id,
        status: job.status,
        step: job.step,
        progress: job.progress,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        input: {
          videoModel: job.input.videoModel,
          workflowAction: job.input.workflowAction,
          videoDuration: job.input.videoDuration,
          videoRatio: job.input.videoRatio,
          videoResolution: job.input.videoResolution
        },
        logs: job.logs.slice(-8),
        error: job.error
      })));
    }
    if (req.method === "GET" && url.pathname.startsWith("/staging/")) {
      return serveFile(req, res, decodeURIComponent(url.pathname.replace("/staging/", "")));
    }
    if (req.method === "GET" && url.pathname.startsWith("/files/")) {
      return serveFile(req, res, decodeURIComponent(url.pathname.replace("/files/", "")));
    }
    return serveStatic(req, res, url);
  } catch (error) {
    return json(res, { error: error.message || String(error) }, error.status || 500);
  }
});

server.listen(port, () => {
  console.log(`2D Game AI Workflow running at http://localhost:${port}`);
});
resumePendingJobs().catch((error) => console.error("Resume jobs failed:", error));

async function loadEnv() {
  const result = { ...process.env };
  const envPath = path.join(rootDir, ".env");
  if (existsSync(envPath)) {
    const text = await fs.readFile(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      result[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
    }
  }
  // 自动检测 GPU：未显式设置 BIREFNET_DEVICE 时,有 NVIDIA 显卡就用 cuda,否则强制 cpu
  if (!result.BIREFNET_DEVICE || result.BIREFNET_DEVICE === "auto") {
    result.BIREFNET_DEVICE = (await detectNvidiaGpu()) ? "cuda" : "cpu";
  }
  return result;
}

function detectNvidiaGpu() {
  return new Promise((resolve) => {
    const proc = spawn("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    proc.stdout.on("data", (chunk) => stdout += chunk.toString());
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => {
      if (code !== 0) return resolve(false);
      const name = stdout.trim().split(/\r?\n/)[0] || "";
      resolve(Boolean(name));
    });
  });
}

function isMock() {
  return String(env.MOCK_AI ?? "true").toLowerCase() !== "false" || !env.ARK_API_KEY;
}

function createJob(body) {
  const id = randomUUID();
  const fields = body.fields || body;
  const files = body.files || {};
  const job = {
    id,
    status: "queued",
    step: "Preparing workflow",
    progress: 0,
    createdAt: new Date().toISOString(),
    input: {
      characterName: sanitizeName(fields.characterName || "hero"),
      actionName: sanitizeName(fields.actionName || "action"),
      characterPrompt: fields.characterPrompt || "",
      actionPrompt: fields.actionPrompt || "",
      negativePrompt: fields.negativePrompt || "",
      imageSize: sanitizeImageSize(fields.imageSize || "1024x1024"),
      cameraView: sanitizeCameraView(fields.cameraView || "side"),
      workflowAction: sanitizeWorkflowAction(fields.workflowAction || "full"),
      frameCount: clampInt(fields.frameCount, 12, 1, 240),
      extractMode: fields.extractMode === "fps" ? "fps" : "count",
      sampleFps: clampFloat(fields.sampleFps, 1, 0.1, 60),
      startSec: optionalNumber(fields.startSec),
      endSec: optionalNumber(fields.endSec),
      outputFormat: fields.outputFormat === "jpg" ? "jpg" : "png",
      jpgQuality: clampInt(fields.jpgQuality, 90, 1, 100),
      backgroundMode: sanitizeBackgroundMode(fields.backgroundMode || env.UI_BACKGROUND_MODE || "auto"),
      imageModel: sanitizeImageModel(fields.imageModel || env.SEEDREAM_MODEL || defaultSeedreamModel),
      videoModel: sanitizeVideoModel(fields.videoModel || env.SEEDANCE_MODEL || "doubao-seedance-1-5-pro-251215"),
      videoDuration: clampInt(fields.videoDuration, clampInt(env.SEEDANCE_DURATION, 5, 4, 15), 4, 15),
      videoRatio: sanitizeRatio(fields.videoRatio || env.SEEDANCE_RATIO || "16:9"),
      videoResolution: sanitizeResolution(fields.videoResolution || env.SEEDANCE_RESOLUTION || "720p"),
      actionReferenceVideoUrl: sanitizeOptionalUrl(fields.actionReferenceVideoUrl || ""),
      characterReference: files.characterReference?.path || null,
      characterReferences: collectFilePaths(files.characterReferences),
      referenceRoles: parseReferenceRoles(fields.referenceRoles),
      finalVideo: files.finalVideo?.path || files.motionReference?.path || null
    },
    result: null,
    error: null,
    logs: []
  };
  jobs.set(id, job);
  persistJobs().catch(() => {});
  return job;
}

function createCutoutJob(body) {
  const id = randomUUID();
  const fields = body.fields || {};
  const files = body.files || {};
  const job = {
    id,
    status: "queued",
    step: "图片已上传，等待抠图",
    progress: 0,
    createdAt: new Date().toISOString(),
    input: {
      actionName: sanitizeName(fields.actionName || fields.characterName || "cutout"),
      outputFormat: fields.outputFormat === "jpg" ? "jpg" : "png",
      jpgQuality: clampInt(fields.jpgQuality, 90, 1, 100),
      backgroundMode: sanitizeBackgroundMode(fields.backgroundMode || env.BACKGROUND_MODE || "u2netp"),
      cutoutImage: files.cutoutImage?.path || null
    },
    result: null,
    error: null,
    logs: []
  };
  jobs.set(id, job);
  persistJobs().catch(() => {});
  return job;
}

async function createUiBatchJob(body) {
  const id = randomUUID();
  const fields = body.fields || {};
  const files = body.files || {};
  const batchFile = files.uiBatchFile?.path || null;
  const rows = batchFile ? await parseUiBatchRowsFromFile(batchFile) : parseUiBatchRows(fields.uiBatchText || "");
  const batchName = sanitizeName(fields.uiBatchName || `ui_batch_${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15).replace("T", "_")}`);
  const job = {
    id,
    status: "queued",
    step: `已读取 ${rows.length} 个 UI 素材任务`,
    progress: 0,
    createdAt: new Date().toISOString(),
    input: {
      batchName,
      globalStyle: fields.uiGlobalStyle || "",
      imageModel: sanitizeImageModel(fields.imageModel || env.SEEDREAM_MODEL || defaultSeedreamModel),
      outputFormat: fields.outputFormat === "jpg" ? "jpg" : "png",
      jpgQuality: clampInt(fields.jpgQuality, 90, 1, 100),
      backgroundMode: sanitizeBackgroundMode(fields.backgroundMode || env.BACKGROUND_MODE || "u2netp"),
      cutoutAfterGenerate: parseBool(fields.uiCutoutAfterGenerate, true),
      negativePrompt: fields.negativePrompt || "",
      rows
    },
    result: null,
    error: null,
    logs: []
  };
  if (!rows.length) throw new Error("表格里没有可生成的 UI 素材。至少需要一行 prompt。");
  jobs.set(id, job);
  persistJobs().catch(() => {});
  return job;
}

async function loadStoredJobs() {
  if (!existsSync(jobStorePath)) return;
  try {
    const stored = JSON.parse(await fs.readFile(jobStorePath, "utf8"));
    for (const job of Array.isArray(stored) ? stored : []) {
      if (job?.id) jobs.set(job.id, job);
    }
  } catch (error) {
    console.error("Could not load stored jobs:", error.message || error);
  }
}

async function persistJobs() {
  const compact = [...jobs.values()].slice(-30);
  await fs.writeFile(jobStorePath, JSON.stringify(compact, null, 2), "utf8");
}

async function resumePendingJobs() {
  for (const job of jobs.values()) {
    if (job.status === "running" && job.arkTaskId && !job.result?.video) {
      continueVideoPolling(job, path.join(dataDir, `${job.id}_action.mp4`)).catch((error) => failJob(job.id, error));
    }
    if (job.status === "running" && job.minimaxTaskId && !job.result?.video) {
      continueMinimaxVideoPolling(job, path.join(dataDir, `${job.id}_action.mp4`)).catch((error) => failJob(job.id, error));
    }
  }
}

async function runWorkflow(job) {
  let characterPath = null;
  if (job.input.characterReference || !job.input.finalVideo) {
    update(job, "running", "Preparing character reference", 10);
    characterPath = await generateCharacter(job);
  } else {
    update(job, "running", "Using uploaded final video", 10);
    job.logs.push("Final video uploaded; character generation skipped.");
  }

  update(job, "running", "Preparing action video", 35);
  const videoPath = await generateVideo(job, characterPath);
  const videoInfo = await probeVideoInfo(videoPath);
  if (videoInfo) {
    job.logs.push(`Actual video: ${videoInfo.width}x${videoInfo.height}, ${videoInfo.fps.toFixed(2)}fps, ${videoInfo.duration.toFixed(2)}s.`);
  }

  if (job.input.workflowAction === "video") {
    job.result = {
      exportDir: "",
      video: toPublicPath(videoPath),
      videoInfo,
      preview: "",
      frames: [],
      manifest: "",
      zip: ""
    };
    update(job, "complete", "Video ready for frame extraction", 100);
    return;
  }

  update(job, "running", "Extracting and normalizing frames", 70);
  const result = await processVideo(job, videoPath);

  job.result = result;
  const outDir = path.join(stagingDir, job.input.characterName, job.input.actionName);
  const archived = await archiveArtifacts({
    mode: "frames",
    name: `${job.input.characterName}_${job.input.actionName}`,
    sourceDir: outDir,
  });
  if (archived) {
    job.result.exportDir = archived.relPath;
    job.result.exportAbs = archived.absPath;
  }
  update(job, "complete", "Export complete", 100);
}

async function createCharacterOnly(body) {
  const job = createJob(body);
  update(job, "running", "Generating character image", 20);
  const characterPath = await generateCharacter(job);
  const archived = await archiveArtifacts({
    mode: "character",
    name: job.input.characterName,
    sourceDir: path.dirname(characterPath),
  });
  const result = {
    image: toPublicPath(characterPath),
    staging: archived?.relPath || "",
    exportDir: archived?.relPath || toPublicPath(path.dirname(characterPath)),
    exportAbs: archived?.absPath || path.dirname(characterPath),
    model: isMock() ? "mock" : job.input.imageModel
  };
  job.result = result;
  update(job, "complete", "Character image ready", 100);
  return result;
}

async function generateCharacter(job) {
  const outPath = path.join(dataDir, `${job.id}_character.png`);

  if (isMock()) {
    if (job.input.characterReference) {
      await fs.copyFile(job.input.characterReference, outPath);
      job.logs.push("Used uploaded character reference.");
      return outPath;
    }
    await runPython(["scripts/generate_mock_assets.py", "character", "--out", outPath, "--name", job.input.characterName]);
    job.logs.push("Used mock character generator.");
    return outPath;
  }

  const hasReferences = (job.input.characterReferences && job.input.characterReferences.length) || job.input.characterReference;
  if (!job.input.characterPrompt.trim() && !hasReferences) {
    throw new Error("请上传参考图或填写描述。");
  }

  const roleLabels = { style: "风格", character: "主体", composition: "构图", first_frame: "首帧" };
  const references = collectReferencePayload(job);
  const refHint = references.length
    ? references.map((ref, i) => `参考图${i + 1}(${roleLabels[ref.role] || "参考"}):按该图${roleLabels[ref.role] || "参考"}理解`).join("；")
    : "";
  const prompt = [
    job.input.characterPrompt,
    refHint,
    "2D game art asset, clean composition, clear silhouette, transparent background, no scenery clutter, no text"
  ].filter(Boolean).join(". ");
  await generateImageAsset({
    prompt,
    size: job.input.imageSize || "1024x1024",
    outPath,
    imageModel: job.input.imageModel,
    negativePrompt: job.input.negativePrompt || "",
    references
  });
  return outPath;
}

function collectReferencePayload(job) {
  const refs = [];
  if (Array.isArray(job.input.characterReferences)) {
    job.input.characterReferences.forEach((path, i) => {
      const role = job.input.referenceRoles?.[i] || "character";
      refs.push({ path, role });
    });
  }
  if (job.input.characterReference) {
    refs.push({ path: job.input.characterReference, role: "character" });
  }
  return refs;
}

async function generateVideo(job, characterPath) {
  const outPath = path.join(dataDir, `${job.id}_action${job.input.finalVideo ? path.extname(job.input.finalVideo) || ".mp4" : ".mp4"}`);
  if (job.input.finalVideo) {
    await fs.copyFile(job.input.finalVideo, outPath);
    job.logs.push("Used uploaded final video.");
    return outPath;
  }
  if (isMock()) {
    await runPython([
      "scripts/generate_mock_assets.py",
      "video",
      "--out",
      outPath,
      "--character",
      characterPath,
      "--frames",
      String(Math.max(24, job.input.frameCount * 4))
    ]);
    job.logs.push("Used mock video generator.");
    return outPath;
  }
  if (!characterPath) {
    throw new Error("Real video generation needs a character reference image or character description. If you only want frame extraction, upload a final video in step 01.");
  }
  if (isMinimaxVideoModel(job.input.videoModel)) {
    return generateMinimaxVideo(job, characterPath, outPath);
  }

  const imageData = await fs.readFile(characterPath);
  const imageUrl = `data:image/png;base64,${imageData.toString("base64")}`;
  const actionVideoUrl = await prepareReferenceVideoUrl(job);
  const imageRole = getSeedanceImageRole(job.input.videoModel);
  const prompt = buildVideoPrompt(job.input, Boolean(actionVideoUrl));
  const content = [
    { type: "text", text: prompt },
    {
      type: "image_url",
      image_url: { url: imageUrl },
      role: imageRole
    }
  ];
  if (actionVideoUrl) {
    content.push({
      type: "video_url",
      video_url: { url: actionVideoUrl },
      role: "reference_video"
    });
    job.logs.push("Action reference video attached to AI request.");
  }

  const createPayload = {
    model: job.input.videoModel,
    content,
    generate_audio: parseBool(env.SEEDANCE_GENERATE_AUDIO, false),
    ratio: job.input.videoRatio,
    duration: job.input.videoDuration,
    resolution: job.input.videoResolution,
    watermark: parseBool(env.SEEDANCE_WATERMARK, false)
  };
  job.logs.push(`Video settings: ${job.input.videoResolution}, ${job.input.videoDuration}s, official output is about 24fps.`);
  const createData = await arkFetch("/contents/generations/tasks", createPayload);
  const taskId = createData?.id || createData?.task_id;
  if (!taskId) throw new Error(`Video task returned no task ID: ${JSON.stringify(createData)}`);
  job.logs.push(`Ark video task submitted: ${taskId}`);
  job.arkTaskId = taskId;
  update(job, "running", `Video task submitted: ${taskId}`, 42);
  return continueVideoPolling(job, outPath);
}

async function prepareReferenceVideoUrl(job) {
  if (job.input.actionReferenceVideoUrl) {
    await validateReferenceVideoUrl(job.input.actionReferenceVideoUrl);
    return job.input.actionReferenceVideoUrl;
  }
  return "";
}

async function generateMinimaxVideo(job, characterPath, outPath) {
  if (!env.MINIMAX_API_KEY) {
    throw new Error("MiniMax API Key has not been configured. Please add MINIMAX_API_KEY to .env.");
  }
  if (job.input.actionReferenceVideoUrl) {
    job.logs.push("MiniMax image-to-video uses the character image plus text prompt; action reference video URL is ignored for this model.");
  }
  const firstFrameImage = await imageFileToPngDataUrl(characterPath);
  const prompt = buildVideoPrompt(job.input, false);
  const model = getMinimaxVideoModelName(job.input.videoModel);
  const duration = normalizeMinimaxVideoDuration(model, job.input.videoDuration);
  const resolution = normalizeMinimaxVideoResolution(model, job.input.videoResolution, duration);
  const payload = {
    model,
    prompt,
    first_frame_image: firstFrameImage,
    duration,
    resolution
  };
  job.logs.push(`MiniMax video settings: ${model}, ${resolution}, ${duration}s.`);
  const createData = await minimaxFetch("/v1/video_generation", payload);
  const taskId = createData?.task_id || createData?.taskId || createData?.data?.task_id || createData?.data?.taskId;
  if (!taskId) throw new Error(`MiniMax video task returned no task ID: ${JSON.stringify(createData)}`);
  job.minimaxTaskId = taskId;
  update(job, "running", `MiniMax video task submitted: ${taskId}`, 42);
  return continueMinimaxVideoPolling(job, outPath);
}

async function continueMinimaxVideoPolling(job, outPath) {
  const taskId = job.minimaxTaskId;
  const started = job.videoPollStartedAt ? Date.parse(job.videoPollStartedAt) : Date.now();
  job.videoPollStartedAt = job.videoPollStartedAt || new Date(started).toISOString();
  while (Date.now() - started < 20 * 60 * 1000) {
    await sleep(5000);
    const task = await minimaxGet(`/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`);
    const status = String(task?.status || task?.data?.status || "unknown");
    const elapsed = Math.round((Date.now() - started) / 1000);
    update(job, "running", `MiniMax video task ${taskId} status: ${status} (${elapsed}s)`, Math.min(88, 42 + Math.floor(elapsed / 10)));
    const fileId = task?.file_id || task?.fileId || task?.data?.file_id || task?.data?.fileId;
    if (fileId && ["success", "succeeded", "complete", "completed"].includes(status.toLowerCase())) {
      update(job, "running", "MiniMax video finished, downloading result", 92);
      const fileData = await minimaxGet(`/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`);
      const videoUrl = fileData?.file?.download_url || fileData?.file?.downloadUrl || fileData?.download_url || fileData?.downloadUrl;
      if (!videoUrl) throw new Error(`MiniMax file retrieve returned no download URL: ${JSON.stringify(fileData)}`);
      await downloadFile(videoUrl, outPath);
      return outPath;
    }
    if (["failed", "fail", "error", "cancelled", "canceled"].includes(status.toLowerCase())) {
      throw new Error(`MiniMax video generation failed: ${JSON.stringify(task)}`);
    }
  }
  throw new Error("MiniMax video generation timed out.");
}

async function validateReferenceVideoUrl(url) {
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { "Range": "bytes=0-2047" },
      redirect: "follow"
    });
  } catch {
    throw new Error("动作参考视频 URL 无法从本地服务访问。请确认它是公网可访问的 mp4 预签名下载链接，不是控制台页面地址。");
  }
  if (!response.ok && response.status !== 206) {
    throw new Error(`动作参考视频 URL 下载失败（HTTP ${response.status}）。请重新生成 TOS 预签名 URL，并确认链接没有过期、对象没有被私有权限拦截。`);
  }
  const contentType = response.headers.get("content-type") || "";
  const bytes = Buffer.from(await response.arrayBuffer());
  const looksLikeVideo = contentType.startsWith("video/") || isLikelyVideoBytes(bytes);
  if (!looksLikeVideo) {
    throw new Error(`动作参考视频 URL 访问到的不是视频文件（Content-Type: ${contentType || "未知"}）。请复制对象的下载链接或预签名 URL，不要复制控制台页面/分享页面。`);
  }
}

function isLikelyVideoBytes(bytes) {
  if (bytes.length < 12) return false;
  const text = bytes.toString("latin1", 0, Math.min(bytes.length, 64));
  return text.includes("ftyp") || text.includes("webm") || text.includes("moov") || text.includes("mdat");
}

async function continueVideoPolling(job, outPath) {
  const taskId = job.arkTaskId;
  const started = job.videoPollStartedAt ? Date.parse(job.videoPollStartedAt) : Date.now();
  job.videoPollStartedAt = job.videoPollStartedAt || new Date(started).toISOString();
  while (Date.now() - started < 15 * 60 * 1000) {
    await sleep(5000);
    const task = await arkGet(`/contents/generations/tasks/${taskId}`);
    const status = task?.status || task?.task_status;
    const elapsed = Math.round((Date.now() - started) / 1000);
    const statusText = `Video task ${taskId} status: ${status || "unknown"} (${elapsed}s)`;
    update(job, "running", statusText, Math.min(88, 42 + Math.floor(elapsed / 8)));
    const videoUrl = extractVideoUrl(task);
    if (videoUrl) {
      update(job, "running", "Video finished, downloading result", 92);
      await downloadFile(videoUrl, outPath);
      return outPath;
    }
    if (["failed", "cancelled", "error"].includes(String(status).toLowerCase())) {
      throw new Error(`Video generation failed: ${JSON.stringify(task)}`);
    }
  }
  throw new Error("Video generation timed out.");
}

async function processVideo(job, videoPath) {
  const outDir = path.join(stagingDir, job.input.characterName, job.input.actionName);
  await ensureDir(outDir);
  const args = [
    "scripts/process_video.py",
    "--input", videoPath,
    "--out-dir", outDir,
    "--character", job.input.characterName,
    "--action", job.input.actionName,
    "--frames", String(job.input.frameCount),
    "--mode", job.input.extractMode,
    "--sample-fps", String(job.input.sampleFps),
    "--output-format", job.input.outputFormat,
    "--jpg-quality", String(job.input.jpgQuality)
  ];
  args.push("--background-mode", job.input.backgroundMode);
  if (env.BIREFNET_MODEL) args.push("--birefnet-model", env.BIREFNET_MODEL);
  if (env.BIREFNET_DEVICE) args.push("--birefnet-device", env.BIREFNET_DEVICE);
  if (job.input.startSec !== null) args.push("--start-sec", String(job.input.startSec));
  if (job.input.endSec !== null) args.push("--end-sec", String(job.input.endSec));
  await runPython(args);

  const manifestPath = path.join(outDir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  return {
    exportDir: toStagingPath(outDir),
    video: toPublicPath(videoPath),
    videoInfo: await probeVideoInfo(videoPath),
    preview: toStagingPath(path.join(outDir, "preview.png")),
    frames: manifest.frames.map((file) => toStagingPath(path.join(outDir, file))),
    manifest: toStagingPath(manifestPath),
    staging: toStagingPath(outDir)
  };
}

async function exportManualFrames(body) {
  const videoPath = fromPublicPath(body.video);
  if (!videoPath || !existsSync(videoPath)) throw new Error("Video file not found for manual export.");
  const characterName = sanitizeName(body.characterName || "hero");
  const actionName = sanitizeName(body.actionName || "manual");
  const times = Array.isArray(body.times) ? body.times.map(Number).filter(Number.isFinite) : [];
  if (!times.length) throw new Error("Please capture at least one frame before exporting.");

  const outDir = path.join(stagingDir, characterName, actionName);
  await ensureDir(outDir);
  const args = [
    "scripts/extract_manual_frames.py",
    "--input", videoPath,
    "--out-dir", outDir,
    "--character", characterName,
    "--action", actionName,
    "--times", times.join(","),
    "--output-format", body.outputFormat === "jpg" ? "jpg" : "png",
    "--jpg-quality", String(clampInt(body.jpgQuality, 90, 1, 100))
  ];
  args.push("--background-mode", sanitizeBackgroundMode(body.backgroundMode || env.BACKGROUND_MODE || "birefnet"));
  if (env.BIREFNET_MODEL) args.push("--birefnet-model", env.BIREFNET_MODEL);
  if (env.BIREFNET_DEVICE) args.push("--birefnet-device", env.BIREFNET_DEVICE);
  await runPython(args);
  const manifestPath = path.join(outDir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const archived = await archiveArtifacts({
    mode: "frames",
    name: `${characterName}_${actionName}`,
    sourceDir: outDir,
  });
  return {
    exportDir: archived?.relPath || toStagingPath(outDir),
    exportAbs: archived?.absPath || outDir,
    video: toPublicPath(videoPath),
    videoInfo: await probeVideoInfo(videoPath),
    preview: toStagingPath(path.join(outDir, "preview.png")),
    frames: manifest.frames.map((file) => toStagingPath(path.join(outDir, file))),
    manifest: toStagingPath(manifestPath),
    staging: toStagingPath(outDir)
  };
}

async function exportAutoFrames(body) {
  const videoPath = fromPublicPath(body.video);
  if (!videoPath || !existsSync(videoPath)) throw new Error("Video file not found for auto export.");
  const characterName = sanitizeName(body.characterName || "sprite");
  const actionName = sanitizeName(body.actionName || "auto");
  const outDir = path.join(stagingDir, characterName, actionName);
  await ensureDir(outDir);

  const args = [
    "scripts/process_video.py",
    "--input", videoPath,
    "--out-dir", outDir,
    "--character", characterName,
    "--action", actionName,
    "--frames", String(clampInt(body.frameCount, 12, 1, 240)),
    "--mode", body.extractMode === "fps" ? "fps" : "count",
    "--sample-fps", String(clampFloat(body.sampleFps, 1, 0.1, 60)),
    "--output-format", body.outputFormat === "jpg" ? "jpg" : "png",
    "--jpg-quality", String(clampInt(body.jpgQuality, 90, 1, 100)),
    "--background-mode", sanitizeBackgroundMode(body.backgroundMode || env.BACKGROUND_MODE || "birefnet")
  ];
  const startSec = optionalNumber(body.startSec);
  const endSec = optionalNumber(body.endSec);
  if (env.BIREFNET_MODEL) args.push("--birefnet-model", env.BIREFNET_MODEL);
  if (env.BIREFNET_DEVICE) args.push("--birefnet-device", env.BIREFNET_DEVICE);
  if (startSec !== null) args.push("--start-sec", String(startSec));
  if (endSec !== null) args.push("--end-sec", String(endSec));
  await runPython(args);

  const manifestPath = path.join(outDir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  return {
    exportDir: toStagingPath(outDir),
    video: toPublicPath(videoPath),
    videoInfo: await probeVideoInfo(videoPath),
    preview: toStagingPath(path.join(outDir, "preview.png")),
    frames: manifest.frames.map((file) => toStagingPath(path.join(outDir, file))),
    manifest: toStagingPath(manifestPath),
    staging: toStagingPath(outDir)
  };
}

async function prepareUploadedVideo(body) {
  const fields = body.fields || {};
  const files = body.files || {};
  if (!files.finalVideo?.path && !files.motionReference?.path) throw new Error("Please upload a final video first.");
  const characterName = sanitizeName(fields.characterName || "hero");
  const actionName = sanitizeName(fields.actionName || "action");
  const sourceVideo = files.finalVideo?.path || files.motionReference?.path;
  const ext = path.extname(sourceVideo) || ".mp4";
  const videoPath = path.join(dataDir, `${randomUUID()}_uploaded${ext}`);
  await fs.copyFile(sourceVideo, videoPath);
  return {
    characterName,
    actionName,
    video: toPublicPath(videoPath),
    videoInfo: await probeVideoInfo(videoPath),
    message: "Uploaded video is ready for manual capture."
  };
}

async function runCutoutWorkflow(job) {
  if (!job.input.cutoutImage) throw new Error("请先上传一张图片。");
  const assetName = job.input.actionName || "cutout";
  const outDir = path.join(stagingDir, "cutouts", assetName);
  await ensureDir(outDir);
  update(job, "running", "图片已上传，正在准备抠图", 12);
  if (job.input.backgroundMode === "birefnet") {
    update(job, "running", "正在加载 BiRefNet 模型，首次运行可能需要几分钟", 24);
  } else {
    update(job, "running", "正在使用快速抠图处理图片", 35);
  }

  const args = [
    "scripts/process_image.py",
    "--input", job.input.cutoutImage,
    "--out-dir", outDir,
    "--asset", assetName,
    "--output-format", job.input.outputFormat,
    "--jpg-quality", String(job.input.jpgQuality),
    "--background-mode", job.input.backgroundMode
  ];
  if (env.BIREFNET_MODEL) args.push("--birefnet-model", env.BIREFNET_MODEL);
  if (env.BIREFNET_DEVICE) args.push("--birefnet-device", env.BIREFNET_DEVICE);
  await runPython(args, (line) => {
    const progress = parseProgressLine(line);
    if (progress) update(job, "running", progress.step, progress.percent);
  });
  update(job, "running", "正在保存透明图片", 90);

  const manifestPath = path.join(outDir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const imagePath = path.join(outDir, manifest.image);
  const archived = await archiveArtifacts({
    mode: "cutout",
    name: assetName,
    sourceDir: outDir,
  });
  job.result = {
    image: toStagingPath(imagePath),
    staging: toStagingPath(outDir),
    exportDir: archived?.relPath || toStagingPath(outDir),
    exportAbs: archived?.absPath || outDir,
    manifest: toStagingPath(manifestPath),
    backgroundMode: manifest.background_mode,
    sourceSize: manifest.source_size,
    outputSize: manifest.output_size
  };
  update(job, "complete", "图片抠图完成", 100);
}

function createBatchCutoutJob(body) {
  const id = randomUUID();
  const fields = body.fields || {};
  const files = body.files || {};
  const batchName = sanitizeName(fields.batchName || `batch_cutout_${Date.now()}`);
  const imagePaths = [];
  if (files.batchImages) {
    const list = Array.isArray(files.batchImages) ? files.batchImages : [files.batchImages];
    for (const f of list) {
      if (f?.path) imagePaths.push(f.path);
    }
  }
  if (!imagePaths.length) throw new Error("请上传至少一张要抠图的图片。");
  const job = {
    id,
    status: "queued",
    step: `已接收 ${imagePaths.length} 张图片，等待批量抠图`,
    progress: 0,
    createdAt: new Date().toISOString(),
    input: {
      batchName,
      imagePaths,
      outputFormat: fields.outputFormat === "jpg" ? "jpg" : "png",
      jpgQuality: clampInt(fields.jpgQuality, 90, 1, 100),
      backgroundMode: sanitizeBackgroundMode(fields.backgroundMode || env.BACKGROUND_MODE || "birefnet")
    },
    result: null,
    error: null,
    logs: []
  };
  jobs.set(id, job);
  persistJobs().catch(() => {});
  return job;
}

async function runBatchCutoutWorkflow(job) {
  const imagePaths = job.input.imagePaths;
  const outDir = path.join(stagingDir, "batch_cutouts", job.input.batchName);
  await ensureDir(outDir);
  update(job, "running", `准备批量抠图 ${imagePaths.length} 张图片`, 5);

  // 一次性把所有图片路径写入 manifest,让 Python 脚本在单个进程内复用模型
  const batchManifest = {
    batchName: job.input.batchName,
    outputFormat: job.input.outputFormat,
    items: imagePaths.map((p, i) => {
      const ext = path.extname(p) || ".png";
      const base = sanitizeName(path.basename(p, ext));
      return {
        index: i + 1,
        assetName: base,
        source: p,
        output: `${String(i + 1).padStart(3, "0")}_${base}.${job.input.outputFormat}`
      };
    })
  };
  const manifestInPath = path.join(outDir, "_input.json");
  await fs.writeFile(manifestInPath, JSON.stringify(batchManifest, null, 2), "utf8");

  // 单次 Python 调用,内循环复用同一个模型实例
  const args = [
    "scripts/process_image_batch.py",
    "--manifest", manifestInPath,
    "--out-dir", outDir,
    "--output-format", job.input.outputFormat,
    "--jpg-quality", String(job.input.jpgQuality),
    "--background-mode", job.input.backgroundMode
  ];
  if (env.BIREFNET_MODEL) args.push("--birefnet-model", env.BIREFNET_MODEL);
  if (env.BIREFNET_DEVICE) args.push("--birefnet-device", env.BIREFNET_DEVICE);

  await runPython(args, (line) => {
    const progress = parseProgressLine(line);
    if (progress) update(job, "running", progress.step, progress.percent);
  });

  // Python 把更新后的 batch 写回输入 manifest,我们再拷一份到 out-dir
  const manifestPath = path.join(outDir, "manifest.json");
  const updated = JSON.parse(await fs.readFile(manifestInPath, "utf8"));
  await fs.writeFile(manifestPath, JSON.stringify(updated, null, 2), "utf8");

  const results = (updated.items || []).map((item) => ({
    status: "complete",
    assetName: item.assetName,
    image: toStagingPath(path.join(outDir, item.output)),
    exportDir: toStagingPath(outDir),
    manifest: toStagingPath(manifestPath),
    sourceSize: item.source_size
  }));

  update(job, "running", "正在生成批量预览", 96);
  const completeCount = results.length;
  await fs.writeFile(
    manifestPath,
    JSON.stringify({
      batchName: job.input.batchName,
      backgroundMode: job.input.backgroundMode,
      outputFormat: job.input.outputFormat,
      total: imagePaths.length,
      complete: completeCount,
      results
    }, null, 2),
    "utf8"
  );
  const archived = await archiveArtifacts({
    mode: "cutout",
    name: job.input.batchName,
    sourceDir: outDir,
  });
  job.result = {
    staging: toStagingPath(outDir),
    exportDir: archived?.relPath || toStagingPath(outDir),
    exportAbs: archived?.absPath || outDir,
    manifest: toStagingPath(manifestPath),
    batchResults: results
  };
  update(job, "complete", `批量抠图完成: ${completeCount}/${imagePaths.length}`, 100);
}

async function runUiBatchWorkflow(job) {
  const rows = job.input.rows || [];
  const batchDir = path.join(stagingDir, "ui_batches", job.input.batchName);
  const generatedDir = path.join(batchDir, "_generated");
  const cutoutDir = path.join(batchDir, "cutouts");
  await ensureDir(batchDir);
  await ensureDir(generatedDir);
  if (job.input.cutoutAfterGenerate) await ensureDir(cutoutDir);
  update(job, "running", `准备生成 ${rows.length} 个 UI 素材`, 5);

  const assets = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const progress = Math.round(8 + (index / rows.length) * 84);
    update(job, "running", `正在生成 ${index + 1}/${rows.length}: ${row.assetName}`, progress);
    try {
      const prompt = buildUiAssetPrompt(job.input.globalStyle, row);
      const generatedName = `${String(index + 1).padStart(3, "0")}_${sanitizeName(row.assetName)}_source.png`;
      const generatedPath = path.join(generatedDir, generatedName);
      await generateUiAssetImage(prompt, row.size, generatedPath, row.assetName, job.input.imageModel, job.input.negativePrompt);
      const ext = job.input.outputFormat === "jpg" ? "jpg" : "png";
      const fileName = `${String(index + 1).padStart(3, "0")}_${sanitizeName(row.assetName)}.${ext}`;
      assets.push({
        status: "complete",
        assetName: row.assetName,
        type: row.type,
        size: row.size,
        prompt,
        file: fileName,
        url: toPublicPath(path.join(job.input.cutoutAfterGenerate ? cutoutDir : generatedDir, job.input.cutoutAfterGenerate ? fileName : generatedName)),
        generatedFile: `_generated/${generatedName}`,
        generatedUrl: toPublicPath(generatedPath),
        cutout: job.input.cutoutAfterGenerate
      });
    } catch (error) {
      assets.push({
        status: "failed",
        assetName: row.assetName,
        type: row.type,
        size: row.size,
        prompt: buildUiAssetPrompt(job.input.globalStyle, row),
        error: error.message || String(error)
      });
      job.logs.push(`${row.assetName} failed: ${error.message || error}`);
    }
  }

  const manifestPath = path.join(batchDir, "manifest.json");
  const completeAssets = assets.filter((asset) => asset.status === "complete");
  if (job.input.cutoutAfterGenerate && completeAssets.length) {
    update(job, "running", `正在批量抠图 ${completeAssets.length} 张素材`, 92);
    await cutoutUiBatchAssets(job, batchDir, cutoutDir, completeAssets, manifestPath);
  }
  const previewPath = completeAssets.length ? await makeUiBatchPreview(batchDir, completeAssets) : "";
  await fs.writeFile(manifestPath, JSON.stringify({
    batchName: job.input.batchName,
    globalStyle: job.input.globalStyle,
    imageModel: job.input.imageModel,
    cutoutAfterGenerate: job.input.cutoutAfterGenerate,
    backgroundMode: job.input.cutoutAfterGenerate ? job.input.backgroundMode : "none",
    outputFormat: job.input.cutoutAfterGenerate ? job.input.outputFormat : "png",
    outputDir: job.input.cutoutAfterGenerate ? "cutouts" : "_generated",
    sourceDir: "_generated",
    total: rows.length,
    complete: completeAssets.length,
    failed: assets.length - completeAssets.length,
    assets
  }, null, 2), "utf8");

  const archived = await archiveArtifacts({
    mode: "ui-batch",
    name: job.input.batchName,
    sourceDir: batchDir,
  });
  job.result = {
    staging: toStagingPath(batchDir),
    exportDir: archived?.relPath || toStagingPath(batchDir),
    exportAbs: archived?.absPath || batchDir,
    preview: previewPath ? toStagingPath(previewPath) : "",
    manifest: toStagingPath(manifestPath),
    uiAssets: assets
  };
  update(job, completeAssets.length ? "complete" : "failed", `批量 UI 素材完成：${completeAssets.length}/${rows.length}`, 100);
}

async function cutoutUiBatchAssets(job, batchDir, cutoutDir, assets, manifestPath) {
  const items = assets.map((asset) => ({
    assetName: asset.assetName,
    source: path.join(batchDir, asset.generatedFile),
    output: asset.file
  }));
  await fs.writeFile(manifestPath, JSON.stringify({ items }, null, 2), "utf8");
  const args = [
    "scripts/process_image_batch.py",
    "--manifest", manifestPath,
    "--out-dir", cutoutDir,
    "--output-format", job.input.outputFormat,
    "--jpg-quality", String(job.input.jpgQuality),
    "--background-mode", job.input.backgroundMode
  ];
  if (env.BIREFNET_MODEL) args.push("--birefnet-model", env.BIREFNET_MODEL);
  if (env.BIREFNET_DEVICE) args.push("--birefnet-device", env.BIREFNET_DEVICE);
  await runPython(args, (line) => {
    const progress = parseProgressLine(line);
    if (progress) update(job, "running", progress.step, Math.max(92, Math.min(progress.percent, 98)));
  });
  const cutoutManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const byName = new Map((cutoutManifest.items || []).map((item) => [item.assetName, item]));
  for (const asset of assets) {
    const item = byName.get(asset.assetName);
    if (!item) continue;
    asset.outputSize = item.output_size;
    asset.sourceSize = item.source_size;
    asset.backgroundMode = job.input.backgroundMode;
    asset.cutout = true;
    asset.file = `cutouts/${item.output}`;
    asset.url = toPublicPath(path.join(cutoutDir, item.output));
  }
}

async function generateUiAssetImage(prompt, size, outPath, assetName, imageModel, negativePrompt = "") {
  if (isMock()) {
    await runPython(["scripts/generate_mock_assets.py", "character", "--out", outPath, "--name", assetName]);
    return;
  }
  await generateImageAsset({ prompt, size, outPath, imageModel, negativePrompt });
}

async function generateImageAsset({ prompt, size, outPath, imageModel, negativePrompt = "", references = [], referenceImage = "" }) {
  // 向后兼容:老调用可能只传 referenceImage 单字段
  const refs = references.length ? references : (referenceImage ? [{ path: referenceImage, role: "character" }] : []);
  if (isOpenAIImageModel(imageModel)) {
    await generateOpenAIImage(prompt, size, outPath, imageModel, negativePrompt, refs);
    return;
  }
  if (isMinimaxImageModel(imageModel)) {
    await generateMinimaxImage(prompt, size, outPath, imageModel, negativePrompt, refs);
    return;
  }
  await generateSeedreamImage(prompt, size, outPath, imageModel, negativePrompt, refs);
}

async function generateSeedreamImage(prompt, size, outPath, imageModel, negativePrompt = "", references = []) {
  const payload = {
    model: imageModel || defaultSeedreamModel,
    prompt,
    response_format: "url",
    size: getSeedreamSize(imageModel, size)
  };
  if (negativePrompt && negativePrompt.trim()) payload.negative_prompt = negativePrompt.trim();
  if (references && references.length) {
    // Seedream API: image 接受字符串或字符串数组 (URL/base64)
    const images = await Promise.all(references.map((ref) => filePathToDataUrl(ref.path)));
    payload.image = images.length === 1 ? images[0] : images;
  }
  const data = await arkFetch("/images/generations", payload);
  const imageUrl = data?.data?.[0]?.url || data?.url;
  if (!imageUrl) throw new Error(`Image generation returned no image URL: ${JSON.stringify(data)}`);
  await downloadFile(imageUrl, outPath);
}

async function filePathToDataUrl(filePath) {
  const data = await fs.readFile(filePath);
  return `data:image/png;base64,${Buffer.from(data).toString("base64")}`;
}

async function generateOpenAIImage(prompt, size, outPath, imageModel, negativePrompt = "", references = []) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OpenAI API Key has not been configured. Please add OPENAI_API_KEY to .env.");
  }
  const model = getOpenAIModelName(imageModel);
  const effectivePrompt = negativePrompt && negativePrompt.trim()
    ? `${prompt}. Avoid: ${negativePrompt.trim()}.`
    : prompt;
  const payload = {
    model,
    prompt: effectivePrompt,
    size: getOpenAIImageSize(model, size),
    quality: env.OPENAI_IMAGE_QUALITY || "low",
    n: 1
  };
  if (references && references.length) {
    // OpenAI gpt-image 系列支持多张参考图;取全部 base64
    payload.image = await Promise.all(references.map((ref) => filePathToDataUrl(ref.path)));
  }
  const data = await openaiFetch("/v1/images/generations", payload);
  const image = extractOpenAIImage(data);
  if (!image) throw new Error(`OpenAI image generation returned no image: ${JSON.stringify(data)}`);
  if (/^https?:\/\//i.test(image)) {
    await downloadImageAsPng(image, outPath);
    return;
  }
  const base64 = image.includes(",") ? image.split(",").pop() : image;
  await writeImageBytesAsPng(Buffer.from(base64, "base64"), outPath);
}

async function generateMinimaxImage(prompt, size, outPath, imageModel, negativePrompt = "", references = []) {
  if (!env.MINIMAX_API_KEY) {
    throw new Error("MiniMax API Key has not been configured. Please add MINIMAX_API_KEY to .env.");
  }
  const model = getMinimaxModelName(imageModel);
  const effectivePrompt = negativePrompt && negativePrompt.trim()
    ? `${prompt}. Avoid: ${negativePrompt.trim()}.`
    : prompt;
  const payload = {
    model,
    prompt: effectivePrompt,
    aspect_ratio: toMinimaxAspectRatio(size),
    response_format: "base64",
    n: 1
  };
  if (references && references.length) {
    // MiniMax image-01 仅支持单参考图,fallback 用第一张
    const first = await filePathToDataUrl(references[0].path);
    payload.image = first;
  }
  const data = await minimaxFetch("/v1/image_generation", payload);
  const image = extractMinimaxImage(data);
  if (!image) throw new Error(`MiniMax image generation returned no image: ${JSON.stringify(data)}`);
  if (/^https?:\/\//i.test(image)) {
    await downloadImageAsPng(image, outPath);
    return;
  }
  const base64 = image.includes(",") ? image.split(",").pop() : image;
  await writeImageBytesAsPng(Buffer.from(base64, "base64"), outPath);
}

async function makeUiBatchPreview(batchDir, assets) {
  const previewPath = path.join(batchDir, "preview.png");
  const previewDataPath = path.join(tmpDir, `ui_preview_${randomUUID()}.json`);
  await fs.writeFile(previewDataPath, JSON.stringify(assets.map((asset) => ({
    file: asset.file,
    assetName: asset.assetName
  }))), "utf8");
  const script = `
from PIL import Image, ImageDraw
from pathlib import Path
import sys, json
batch = Path(sys.argv[1])
assets = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
thumbs = []
for asset in assets[:12]:
    img = Image.open(batch / asset["file"]).convert("RGBA")
    img.thumbnail((160, 160), Image.Resampling.LANCZOS)
    tile = Image.new("RGBA", (180, 202), (248, 250, 252, 255))
    tile.alpha_composite(img, ((180 - img.width)//2, 8))
    ImageDraw.Draw(tile).text((8, 176), asset["assetName"][:22], fill=(30, 41, 59, 255))
    thumbs.append(tile)
cols = min(4, max(1, len(thumbs)))
rows = (len(thumbs) + cols - 1) // cols
sheet = Image.new("RGBA", (cols * 180, rows * 202), (226, 232, 240, 255))
for i, tile in enumerate(thumbs):
    sheet.alpha_composite(tile, ((i % cols) * 180, (i // cols) * 202))
sheet.save(sys.argv[3])
`;
  try {
    await runPythonWithOutput(["-c", script, batchDir, previewDataPath, previewPath]);
  } finally {
    await fs.rm(previewDataPath, { force: true }).catch(() => {});
  }
  return previewPath;
}

async function arkFetch(endpoint, payload) {
  const response = await fetch(`${env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3"}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.ARK_API_KEY}`
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!response.ok) throw new Error(`Volcengine Ark API error ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

async function minimaxFetch(endpoint, payload) {
  const response = await fetch(`${env.MINIMAX_BASE_URL || "https://api.minimax.io"}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.MINIMAX_API_KEY}`
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!response.ok) throw new Error(formatMinimaxError("MiniMax API error", response.status, data));
  const baseResp = data?.base_resp || data?.baseResp;
  const statusCode = Number(baseResp?.status_code ?? baseResp?.statusCode ?? 0);
  if (statusCode) {
    throw new Error(formatMinimaxError("MiniMax API error", statusCode, data));
  }
  return data;
}

async function openaiFetch(endpoint, payload) {
  let response;
  try {
    response = await fetch(buildOpenAIUrl(endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw new Error(formatOpenAINetworkError(error));
  }
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!response.ok) throw new Error(formatOpenAIError(response.status, data));
  return data;
}

function buildOpenAIUrl(endpoint) {
  const base = String(env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, "");
  const cleanEndpoint = String(endpoint || "").startsWith("/") ? endpoint : `/${endpoint}`;
  if (base.endsWith("/v1") && cleanEndpoint.startsWith("/v1/")) {
    return `${base}${cleanEndpoint.slice(3)}`;
  }
  return `${base}${cleanEndpoint}`;
}

function formatOpenAINetworkError(error) {
  const cause = error?.cause;
  const detail = [cause?.code, cause?.message || error?.message].filter(Boolean).join(" ");
  return [
    `OpenAI network error: ${detail || "fetch failed"}.`,
    "本地后端现在连不上 OpenAI 接口，通常是网络、代理或 OPENAI_BASE_URL 不匹配。",
    "如果你使用的是第三方中转 Key，请把 .env 里的 OPENAI_BASE_URL 改成它提供的地址；如果是官方 Key，请确认本机能访问 https://api.openai.com。"
  ].join(" ");
}

function formatOpenAIError(status, data) {
  const raw = typeof data === "string" ? data : JSON.stringify(data);
  const message = data?.error?.message || data?.message || raw;
  const code = data?.error?.code || data?.error?.type || status;
  if (status === 401) {
    return `OpenAI API error ${status}: ${message} 请确认 OPENAI_API_KEY 是有效的 OpenAI API Key，且没有复制多余空格。`;
  }
  if (status === 429 || String(code).includes("quota")) {
    return `OpenAI API error ${status}: ${message} 这通常表示余额、额度或速率限制不足，请检查 OpenAI 平台 Billing / Usage。`;
  }
  return `OpenAI API error ${status}: ${raw}`;
}

async function minimaxGet(endpoint) {
  const response = await fetch(`${env.MINIMAX_BASE_URL || "https://api.minimax.io"}${endpoint}`, {
    headers: { "Authorization": `Bearer ${env.MINIMAX_API_KEY}` }
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!response.ok) throw new Error(formatMinimaxError("MiniMax query error", response.status, data));
  const baseResp = data?.base_resp || data?.baseResp;
  const statusCode = Number(baseResp?.status_code ?? baseResp?.statusCode ?? 0);
  if (statusCode) {
    throw new Error(formatMinimaxError("MiniMax query error", statusCode, data));
  }
  return data;
}

function formatMinimaxError(prefix, status, data) {
  const raw = typeof data === "string" ? data : JSON.stringify(data);
  const baseResp = data?.base_resp || data?.baseResp;
  const message = baseResp?.status_msg || baseResp?.statusMsg || data?.error?.message || data?.message || raw;
  if (Number(status) === 2056 || raw.includes("2056") || String(message).includes("Token Plan")) {
    return [
      `${prefix} ${status}: ${message}`,
      "MiniMax 返回 2056 通常表示当前 Key 没有可用于这次调用的 Token Plan 媒体额度或可抵扣积分。",
      "请在 MiniMax 控制台确认：积分余额是否可用，当前套餐是否覆盖图片/视频 API，或改用普通开放平台 API Key + 按量付费余额。"
    ].join(" ");
  }
  if (Number(status) === 2049 || raw.includes("2049") || /invalid api key/i.test(String(message))) {
    return [
      `${prefix} ${status}: ${message}`,
      "请确认这个 Key 来自 MiniMax 开放平台的 API Keys，并且 MINIMAX_BASE_URL 与 Key 所属平台一致。"
    ].join(" ");
  }
  return `${prefix} ${status}: ${raw}`;
}

async function arkGet(endpoint) {
  const response = await fetch(`${env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3"}${endpoint}`, {
    headers: { "Authorization": `Bearer ${env.ARK_API_KEY}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Volcengine Ark query error ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

function extractVideoUrl(task) {
  return task?.content?.video_url || task?.video_url || task?.result?.video_url || task?.data?.video_url || task?.output?.video_url;
}

async function downloadFile(url, outPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outPath, bytes);
}

async function downloadImageAsPng(url, outPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
  await writeImageBytesAsPng(Buffer.from(await response.arrayBuffer()), outPath);
}

async function writeImageBytesAsPng(bytes, outPath) {
  const tempPath = path.join(tmpDir, `${randomUUID()}${detectImageExt(bytes)}`);
  await fs.writeFile(tempPath, bytes);
  try {
    await runPythonWithOutput(["-c", [
      "from PIL import Image",
      "import sys",
      "img = Image.open(sys.argv[1]).convert('RGBA')",
      "img.save(sys.argv[2], 'PNG')"
    ].join("; "), tempPath, outPath]);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

function detectImageExt(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return ".png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return ".jpg";
  if (bytes.slice(0, 4).toString("ascii") === "RIFF" && bytes.slice(8, 12).toString("ascii") === "WEBP") return ".webp";
  return ".img";
}

async function imageFileToPngDataUrl(filePath) {
  const tempPath = path.join(tmpDir, `${randomUUID()}_first_frame.png`);
  try {
    await runPythonWithOutput(["-c", [
      "from PIL import Image",
      "import sys",
      "img = Image.open(sys.argv[1]).convert('RGBA')",
      "img.save(sys.argv[2], 'PNG')"
    ].join("; "), filePath, tempPath]);
    const bytes = await fs.readFile(tempPath);
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

function runPython(args, onOutput) {
  return new Promise((resolve, reject) => {
    const child = spawn("python", args, {
      cwd: rootDir,
      env: pythonEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    let stdout = "";
    // 立即注册 listener 并设编码,避免子进程 pipe buffer 满了父端还没消费触发 EPIPE
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (onOutput) {
        for (const line of chunk.split(/\r?\n/).filter(Boolean)) onOutput(line);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr || `Python exited with ${code}`)));
  });
}

function parseProgressLine(line) {
  const match = String(line).match(/^PROGRESS\s+(\d+)\s+(.+)$/);
  if (!match) return null;
  return {
    percent: clampInt(match[1], 0, 0, 100),
    step: match[2]
  };
}

function runPythonWithOutput(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("python", args, { cwd: rootDir, env: pythonEnv, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => stdout += chunk.toString());
    child.stderr.on("data", (chunk) => stderr += chunk.toString());
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `Python exited with ${code}`)));
  });
}

async function probeVideoInfo(videoPath) {
  try {
    const script = [
      "import cv2, json, sys",
      "cap = cv2.VideoCapture(sys.argv[1])",
      "fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)",
      "frames = float(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)",
      "width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)",
      "height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)",
      "cap.release()",
      "duration = frames / fps if fps else 0",
      "print(json.dumps({'width': width, 'height': height, 'fps': fps, 'frames': int(frames), 'duration': duration}))"
    ].join("; ");
    const output = await runPythonWithOutput(["-c", script, videoPath]);
    const info = JSON.parse(output);
    return info.width && info.height ? info : null;
  } catch {
    return null;
  }
}

function update(job, status, step, progress) {
  if (job.cancelled && status !== "cancelled") return;
  job.status = status;
  job.step = step;
  job.progress = progress;
  job.updatedAt = new Date().toISOString();
  job.logs.push(step);
  persistJobs().catch(() => {});
}

function failJob(id, error) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "failed";
  job.step = "Workflow failed";
  job.error = error.message || String(error);
  job.updatedAt = new Date().toISOString();
  persistJobs().catch(() => {});
}

async function serveStatic(req, res, url) {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const target = path.normalize(path.join(publicDir, pathname));
  if (target.startsWith(publicDir) && existsSync(target)) {
    return streamFile(req, res, target);
  }
  // SPA fallback: 客户端路由(/tools/xxx)没有对应文件,返回 index.html 让前端接管
  const indexPath = path.join(publicDir, "index.html");
  if (existsSync(indexPath)) {
    return streamFile(req, res, indexPath);
  }
  return notFound(res);
}

function serveFile(req, res, relative) {
  const target = path.normalize(path.join(rootDir, relative));
  if (!target.startsWith(rootDir) || !existsSync(target)) return notFound(res);
  return streamFile(req, res, target);
}

async function streamFile(req, res, target) {
  const ext = path.extname(target).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".json": "application/json; charset=utf-8"
  };
  const contentType = types[ext] || "application/octet-stream";
  const stats = await fs.stat(target);
  const range = req.headers.range;
  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      res.writeHead(416, { "Content-Range": `bytes */${stats.size}` });
      return res.end();
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stats.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stats.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stats.size}` });
      return res.end();
    }
    const safeEnd = Math.min(end, stats.size - 1);
    res.writeHead(206, {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${safeEnd}/${stats.size}`,
      "Content-Length": safeEnd - start + 1
    });
    return createReadStream(target, { start, end: safeEnd }).pipe(res);
  }
  res.writeHead(200, {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Content-Length": stats.size
  });
  return createReadStream(target).pipe(res);
}

async function serveZip(res, publicDirPath) {
  const targetDir = fromPublicPath(publicDirPath);
  if (!targetDir || !targetDir.startsWith(exportDir) || !existsSync(targetDir)) return notFound(res);
  const files = await listZipFiles(targetDir);
  if (!files.length) return json(res, { error: "No export files found for ZIP export." }, 404);
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const name of files) {
    const bytes = await fs.readFile(path.join(targetDir, name));
    const nameBytes = Buffer.from(name);
    const crc = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBytes, bytes);

    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0, 8);
    record.writeUInt16LE(0, 10);
    record.writeUInt16LE(0, 12);
    record.writeUInt16LE(0, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(bytes.length, 20);
    record.writeUInt32LE(bytes.length, 24);
    record.writeUInt16LE(nameBytes.length, 28);
    record.writeUInt16LE(0, 30);
    record.writeUInt16LE(0, 32);
    record.writeUInt16LE(0, 34);
    record.writeUInt16LE(0, 36);
    record.writeUInt32LE(0, 38);
    record.writeUInt32LE(offset, 42);
    central.push(record, nameBytes);
    offset += local.length + nameBytes.length + bytes.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  const zip = Buffer.concat([...chunks, ...central, end]);
  const zipName = `${path.basename(targetDir)}.zip`;
  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${zipName}"`
  });
  res.end(zip);
}

async function listZipFiles(root) {
  const result = [];
  async function visit(dir, prefix = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(full, rel);
      } else if (/\.(png|jpg|jpeg|webp|json)$/i.test(entry.name)) {
        result.push(rel);
      }
    }
  }
  await visit(root);
  return result;
}

async function readRequestBody(req) {
  const type = req.headers["content-type"] || "";
  if (type.includes("multipart/form-data")) return readMultipart(req, type);
  return readJson(req);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function readMultipart(req, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error("Multipart boundary missing.");
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  const parts = buffer.toString("latin1").split(`--${boundary}`);
  const fields = {};
  const files = {};

  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const rawHeaders = part.slice(0, headerEnd);
    let body = part.slice(headerEnd + 4);
    if (body.endsWith("\r\n")) body = body.slice(0, -2);
    if (body.endsWith("--")) body = body.slice(0, -2);
    const nameMatch = rawHeaders.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];
    const fileMatch = rawHeaders.match(/filename="([^"]*)"/);
    if (!fileMatch || !fileMatch[1]) {
      fields[fieldName] = Buffer.from(body, "latin1").toString("utf8");
      continue;
    }
    if (body.length === 0) continue;
    const ext = path.extname(fileMatch[1]) || guessExt(rawHeaders);
    const filePath = path.join(uploadDir, `${randomUUID()}${ext}`);
    await fs.writeFile(filePath, Buffer.from(body, "latin1"));
    const fileEntry = { path: filePath, originalName: fileMatch[1] };
    if (files[fieldName]) {
      if (Array.isArray(files[fieldName])) files[fieldName].push(fileEntry);
      else files[fieldName] = [files[fieldName], fileEntry];
    } else {
      files[fieldName] = fileEntry;
    }
  }

  return { fields, files };
}

function guessExt(headers) {
  if (headers.includes("image/png")) return ".png";
  if (headers.includes("image/jpeg")) return ".jpg";
  if (headers.includes("image/webp")) return ".webp";
  if (headers.includes("video/webm")) return ".webm";
  if (headers.includes("video/quicktime")) return ".mov";
  if (headers.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) return ".xlsx";
  if (headers.includes("application/vnd.ms-excel")) return ".xls";
  if (headers.includes("text/csv")) return ".csv";
  if (headers.includes("text/tab-separated-values")) return ".tsv";
  return ".mp4";
}

function mimeForExt(ext) {
  const normalized = String(ext || "").toLowerCase();
  if (normalized === ".webm") return "video/webm";
  if (normalized === ".mov" || normalized === ".qt") return "video/quicktime";
  if (normalized === ".mp4" || normalized === ".m4v") return "video/mp4";
  return "";
}

function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const realIp = String(req.headers["x-real-ip"] || "").trim();
  return forwarded || realIp || req.socket.remoteAddress || "unknown";
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "Not found" }));
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function sanitizeName(value) {
  return String(value).trim().replace(/[^\w\u4e00-\u9fa5-]+/g, "_").replace(/^_+|_+$/g, "") || "asset";
}

function clampInt(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampFloat(value, fallback, min, max) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

function sanitizeRatio(value) {
  const allowed = new Set(["16:9", "9:16", "1:1", "4:3", "3:4"]);
  return allowed.has(value) ? value : "16:9";
}

function sanitizeResolution(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const allowed = new Set(["480p", "720p", "1080p"]);
  return allowed.has(normalized) ? normalized : "720p";
}

function collectFilePaths(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map((v) => v?.path).filter(Boolean);
}

function parseReferenceRoles(raw) {
  const allowed = new Set(["style", "character", "composition", "first_frame"]);
  if (!raw) return [];
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((r) => (allowed.has(r) ? r : "character"));
}

function sanitizeImageSize(value) {
  const normalized = String(value || "").trim().toLowerCase().replace("×", "x");
  const allowed = new Set(["1024x1024", "1024x512", "512x1024", "768x768", "512x512"]);
  return allowed.has(normalized) ? normalized : "1024x1024";
}

function sanitizeImageModel(value) {
  const model = String(value || "").trim();
  const allowed = new Set([
    "doubao-seedream-5-0-260128",
    "doubao-seedream-5-0-lite-260128",
    "doubao-seedream-4-5-251128",
    "doubao-seedream-4-0-250828",
    "doubao-seedream-3-0-t2i-250415",
    `minimax:${defaultMinimaxImageModel}`,
    `openai:${defaultOpenAIImageModel}`,
    "openai:gpt-image-1"
  ]);
  if (allowed.has(model)) return model;
  if (/^doubao-seedream-[a-z0-9-]+$/i.test(model)) return model;
  if (/^minimax:[a-z0-9_.-]+$/i.test(model)) return model;
  if (/^openai:[a-z0-9_.-]+$/i.test(model)) return model;
  return defaultSeedreamModel;
}

function getSeedreamSize(model, requestedSize) {
  const normalizedModel = String(model || "").toLowerCase();
  if (normalizedModel.includes("seedream-5-0") || normalizedModel.includes("seedream-4-")) {
    return "2K";
  }
  return sanitizeImageSize(requestedSize);
}

function isMinimaxImageModel(model) {
  return String(model || "").toLowerCase().startsWith("minimax:");
}

function isOpenAIImageModel(model) {
  return String(model || "").toLowerCase().startsWith("openai:");
}

function getOpenAIModelName(model) {
  if (isOpenAIImageModel(model)) {
    const name = String(model).split(":").slice(1).join(":").trim();
    if (name) return name;
  }
  return env.OPENAI_IMAGE_MODEL || defaultOpenAIImageModel;
}

function getOpenAIImageSize(model, requestedSize) {
  const requested = sanitizeImageSize(requestedSize);
  if (requested === "1024x512") return "1536x1024";
  if (requested === "512x1024") return "1024x1536";
  return "1024x1024";
}

function extractOpenAIImage(data) {
  const first = data?.data?.[0];
  return first?.b64_json || first?.url || data?.b64_json || data?.url || "";
}

function getMinimaxModelName(model) {
  if (isMinimaxImageModel(model)) {
    const name = String(model).split(":").slice(1).join(":").trim();
    if (name) return name;
  }
  return env.MINIMAX_IMAGE_MODEL || defaultMinimaxImageModel;
}

function toMinimaxAspectRatio(size) {
  const normalized = sanitizeImageSize(size);
  const [width, height] = normalized.split("x").map(Number);
  if (!width || !height || width === height) return "1:1";
  if (width > height) return "16:9";
  return "9:16";
}

function extractMinimaxImage(data) {
  const directCandidates = [
    data?.data?.image_base64,
    data?.data?.imageBase64,
    data?.data?.image,
    data?.data?.url,
    data?.image_base64,
    data?.imageBase64,
    data?.image,
    data?.url
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  const arrays = [
    data?.data,
    data?.data?.images,
    data?.data?.image_urls,
    data?.data?.imageUrls,
    data?.data?.urls,
    data?.data?.image_base64,
    data?.data?.image_base64s,
    data?.data?.imageBase64,
    data?.data?.imageBase64s,
    data?.data?.base64,
    data?.images,
    data?.image_urls,
    data?.imageUrls,
    data?.urls,
    data?.image_base64,
    data?.image_base64s,
    data?.imageBase64,
    data?.imageBase64s,
    data?.base64
  ];
  for (const array of arrays) {
    if (!Array.isArray(array) || !array.length) continue;
    const first = array[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (first?.url) return first.url;
    if (first?.image_url) return first.image_url;
    if (first?.image_base64) return first.image_base64;
    if (first?.base64) return first.base64;
  }
  return "";
}

function sanitizeOptionalUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? url : "";
  } catch {
    return "";
  }
}

function sanitizeCameraView(value) {
  const allowed = new Set(["side", "front", "topdown", "isometric"]);
  return allowed.has(value) ? value : "side";
}

function getCameraPrompt(value) {
  const prompts = {
    side: "固定横版侧面视角，角色面朝右侧，适合 2D 横版动作游戏。角色脚底保持在同一条地面基线上，身体不要转向正面或背面。",
    front: "固定正面视角，角色面对镜头，适合正面展示或正面战斗待机动作。角色不要转成侧面，左右移动幅度要小，动作重点放在四肢和身体节奏。",
    topdown: "固定俯视角/准俯视角，像 2D 俯视 RPG 或动作游戏素材。镜头从上方观察角色，能看到头顶、肩部和身体轮廓，角色在画面中保持同一朝向，不要切换成横版侧视或正面半身镜头。",
    isometric: "固定 3/4 等距视角，像 2D isometric RPG 素材。角色保持同一个斜向朝向，能看到身体正侧面和少量顶部信息，不要镜头旋转，不要透视夸张。"
  };
  return prompts[value] || prompts.side;
}

function buildVideoPrompt(input, hasActionReferenceVideo = false) {
  const imageRole = getSeedanceImageRole(input.videoModel);
  const parts = [
    input.actionPrompt,
    hasActionReferenceVideo ? "参考视频中的动作节奏、姿态变化和运动方向，但不要复制参考视频里的角色外观；最终角色应以角色参考图为准。" : "",
    getCameraPrompt(input.cameraView),
    imageRole === "first_frame"
      ? "以首帧图片中的角色作为动作起点，尽量保持同一个角色身份、服装、发型、主色和比例。"
      : "保持与参考图完全相同的角色身份、服装、发型、主色和比例。",
    "输出应像游戏动画素材，不要电影镜头，不要运镜，不要镜头切换，不要场景叙事，不要文字、水印或 UI。背景使用纯绿色、纯白色或透明感干净背景，方便后续抠图。动作要清晰、连续、节奏稳定，角色始终完整出现在画面内。"
  ].filter(Boolean);
  if (input.negativePrompt && input.negativePrompt.trim()) {
    parts.push(`负面约束（请避免）：${input.negativePrompt.trim()}。`);
  }
  return parts.join(". ");
}

function createPromptPreview(body) {
  const fields = body.fields || body;
  const videoModel = sanitizeVideoModel(fields.videoModel || env.SEEDANCE_MODEL || "doubao-seedance-1-5-pro-251215");
  const input = {
    actionPrompt: fields.actionPrompt || "",
    negativePrompt: fields.negativePrompt || "",
    cameraView: sanitizeCameraView(fields.cameraView || "side"),
    videoModel
  };
  const hasActionReferenceVideo = Boolean(sanitizeOptionalUrl(fields.actionReferenceVideoUrl || ""));
  return {
    prompt: buildVideoPrompt(input, hasActionReferenceVideo),
    cameraView: input.cameraView,
    videoModel,
    imageRole: isMinimaxVideoModel(videoModel) ? "first_frame_image" : getSeedanceImageRole(videoModel),
    hasActionReferenceVideo
  };
}

async function parseUiBatchRowsFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".xlsx") {
    const tableText = await runPythonWithOutput(["scripts/read_xlsx_rows.py", filePath]);
    return parseUiBatchRows(tableText);
  }
  if (ext === ".xls") {
    throw new Error("暂不支持旧版 .xls，请在 Excel/WPS 中另存为 .xlsx 后再上传。");
  }
  return parseUiBatchRows(readFileSync(filePath, "utf8"));
}

function parseUiBatchRows(text) {
  const normalized = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!normalized) return [];
  const lines = normalized.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const first = parseDelimitedLine(lines[0], delimiter).map((cell) => cell.trim());
  const knownHeaders = ["asset_name", "name", "prompt", "type", "size", "count", "transparent", "名称", "名字", "素材名", "类型", "提示词", "描述", "尺寸", "数量", "透明背景"];
  const headerLike = first.some((cell) => knownHeaders.includes(cell.toLowerCase()) || knownHeaders.includes(cell));
  const headers = headerLike ? first.map(normalizeUiBatchHeader) : ["asset_name", "type", "prompt", "size", "count", "transparent"];
  const bodyLines = headerLike ? lines.slice(1) : lines;
  const rows = [];
  for (const [index, line] of bodyLines.entries()) {
    const cells = parseDelimitedLine(line, delimiter);
    const record = {};
    headers.forEach((header, cellIndex) => {
      record[header] = cells[cellIndex]?.trim() || "";
    });
    const prompt = record.prompt || record["提示词"] || record.description || record.desc || "";
    if (!prompt) continue;
    const assetName = record.asset_name || record.name || record["名称"] || `ui_asset_${index + 1}`;
    const count = clampInt(record.count || record["数量"], 1, 1, 20);
    for (let copy = 0; copy < count; copy += 1) {
      rows.push({
        assetName: count > 1 ? `${assetName}_${copy + 1}` : assetName,
        type: record.type || record["类型"] || "ui",
        prompt,
        size: sanitizeImageSize(record.size || record["尺寸"] || "1024x1024"),
        transparent: parseBool(record.transparent || record["透明背景"], true)
      });
    }
  }
  return rows.slice(0, 80);
}

function normalizeUiBatchHeader(header) {
  const normalized = String(header || "").trim().toLowerCase();
  const aliases = {
    "名称": "asset_name",
    "名字": "asset_name",
    "素材名": "asset_name",
    "类型": "type",
    "提示词": "prompt",
    "描述": "prompt",
    "尺寸": "size",
    "数量": "count",
    "透明背景": "transparent"
  };
  return aliases[normalized] || normalized;
}

function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function buildUiAssetPrompt(globalStyle, row) {
  const typeHints = {
    icon: "单个游戏 UI 图标，主体居中，轮廓清晰，适合小尺寸识别。",
    button: "游戏 UI 按钮素材，边框清晰，有可点击的层次感，不要真实文字。",
    panel: "游戏 UI 面板素材，边缘和装饰清晰，中心区域可留空，不要真实文字。",
    item: "游戏道具 UI 素材，主体完整，适合背包或商店图标。",
    badge: "徽章或成就图标，形状完整，适合 UI 奖励展示。"
  };
  const typeKey = String(row.type || "ui").toLowerCase();
  return [
    globalStyle,
    row.prompt,
    typeHints[typeKey] || "2D 游戏 UI 素材，主体明确，干净可读。",
    row.transparent ? "透明背景或纯净可抠图背景。" : "",
    "不要出现真实文字、乱码文字、水印、Logo、复杂场景或人物。高清 2D 游戏美术资源。"
  ].filter(Boolean).join(" ");
}

function getSeedanceImageRole(model) {
  return String(model).includes("seedance-2-0") ? "reference_image" : "first_frame";
}

function isMinimaxVideoModel(model) {
  return String(model || "").toLowerCase().startsWith("minimax-video:");
}

function getMinimaxVideoModelName(model) {
  if (isMinimaxVideoModel(model)) {
    const name = String(model).split(":").slice(1).join(":").trim();
    if (name) return name;
  }
  return env.MINIMAX_VIDEO_MODEL || "MiniMax-Hailuo-2.3-Fast";
}

function normalizeMinimaxVideoDuration(model, duration) {
  const requested = clampInt(duration, 6, 1, 60);
  if (requested <= 6) return 6;
  return 10;
}

function normalizeMinimaxVideoResolution(model, resolution, duration) {
  const normalized = String(resolution || "").trim().toLowerCase();
  const mapped = normalized === "1080p" ? "1080P" : normalized === "480p" ? "512P" : "768P";
  if (duration !== 6 && mapped === "1080P") return "768P";
  if ((model === "MiniMax-Hailuo-2.3" || model === "MiniMax-Hailuo-2.3-Fast") && mapped === "512P") return "768P";
  return mapped;
}

function sanitizeVideoModel(value) {
  const allowed = new Set([
    "doubao-seedance-2-0-fast-260128",
    "doubao-seedance-1-5-pro-251215",
    "doubao-seedance-1-0-pro-250528",
    "doubao-seedance-1-0-pro-fast-251015",
    "doubao-seedance-2-0-260128",
    "minimax-video:MiniMax-Hailuo-2.3-Fast",
    "minimax-video:MiniMax-Hailuo-2.3",
    "minimax-video:MiniMax-Hailuo-02",
    "minimax-video:I2V-01-Director",
    "minimax-video:I2V-01-live",
    "minimax-video:I2V-01"
  ]);
  const model = String(value || "").trim();
  if (allowed.has(model)) return model;
  if (/^doubao-seedance-[a-z0-9-]+$/i.test(model)) return model;
  if (/^minimax-video:[a-z0-9_.-]+$/i.test(model)) return model;
  return "doubao-seedance-1-5-pro-251215";
}

function sanitizeBackgroundMode(value) {
  const allowed = new Set(["auto", "ui", "color", "birefnet", "u2netp", "u2net", "none"]);
  return allowed.has(value) ? value : "u2netp";
}

function sanitizeWorkflowAction(value) {
  const allowed = new Set(["full", "video"]);
  return allowed.has(value) ? value : "full";
}

function parseBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toStagingPath(absolutePath) {
  return `/staging/${path.relative(rootDir, absolutePath).replaceAll("\\", "/")}`;
}

function toPublicPath(absolutePath) {
  return `/files/${path.relative(rootDir, absolutePath).replaceAll("\\", "/")}`;
}

// 任务完成后,把 staging 产物自动归档到统一的 exports/<mode>/<name>/<时间戳>/ 目录
// 返回磁盘路径(相对于 rootDir)和归档后的资源列表
async function archiveArtifacts({ mode, name, sourceDir, subPath = "" }) {
  if (!sourceDir || !existsSync(sourceDir)) return null;
  const safeMode = sanitizeName(mode || "asset");
  const safeName = sanitizeName(name || "asset");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest = path.join(exportDir, safeMode, safeName, stamp);
  await ensureDir(dest);
  const targetDir = subPath ? path.join(dest, subPath) : dest;
  await ensureDir(targetDir);
  await copyDirRecursive(sourceDir, targetDir);
  return {
    absPath: dest,
    relPath: path.relative(rootDir, dest).replaceAll("\\", "/"),
  };
}

// 把绝对路径限定在 rootDir/exportDir 下,防路径穿越
function safeExportPath(publicPath) {
  if (!publicPath) return null;
  const decoded = decodeURIComponent(String(publicPath));
  const abs = path.isAbsolute(decoded) ? decoded : path.join(rootDir, decoded);
  const normalized = path.normalize(abs);
  if (!normalized.startsWith(exportDir)) return null;
  return normalized;
}

function fromPublicPath(publicPath) {
  if (!publicPath || !String(publicPath).startsWith("/files/")) return null;
  const relative = decodeURIComponent(String(publicPath).replace("/files/", ""));
  const target = path.normalize(path.join(rootDir, relative));
  return target.startsWith(rootDir) ? target : null;
}

function fromStagingPath(publicPath) {
  if (!publicPath || !String(publicPath).startsWith("/staging/")) return null;
  const relative = decodeURIComponent(String(publicPath).replace("/staging/", ""));
  const target = path.normalize(path.join(stagingDir, relative));
  return target.startsWith(stagingDir) ? target : null;
}

async function moveStagingToExport(body) {
  const staging = fromStagingPath(body.stagingPath);
  if (!staging || !existsSync(staging)) throw new Error("暂存资源不存在");
  const characterName = sanitizeName(body.characterName || "asset");
  const actionName = sanitizeName(body.actionName || new Date().toISOString().slice(0, 10));
  const dest = path.join(exportDir, characterName, actionName);
  await ensureDir(dest);
  await copyDirRecursive(staging, dest);
  return { exportDir: toPublicPath(dest), zip: `/api/download-zip?dir=${encodeURIComponent(toPublicPath(dest))}` };
}

async function copyDirRecursive(src, dest) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await ensureDir(destPath);
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

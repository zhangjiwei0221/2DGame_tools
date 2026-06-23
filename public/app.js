const form = document.querySelector("#workflowForm");
const configStatus = document.querySelector("#configStatus");
const stepTitle = document.querySelector("#stepTitle");
const progressText = document.querySelector("#progressText");
const barFill = document.querySelector("#barFill");
const canvasTitle = document.querySelector("#canvasTitle");
const previewArea = document.querySelector("#previewArea");
const links = document.querySelector("#links");
const errorBox = document.querySelector("#errorBox");
const jobLog = document.querySelector("#jobLog");
const taskMeta = document.querySelector("#taskMeta");
const taskTimer = document.querySelector("#taskTimer");
const cancelTaskButton = document.querySelector("#cancelTaskButton");
const qualityInput = document.querySelector("#jpgQuality");
const qualityValue = document.querySelector("#qualityValue");
const outputFormat = document.querySelector("#outputFormat");
const backgroundMode = document.querySelector("#backgroundMode");
const jpgQualityField = document.querySelector("#jpgQualityField");
const cameraView = document.querySelector("#cameraView");
const videoRatio = document.querySelector("select[name=videoRatio]");
const characterImageModel = document.querySelector("select[name=characterImageModel]");
const uiImageModel = document.querySelector("select[name=uiImageModel]");
const customCharacterImageModelField = document.querySelector("#customCharacterImageModelField");
const customUiImageModelField = document.querySelector("#customUiImageModelField");
const customCharacterImageModel = document.querySelector("input[name=customCharacterImageModel]");
const uiCustomImageModel = document.querySelector("input[name=uiCustomImageModel]");
const videoModel = document.querySelector("select[name=videoModel]");
const videoDuration = document.querySelector("select[name=videoDuration]");
const videoResolution = document.querySelector("#videoResolution");
const costHint = document.querySelector("#costHint");
const costCard = document.querySelector("#costCard");
const costNote = document.querySelector("#costNote");
const customModelField = document.querySelector("#customModelField");
const customVideoModel = document.querySelector("input[name=customVideoModel]");
const characterNameInput = document.querySelector("#characterNameInput");
const actionNameInput = document.querySelector("#actionNameInput");
const actionPrompt = document.querySelector("textarea[name=actionPrompt]");
const actionPresets = document.querySelector("#actionPresets");
const promptPreview = document.querySelector("#promptPreview");
const promptPreviewMeta = document.querySelector("#promptPreviewMeta");
const characterReferenceInput = document.querySelector("input[name=characterReference]");
const referenceFileInput = document.querySelector("#referenceFileInput");
const referenceSlots = document.querySelector("#referenceSlots");
const addReferenceButton = document.querySelector("#addReferenceButton");
const refCountLabel = document.querySelector("#refCount");

const REFERENCE_ROLES = [
  { id: "style", label: "风格" },
  { id: "character", label: "主体" },
  { id: "composition", label: "构图" },
  { id: "first_frame", label: "首帧" }
];
const MAX_REFERENCES = 4;
const referenceImages = []; // [{ file, role, dataUrl }]
const actionReferenceVideoUrl = document.querySelector("input[name=actionReferenceVideoUrl]");
const finalVideo = document.querySelector("#finalVideo");
const cutoutImages = document.querySelector("#cutoutImages");
const cutoutImageList = document.querySelector("#cutoutImageList");
const cutoutImageCount = document.querySelector("#cutoutImageCount");
const cutoutProgress = document.querySelector("#cutoutProgress");
const cutoutStepTitle = document.querySelector("#cutoutStepTitle");
const cutoutProgressText = document.querySelector("#cutoutProgressText");
const cutoutBarFill = document.querySelector("#cutoutBarFill");
const uiBatchFile = document.querySelector("#uiBatchFile");
const uiBatchText = document.querySelector("#uiBatchText");
const videoEmptyState = document.querySelector("#videoEmptyState");
const manualPanel = document.querySelector("#manualPanel");
const autoPanel = document.querySelector("#autoPanel");
const manualVideo = document.querySelector("#manualVideo");
const filmstrip = document.querySelector("#filmstrip");
const timeScrubber = document.querySelector("#timeScrubber");
const currentTimeLabel = document.querySelector("#currentTimeLabel");
const prevFrameButton = document.querySelector("#prevFrameButton");
const nextFrameButton = document.querySelector("#nextFrameButton");
const captureFrameButton = document.querySelector("#captureFrameButton");
const manualExportButton = document.querySelector("#manualExportButton");
const autoExportButton = document.querySelector("#autoExportButton");
const clearManualButton = document.querySelector("#clearManualButton");
const manualFrames = document.querySelector("#manualFrames");
const aiGenerateButton = document.querySelector("#aiGenerateButton");
const characterGenerateButton = document.querySelector("#characterGenerateButton");
const cutoutButton = document.querySelector("#cutoutButton");
const uiBatchButton = document.querySelector("#uiBatchButton");
const goMotionFromCharacterButton = document.querySelector("#goMotionFromCharacterButton");

let latestJob = null;
let manualCaptures = [];
let filmstripFrames = [];
let isDraggingTimeline = false;
let pendingSeek = null;
let currentVideo = null;
let promptPreviewTimer = null;
let backgroundModeTouched = false;
let recentResults = [];

function loadRecentResults() {
  try {
    recentResults = JSON.parse(localStorage.getItem("recentResults") || "[]");
  } catch { recentResults = []; }
}

function saveRecentResults() {
  recentResults = recentResults.slice(0, 24);
  localStorage.setItem("recentResults", JSON.stringify(recentResults));
}

const MODE_ICONS = {
  character: "image",
  cutout: "scissors",
  motion: "video",
  frames: "film",
  uiBatch: "layout-grid"
};

const MODE_LABELS = {
  character: "生图",
  cutout: "抠图",
  motion: "视频",
  frames: "抽帧",
  uiBatch: "批量 UI"
};

function addToRecent(result, context = {}) {
  const entry = {
    time: Date.now(),
    image: result.image || result.preview || "",
    staging: result.staging || "",
    exportDir: result.exportDir || "",
    manifest: result.manifest || "",
    video: result.video || "",
    mode: context.mode || "character",
    prompt: context.prompt || "",
    modelName: context.modelName || ""
  };
  // 去重:同 staging 路径的旧记录先移除
  if (entry.staging) {
    recentResults = recentResults.filter(r => r.staging !== entry.staging);
  }
  recentResults.unshift(entry);
  saveRecentResults();
  renderRecentGallery();
}

function reuseRecentEntry(entry) {
  if (!entry) return;
  if (entry.mode === "character" && entry.prompt) {
    if (typeof switchToolMode === "function") switchToolMode("character");
    const promptField = document.querySelector('[name="characterPrompt"]');
    if (promptField) {
      promptField.value = entry.prompt;
      promptField.focus();
    }
    if (entry.modelName) {
      const modelField = document.querySelector('[name="characterImageModel"]');
      if (modelField) {
        const opt = Array.from(modelField.options).find(o => o.value === entry.modelName || o.textContent.includes(entry.modelName));
        if (opt) modelField.value = opt.value;
      }
    }
    if (typeof schedulePromptPreview === "function") schedulePromptPreview();
  } else if (entry.mode && typeof switchToolMode === "function") {
    switchToolMode(entry.mode);
  }
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

function renderRecentGallery() {
  const gallery = document.querySelector("#historyGallery");
  if (!gallery) return;
  if (!recentResults.length) {
    gallery.innerHTML = `<p class="empty-note">还没有生成记录，完成一次任务后这里会出现最近结果。</p>`;
    return;
  }
  gallery.innerHTML = recentResults.map((r, i) => {
    const time = new Date(r.time).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    const modeIcon = MODE_ICONS[r.mode] || "image";
    const modeLabel = MODE_LABELS[r.mode] || "生成";
    const promptPreview = escapeHtml((r.prompt || "").slice(0, 50));
    const hasPrompt = !!r.prompt;
    return `
      <article class="history-card" data-index="${i}">
        ${r.image ? `<img src="${r.image}" alt="最近生成" loading="lazy" />` : `<div class="batch-missing">无预览</div>`}
        <div class="history-card-meta">
          <i data-lucide="${modeIcon}"></i>
          <span>${modeLabel}</span>
          <em>${time}</em>
        </div>
        ${hasPrompt ? `<div class="history-card-overlay">
          <p>${promptPreview}${r.prompt.length > 50 ? "…" : ""}</p>
          <button class="icon-button history-reuse" type="button" aria-label="复用" data-index="${i}">
            <i data-lucide="refresh-cw"></i><span>复用</span>
          </button>
        </div>` : ""}
      </article>
    `;
  }).join("");

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }

  // 点击缩略图 → 在 previewArea 显示大图
  gallery.querySelectorAll(".history-card img").forEach(img => img.addEventListener("click", () => {
    previewArea.classList.remove("empty");
    previewArea.innerHTML = `<img src="${img.src}" alt="查看大图" style="max-width:100%;max-height:min(58vh,620px);object-fit:contain;border-radius:14px;" />`;
  }));
  // 复用按钮
  gallery.querySelectorAll(".history-reuse").forEach(btn => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const idx = Number(btn.dataset.index);
    if (recentResults[idx]) reuseRecentEntry(recentResults[idx]);
  }));
}

if (cancelTaskButton) {
  cancelTaskButton.addEventListener("click", async () => {
    if (!currentJobId) return;
    const id = currentJobId;
    try {
      await fetch(`/api/jobs/${id}/cancel`, { method: "POST" });
    } catch (err) {
      console.warn("Cancel request failed", err);
    }
    setProgress("已请求取消任务", "0%", 0);
  });
}

// 空状态模板按钮:点击切换模式 + 填预设
document.querySelectorAll(".empty-template").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tpl = btn.dataset.template;
    if (tpl === "rpg" || tpl === "scene") {
      if (typeof switchToolMode === "function") switchToolMode("character");
      const preset = characterPresets.find(p => p.id === tpl);
      const ta = document.querySelector('[name="characterPrompt"]');
      if (preset && ta) {
        ta.value = preset.prompt;
        ta.focus();
        if (typeof schedulePromptPreview === "function") schedulePromptPreview();
      }
    } else if (tpl === "cutout") {
      if (typeof switchToolMode === "function") switchToolMode("cutout");
    }
  });
});

const presets = [
  { name: "待机", text: "制作一个可循环的待机动作。角色保持原地，呼吸带动肩膀和身体轻微上下起伏，头发和衣摆有很小的延迟摆动。动作幅度不要夸张，首帧和尾帧姿态尽量接近，方便做游戏 idle loop。保持角色完整入镜，轮廓清晰，不要镜头移动。" },
  { name: "跑步", text: "制作一个可循环的跑步动作。角色步伐清晰，左右腿交替明显，手臂自然摆动，身体重心有轻微上下弹跳，但脚底落点要稳定。首尾姿态尽量能衔接成 loop，动作不要突然加速或停顿。保持角色完整入镜，轮廓清晰，不要镜头移动。" },
  { name: "走路", text: "制作一个可循环的走路动作。步伐比跑步更慢，脚步交替清楚，身体重心平稳移动，手臂有轻微自然摆动。动作需要适合拆成 8 到 12 张游戏序列帧，首尾姿态尽量接近，方便循环播放。" },
  { name: "跳跃", text: "制作一个完整跳跃动作：先轻微下蹲蓄力，然后起跳上升，空中停顿一瞬，最后下落并落地缓冲。动作要读得清楚，角色不要飞出画面，落地后姿态稳定。适合拆成游戏里的 jump 动画序列帧。" },
  { name: "近战攻击", text: "制作一个清晰的近战攻击动作：先有短暂蓄力姿态，然后武器或手臂快速向前攻击，最后收招回到稳定姿态。攻击弧线要明显，角色轮廓要好读，不要加入敌人、特效文字或复杂背景。适合拆成 8 到 12 张攻击序列帧。" },
  { name: "施法", text: "制作一个施法动作：角色抬手或举起武器，能量逐渐聚集，然后向前释放，最后回到稳定姿态。特效可以有少量光效，但不要遮挡角色主体，不要出现文字或 UI。动作要适合游戏技能动画序列帧。" },
  { name: "受击", text: "制作一个受击反馈动作：角色身体被冲击向后顿一下，头部和肩膀有明显反应，然后快速恢复站稳。动作时间短、节奏清楚，轮廓要夸张易读，适合游戏 hurt 动画。" },
  { name: "闪避", text: "制作一个快速闪避动作：角色先压低重心，然后向指定方向快速闪避或翻滚，最后恢复到可继续行动的姿态。动作要紧凑，主体不要离开画面，轮廓变化要清楚，适合游戏 dodge 动画。" },
  { name: "倒地", text: "制作一个失败或倒地动作：角色先失去平衡，然后身体下落倒地，最后停在清晰的倒地姿态。不要过度血腥，不要加入场景叙事，最后一帧要适合作为游戏里的 defeated 静止帧。" }
];

const characterPresets = [
  {
    id: "rpg",
    icon: "swords",
    name: "RPG 角色",
    prompt: "2D RPG 角色立绘，俯视角全身像，森林战斗场景。年轻剑士，深色斗篷，护肩皮甲，腰挂短剑和药瓶，右手按剑柄，神情警觉。背景是青苔石台与柔光雾气。轮廓清晰、线条干净、适合拆成序列帧素材。"
  },
  {
    id: "scene",
    icon: "mountain",
    name: "场景背景",
    prompt: "2D 横版游戏场景背景，远景分层。前景青苔石台与断木，中景雾气中的针叶林，远景雪山轮廓。色调冷绿与琥珀，柔和雾气，光线从右上斜入。适合作为横版卷轴关卡背景，无人物主体，无文字 UI。"
  },
  {
    id: "ui",
    icon: "box",
    name: "UI 图标",
    prompt: "2D 游戏 UI 图标，扁平化设计，圆形描边底，蓝色到紫色渐变。图标内容是一个发光药水瓶，里面是淡紫色液体，表面有星点高光。整体读图清晰、轮廓锐利、适合作为游戏内物品栏图标，无背景文字。"
  },
  {
    id: "chibi",
    icon: "smile",
    name: "Q 版头像",
    prompt: "Q 版角色头像，大头小身比例。蒸汽朋克机械师，棕色短发，戴护目镜，护目镜反射城市霓虹。表情温柔微笑，机械手臂末端是小型扳手。背景是模糊的齿轮与铜管，色调暖橙与深蓝，电影感光照，轮廓清晰。"
  }
];

const characterPresetContainer = document.querySelector("#characterPresets");
const characterPromptField = document.querySelector('[name="characterPrompt"]');

function renderCharacterPresets() {
  if (!characterPresetContainer) return;
  characterPresetContainer.innerHTML = characterPresets.map((preset) => (
    `<button class="preset-button preset-with-icon" type="button" data-character-preset="${preset.id}">
       <i data-lucide="${preset.icon}"></i><span>${preset.name}</span>
     </button>`
  )).join("");
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
  characterPresetContainer.addEventListener("click", (event) => {
    const button = event.target.closest("[data-character-preset]");
    if (!button || !characterPromptField) return;
    const preset = characterPresets.find((item) => item.id === button.dataset.characterPreset);
    if (!preset) return;
    characterPromptField.value = preset.prompt;
    characterPromptField.focus();
    if (typeof schedulePromptPreview === "function") schedulePromptPreview();
  });
}

setAutoNames();
loadConfig();
loadRecentResults();
renderRecentGallery();
renderPresets();
renderCharacterPresets();
syncControls();
syncToolMode();
syncFramePanels();
renderManualCaptures();
updateStepButtons();
schedulePromptPreview();

// lucide 图标初始化(defer 加载,需在 DOMContentLoaded 后调用)
if (window.lucide && typeof window.lucide.createIcons === "function") {
  window.lucide.createIcons();
}

form.addEventListener("change", () => {
  syncControls();
  syncToolMode();
  syncFramePanels();
  schedulePromptPreview();
});
form.addEventListener("submit", generateAiVideo);
characterGenerateButton.addEventListener("click", generateCharacterImage);
cutoutButton.addEventListener("click", cutoutUploadedImages);
uiBatchButton.addEventListener("click", generateUiBatch);
goMotionFromCharacterButton.addEventListener("click", () => switchToolMode("motion"));
document.querySelectorAll("[data-switch-mode]").forEach((button) => {
  button.addEventListener("click", () => switchToolMode(button.dataset.switchMode));
});
initReferenceUploader();
finalVideo.addEventListener("change", prepareExistingVideo);
qualityInput.addEventListener("input", () => {
  qualityValue.textContent = qualityInput.value;
});
cameraView.addEventListener("change", syncRatioForCamera);
cameraView.addEventListener("change", schedulePromptPreview);
videoModel.addEventListener("change", syncCustomModelField);
videoModel.addEventListener("change", syncCostControls);
videoModel.addEventListener("change", schedulePromptPreview);
customVideoModel.addEventListener("input", syncCostControls);
customVideoModel.addEventListener("input", schedulePromptPreview);
characterImageModel.addEventListener("change", syncCustomImageModelFields);
uiImageModel.addEventListener("change", syncCustomImageModelFields);
actionPrompt.addEventListener("input", schedulePromptPreview);
actionReferenceVideoUrl.addEventListener("input", schedulePromptPreview);
videoDuration.addEventListener("change", syncCostControls);
videoResolution.addEventListener("change", syncCostControls);
backgroundMode.addEventListener("change", () => {
  backgroundModeTouched = true;
});
manualVideo.addEventListener("loadedmetadata", buildFilmstrip);
manualVideo.addEventListener("loadedmetadata", syncScrubberBounds);
manualVideo.addEventListener("loadedmetadata", updateStepButtons);
manualVideo.addEventListener("durationchange", syncScrubberBounds);
manualVideo.addEventListener("canplay", updateStepButtons);
manualVideo.addEventListener("timeupdate", syncScrubberFromVideo);
manualVideo.addEventListener("seeked", syncScrubberFromVideo);
filmstrip.addEventListener("wheel", seekWithWheel, { passive: false });
filmstrip.addEventListener("pointerdown", beginTimelineDrag);
window.addEventListener("pointermove", dragTimeline);
window.addEventListener("pointerup", endTimelineDrag);
timeScrubber.addEventListener("input", () => seekTo(Number(timeScrubber.value)));
timeScrubber.addEventListener("change", () => seekTo(Number(timeScrubber.value)));
prevFrameButton.addEventListener("click", () => stepVideo(-1));
nextFrameButton.addEventListener("click", () => stepVideo(1));
captureFrameButton.addEventListener("click", captureCurrentFrame);
manualExportButton.addEventListener("click", exportManualFrames);
autoExportButton.addEventListener("click", exportAutoFrames);
clearManualButton.addEventListener("click", () => {
  if (!manualCaptures.length) return;
  if (!window.confirm("确定要清空所有手动截帧吗？")) return;
  manualCaptures = [];
  renderManualCaptures();
});

async function generateAiVideo(event) {
  event.preventDefault();
  setAutoNames("ai");
  setBusy(true);
  resetResultOnly();
  setProgress("正在根据参考图和动作描述生成新视频", "0%", 0);

  const formData = new FormData(form);
  formData.delete("finalVideo");
  formData.set("workflowAction", "video");
  applySelectedImageModel(formData, characterImageModel);
  applySelectedModel(formData);

  try {
    const response = await fetch("/api/workflows", {
      method: "POST",
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "启动失败");
    pollJob(data.jobId);
  } catch (error) {
    showError(error);
    setBusy(false);
  }
}

async function generateCharacterImage() {
  setAutoNames("character");
  setBusy(true);
  resetResultOnly();
  setProgress("正在生成图片", "0%", 0);

  const formData = new FormData(form);
  formData.delete("finalVideo");
  formData.delete("actionReferenceVideoUrl");
  applySelectedImageModel(formData, characterImageModel);
  appendReferenceFieldsToFormData(formData);
  const originalPrompt = formData.get("characterPrompt") || "";
  formData.set("characterPrompt", originalPrompt + buildReferencePromptSuffix());

  try {
    const response = await fetch("/api/characters", {
      method: "POST",
      body: formData
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "图片生成失败");
    renderResult(result);
    setProgress("图片已生成", "100%", 100);
    addToRecent(result, {
      mode: "character",
      prompt: formData.get("characterPrompt") || "",
      modelName: formData.get("imageModel") || characterImageModel.value || ""
    });
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function prepareExistingVideo() {
  if (!finalVideo.files.length) return;
  setAutoNames("upload");
  if (currentVideo && !window.confirm("上传新视频会清空当前分帧工作区，继续吗？")) {
    finalVideo.value = "";
    return;
  }
  resetVideoWorkspace();
  setBusy(true);
  setProgress("正在准备最终视频", "0%", 0);
  try {
    const formData = new FormData(form);
    const response = await fetch("/api/prepare-video", {
      method: "POST",
      body: formData
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "上传失败");
    latestJob = {
      input: { characterName: result.characterName, actionName: result.actionName },
      result: {
        video: result.video,
        exportDir: "",
        preview: "",
        manifest: "",
        frames: []
      }
    };
    useVideo(result.video);
    setProgress("最终视频已准备好，可以开始分帧", "Ready", 100);
    links.innerHTML = "";
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

// 显示当前已选的图片列表
function renderCutoutImageList() {
  if (!cutoutImageList || !cutoutImageCount) return;
  const files = cutoutImages?.files || [];
  cutoutImageCount.textContent = String(files.length);
  if (!files.length) {
    cutoutImageList.innerHTML = "";
    return;
  }
  const rows = Array.from(files).map((f, i) => `
    <div class="cutout-image-row" data-cutout-idx="${i}">
      <span class="cutout-image-idx">${i + 1}</span>
      <span class="cutout-image-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
      <span class="cutout-image-size">${(f.size / 1024).toFixed(1)} KB</span>
      <span class="cutout-image-status" data-cutout-status="${i}">—</span>
    </div>
  `).join("");
  cutoutImageList.innerHTML = rows;
}

if (cutoutImages) {
  cutoutImages.addEventListener("change", renderCutoutImageList);
  // 点击 drop-card 触发 input 弹窗(用 div + JS 而不是 label 包 input,避免多选时点击抖动)
  const cutoutDrop = document.querySelector("#cutoutDropCard");
  const openCutoutPicker = () => cutoutImages.click();
  if (cutoutDrop) {
    cutoutDrop.addEventListener("click", openCutoutPicker);
    cutoutDrop.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openCutoutPicker();
      }
    });
  }
}

async function cutoutUploadedImages() {
  const files = cutoutImages?.files || [];
  if (!files.length) {
    showError("请先上传要抠图的图片。");
    return;
  }
  setAutoNames("cutout");
  setBusy(true);
  resetResultOnly();

  // 显示进度条
  if (cutoutProgress) cutoutProgress.hidden = false;
  if (cutoutBarFill) cutoutBarFill.style.width = "0%";

  // 构造批量请求:所有文件通过 batchImages 字段传给后端
  const formData = new FormData();
  const batchName = `cutout_${Date.now()}`;
  for (const f of files) {
    formData.append("batchImages", f);
  }
  formData.append("batchName", batchName);
  const outputFormatVal = document.querySelector("#outputFormat")?.value;
  if (outputFormatVal) formData.append("outputFormat", outputFormatVal);
  const bgModeVal = document.querySelector("#backgroundMode")?.value;
  if (bgModeVal) formData.append("backgroundMode", bgModeVal);

  try {
    setProgress(`正在上传 ${files.length} 张图片`, "5%", 5);
    const response = await fetch("/api/batch-cutout", {
      method: "POST",
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "批量抠图启动失败");
    // pollJob 会轮询后端批量 job,逐步更新进度条(每次报当前进度)
    pollJob(data.jobId);
  } catch (error) {
    showError(error);
    setBusy(false);
    if (cutoutProgress) cutoutProgress.hidden = true;
  }
}

async function generateUiBatch() {
  if (!uiBatchFile.files.length && !uiBatchText.value.trim()) {
    showError("请先上传 .xlsx / CSV / TSV 表格，或直接粘贴 CSV 内容。");
    return;
  }
  setAutoNames("ui_batch");
  setBusy(true);
  resetResultOnly();
  setProgress("正在读取 UI 素材表格", "5%", 5);

  const formData = new FormData(form);
  formData.delete("finalVideo");
  formData.delete("characterReference");
  formData.delete("characterReferences");
  formData.delete("cutoutImages");
  applySelectedImageModel(formData, uiImageModel);
  if (!backgroundModeTouched) {
    formData.set("backgroundMode", "auto");
  }

  try {
    const response = await fetch("/api/ui-batch", {
      method: "POST",
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "批量 UI 素材任务启动失败");
    pollJob(data.jobId);
  } catch (error) {
    showError(error);
    setBusy(false);
  }
}

async function exportAutoFrames() {
  if (!currentVideo) {
    showError("请先上传或生成一个视频。");
    return;
  }
  setAutoNames("auto");
  setBusy(true);
  setProgress("正在自动抽帧并抠图", "70%", 70);

  const formData = new FormData(form);

  try {
    const response = await fetch("/api/auto-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        video: currentVideo,
        characterName: formData.get("characterName"),
        actionName: formData.get("actionName"),
        frameCount: formData.get("frameCount"),
        extractMode: formData.get("extractMode"),
        sampleFps: formData.get("sampleFps"),
        startSec: formData.get("startSec"),
        endSec: formData.get("endSec"),
        backgroundMode: formData.get("backgroundMode"),
        outputFormat: formData.get("outputFormat"),
        jpgQuality: Number(formData.get("jpgQuality") || 90)
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "自动抽帧失败");
    latestJob = { result };
    renderResult(result);
    setProgress("导出完成", "100%", 100);
    addToRecent(result, {
      mode: "frames",
      prompt: actionPrompt.value || "",
      modelName: ""
    });
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function loadConfig() {
  const response = await fetch("/api/config");
  const config = await response.json();
  const dot = document.querySelector("#statusDot");
  if (config.mock) {
    configStatus.textContent = "演示模式";
    if (dot) { dot.className = "status-dot warn"; dot.title = "不会产生 API 费用"; }
  } else {
    configStatus.textContent = "已连接";
    if (dot) { dot.className = "status-dot ok"; dot.title = "API 密钥已配置，本地运行中"; }
  }
}

async function pollJob(jobId) {
  currentJobId = jobId;
  try {
    const response = await fetch(`/api/jobs/${jobId}`);
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || "任务不存在");
    renderJob(job);
    if (job.status === "complete" || job.status === "failed" || job.status === "cancelled") {
      setBusy(false);
      currentJobId = null;
      return;
    }
    setTimeout(() => pollJob(jobId), 1300);
  } catch (error) {
    showError(error);
    setBusy(false);
  }
}

function renderJob(job) {
  latestJob = job;
  setProgress(job.step, `${job.progress}%`, job.progress);
  if (job.error) showError(job.error);
  renderJobLog(job);
  if (job.result) renderResult(job.result);
  if (job.status === "complete" && job.result) {
    const input = job.input || {};
    const context = {
      mode: input.toolMode || guessModeFromInput(input),
      prompt: input.characterPrompt || input.actionPrompt || input.cutoutActionName || "",
      modelName: input.characterImageModel || input.videoModel || ""
    };
    addToRecent(job.result, context);
  }
}

function guessModeFromInput(input) {
  if (!input) return "character";
  if (input.cutoutImage) return "cutout";
  if (input.actionReferenceVideoUrl || (input.actionPrompt && (input.characterReference || (Array.isArray(input.characterReferences) && input.characterReferences.length)))) return "motion";
  if (input.workflowAction === "video" || input.workflowAction === "frames") return "frames";
  if (Array.isArray(input.rows) || input.batchName) return "uiBatch";
  return "character";
}

function showCurrentResult({ type, src, alt, result }) {
  const card = document.querySelector("#currentResult");
  const body = document.querySelector("#currentResultBody");
  if (!card || !body) return;
  let html = "";
  if (type === "image" && src) {
    html = `<a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${escapeHtml(alt || "结果")}" /></a>`;
  } else if (type === "uiBatch" && result?.uiAssets) {
    const assets = result.uiAssets;
    const rows = assets.map((a) => `
      <article class="batch-asset ${a.status}">
        ${a.url ? `<img src="${a.url}" alt="${escapeHtml(a.assetName)}" />` : `<div class="batch-missing">失败</div>`}
        <strong>${escapeHtml(a.assetName)}</strong>
        <span>${escapeHtml(a.type || "ui")} · ${escapeHtml(a.size || "")} · ${a.cutout ? "已抠图" : "原图"}</span>
        ${a.error ? `<small>${escapeHtml(a.error)}</small>` : ""}
      </article>
    `).join("");
    html = `
      ${result.preview ? `<img class="batch-contact" src="${result.preview}" alt="UI 批量预览" />` : ""}
      <div class="batch-grid">${rows}</div>
    `;
  } else if (type === "batchCutout" && result?.batchResults) {
    const rows = result.batchResults.map((r) => `
      <article class="batch-asset ${r.status}">
        ${r.image ? `<img src="${r.image}" alt="${escapeHtml(r.assetName)}" />` : `<div class="batch-missing">失败</div>`}
        <strong>${escapeHtml(r.assetName)}</strong>
        <span>${r.sourceSize || ""}${r.status === "complete" ? " · 已抠图" : ""}</span>
        ${r.error ? `<small>${escapeHtml(r.error)}</small>` : ""}
      </article>
    `).join("");
    html = `<div class="batch-grid">${rows}</div>`;
  }
  if (!html) return;
  body.innerHTML = html;
  card.hidden = false;
  // 滚动到结果
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderResult(result) {
  if (result.video) useVideo(result.video);
  if (result.image) {
    previewArea.classList.remove("empty");
    previewArea.innerHTML = `<img src="${result.image}" alt="Character preview" />`;
    showCurrentResult({ type: "image", src: result.image, alt: "生图结果" });
  }
  if (result.preview) {
    previewArea.classList.remove("empty");
    previewArea.innerHTML = `<img src="${result.preview}" alt="Frame preview" />`;
    showCurrentResult({ type: "image", src: result.preview, alt: "抽帧结果" });
  }
  if (result.uiAssets) {
    renderUiBatchResult(result);
    showCurrentResult({ type: "uiBatch", result });
  }
  if (result.batchResults) {
    renderBatchCutoutResult(result);
    showCurrentResult({ type: "batchCutout", result });
  }
  if (result.frames && result.frames.length) {
    // 抽帧/序列帧导出完成 → 加载到序列帧播放器
    initSequencePlayer(result.frames, "导出序列帧");
  }
  // 优先展示归档后的磁盘路径(若后端已完成自动归档)
  const exportAbs = result.exportAbs || "";
  const exportRel = result.exportDir || "";
  const pathDisplay = exportRel && !exportRel.startsWith("/staging/")
    ? exportRel
    : (exportRel ? exportRel.replace(/^\/staging\//, "staging/") : "");
  links.innerHTML = [
    result.download ? `<a href="${result.download}" download>下载图片</a>` : "",
    result.manifest ? `<a href="${result.manifest}" target="_blank">查看 manifest</a>` : "",
    result.preview ? `<a href="${result.preview}" target="_blank">打开预览图</a>` : "",
    exportAbs ? `<button type="button" class="link-button open-folder" data-path="${escapeHtml(exportAbs)}" title="${escapeHtml(exportAbs)}">📁 在文件夹中显示</button>` : "",
    exportRel ? `<button type="button" class="link-button copy-path" data-path="${escapeHtml(exportRel)}" title="复制路径">📋 复制路径</button>` : "",
    result.videoInfo ? `<span>实际视频：${formatVideoInfo(result.videoInfo)}</span>` : "",
    pathDisplay ? `<code class="export-path">${escapeHtml(pathDisplay)}</code>` : ""
  ].filter(Boolean).join("");
  links.querySelector("[data-download-zip]")?.addEventListener("click", (event) => {
    event.preventDefault();
    downloadZip(event.currentTarget.dataset.downloadZip, event.currentTarget);
  });
  links.querySelector(".save-staging")?.addEventListener("click", async (event) => {
    event.preventDefault();
    const btn = event.currentTarget;
    const staging = btn.dataset.staging;
    if (!staging) return;
    try {
      btn.disabled = true;
      btn.textContent = "正在保存...";
      const resp = await fetch("/api/save-staging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stagingPath: staging, characterName: btn.dataset.char, actionName: btn.dataset.act })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "保存失败");
      btn.textContent = "已保存 ✓";
      btn.disabled = true;
      if (data.zip) {
        const a = document.createElement("a");
        a.href = data.zip;
        a.download = "";
        a.style.display = "none";
        document.body.append(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      showError(err);
      btn.textContent = "保存到本地";
      btn.disabled = false;
    }
  });
  links.querySelector(".open-folder")?.addEventListener("click", async (event) => {
    event.preventDefault();
    const btn = event.currentTarget;
    const targetPath = btn.dataset.path;
    if (!targetPath) return;
    try {
      btn.disabled = true;
      const resp = await fetch("/api/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: targetPath })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "打开失败");
      btn.textContent = "📁 已打开";
    } catch (err) {
      showError(err);
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "📁 在文件夹中显示";
      }, 2000);
    }
  });
  links.querySelector(".copy-path")?.addEventListener("click", async (event) => {
    event.preventDefault();
    const btn = event.currentTarget;
    const p = btn.dataset.path;
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p);
      btn.textContent = "✓ 已复制";
      setTimeout(() => { btn.textContent = "📋 复制路径"; }, 1500);
    } catch (err) {
      // fallback: 用 textarea 选中文本
      const ta = document.createElement("textarea");
      ta.value = p;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); btn.textContent = "✓ 已复制"; } catch {}
      ta.remove();
      setTimeout(() => { btn.textContent = "📋 复制路径"; }, 1500);
    }
  });
}

function renderUiBatchResult(result) {
  const assets = result.uiAssets || [];
  const rows = assets.map((asset) => `
    <article class="batch-asset ${asset.status}">
      ${asset.url ? `<img src="${asset.url}" alt="${escapeHtml(asset.assetName)}" />` : `<div class="batch-missing">失败</div>`}
      <strong>${escapeHtml(asset.assetName)}</strong>
      <span>${escapeHtml(asset.type || "ui")} · ${escapeHtml(asset.size || "")} · ${asset.cutout ? "已抠图" : "原图"}</span>
      ${asset.generatedUrl && asset.generatedUrl !== asset.url ? `<a href="${asset.generatedUrl}" target="_blank">查看原图</a>` : ""}
      ${asset.error ? `<small>${escapeHtml(asset.error)}</small>` : ""}
    </article>
  `).join("");
  previewArea.className = "preview batch-preview";
  previewArea.innerHTML = `
    <div class="batch-result">
      ${result.preview ? `<img class="batch-contact" src="${result.preview}" alt="UI batch preview" />` : ""}
      <div class="batch-grid">${rows}</div>
    </div>
  `;
}

function renderBatchCutoutResult(result) {
  const results = result.batchResults || [];
  const rows = results.map((r) => `
    <article class="batch-asset ${r.status}">
      ${r.image ? `<img src="${r.image}" alt="${escapeHtml(r.assetName)}" />` : `<div class="batch-missing">失败</div>`}
      <strong>${escapeHtml(r.assetName)}</strong>
      <span>${r.sourceSize || ""}${r.status === "complete" ? " · 已抠图" : ""}</span>
      ${r.error ? `<small>${escapeHtml(r.error)}</small>` : ""}
    </article>
  `).join("");
  previewArea.className = "preview batch-preview";
  previewArea.innerHTML = `
    <div class="batch-result">
      <div class="batch-grid">${rows}</div>
    </div>
  `;
}

function useVideo(video) {
  currentVideo = video;
  videoEmptyState.hidden = true;
  manualPanel.hidden = false;
  autoPanel.hidden = new FormData(form).get("frameWorkflow") !== "auto";
  renderVideoPreview(video);
  if (manualVideo.src !== location.origin + video) {
    manualVideo.src = video;
    manualVideo.load();
    filmstrip.innerHTML = "";
    filmstripFrames = [];
  }
  syncFramePanels();
}

function renderVideoPreview(video) {
  previewArea.className = "preview";
  previewArea.innerHTML = `<video class="asset-video" src="${video}" controls muted playsinline></video>`;
}

function syncControls() {
  const mode = new FormData(form).get("extractMode") || "count";
  document.querySelectorAll("[data-mode-field]").forEach((field) => {
    field.hidden = field.dataset.modeField !== mode;
  });
  jpgQualityField.hidden = outputFormat.value !== "jpg";
  syncCustomModelField();
  syncCustomImageModelFields();
  syncCostControls();
}

function syncToolMode() {
  const mode = new FormData(form).get("toolMode") || "character";
  const titles = {
    character: "生图画布",
    cutout: "图片抠图画布",
    motion: "动作视频画布",
    frames: "视频抽帧画布",
    uiBatch: "批量 UI 素材画布"
  };
  const hints = {
    character: "右侧上传参考图或填写描述，然后生成图片素材。",
    cutout: "右侧上传一张图片，选择抠图方式后直接导出透明 PNG。",
    motion: "右侧准备参考图、动作描述或视频 URL，生成后在这里预览视频并进入分帧。",
    frames: "右侧上传最终视频，上传后这里会出现播放器和抽帧工具。",
    uiBatch: "右侧上传 UI 素材提示词表格，确认后按行批量生成图标、按钮和面板。"
  };
  canvasTitle.textContent = titles[mode] || "当前资产";
  document.querySelectorAll("[data-mode-only]").forEach((element) => {
    const modes = element.dataset.modeOnly.split(",").map((item) => item.trim());
    element.hidden = !modes.includes(mode);
  });
  document.querySelectorAll("[data-motion-only]").forEach((element) => {
    element.hidden = mode !== "motion";
  });
  characterGenerateButton.hidden = mode !== "character";
  if (!currentVideo && previewArea.classList.contains("empty")) {
    // 保留 HTML 中的引导模板,只更新提示文字
    const hintEl = previewArea.querySelector(".empty-asset > p");
    const titleEl = previewArea.querySelector(".empty-asset > strong");
    if (hintEl) hintEl.textContent = hints[mode] || "选择一个工作流开始。";
    if (titleEl) titleEl.textContent = "开始你的第一个素材";
  }
  syncDefaultBackgroundModeForTool(mode);
}

function syncDefaultBackgroundModeForTool(mode) {
  if (!backgroundMode || backgroundModeTouched) return;
  backgroundMode.value = mode === "uiBatch" ? "auto" : "birefnet";
}

function switchToolMode(mode) {
  const input = document.querySelector(`input[name=toolMode][value="${mode}"]`);
  if (!input) return;
  input.checked = true;
  syncControls();
  syncToolMode();
  syncFramePanels();
  // 根据 data-default-open 决定 details 初始展开(用于 motion 模式下"画面"组默认折叠)
  document.querySelectorAll('details[data-default-open]').forEach((d) => {
    const allowed = (d.dataset.defaultOpen || '').split(',').map((s) => s.trim());
    d.open = allowed.includes(mode);
  });
}

function initReferenceUploader() {
  renderReferenceSlots();
  if (addReferenceButton) {
    addReferenceButton.addEventListener("click", () => referenceFileInput?.click());
  }
  if (referenceFileInput) {
    referenceFileInput.addEventListener("change", handleReferenceFilesPicked);
  }
}

function renderReferenceSlots() {
  if (!referenceSlots) return;
  let html = "";
  for (let i = 0; i < MAX_REFERENCES; i += 1) {
    const item = referenceImages[i];
    if (item) {
      const roleButtons = REFERENCE_ROLES.map((r) => (
        `<button type="button" data-role="${r.id}" class="${r.id === item.role ? "active" : ""}">${r.label}</button>`
      )).join("");
      html += `
        <div class="ref-slot" data-slot="${i}">
          <img class="ref-slot-preview" src="${item.dataUrl}" alt="参考图 ${i + 1}" />
          <div class="ref-slot-role">${roleButtons}</div>
          <em class="ref-slot-hint" style="font-size:11px;color:var(--muted-2);">第 ${i + 1} 张将随主体描述一起发给模型</em>
          <button type="button" class="ref-slot-remove" data-remove="${i}" aria-label="移除参考图">
            <i data-lucide="x"></i>
          </button>
        </div>
      `;
    } else {
      html += `
        <div class="ref-slot is-empty" data-slot="${i}">
          <i data-lucide="plus"></i><span>添加</span>
        </div>
      `;
    }
  }
  referenceSlots.innerHTML = html;
  if (window.lucide?.createIcons) window.lucide.createIcons();

  // 事件绑定
  referenceSlots.querySelectorAll(".ref-slot.is-empty").forEach((el) => {
    el.addEventListener("click", () => referenceFileInput?.click());
  });
  referenceSlots.querySelectorAll("[data-role]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.closest(".ref-slot").dataset.slot);
      if (referenceImages[idx]) {
        referenceImages[idx].role = btn.dataset.role;
        renderReferenceSlots();
      }
    });
  });
  referenceSlots.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.remove);
      referenceImages.splice(idx, 1);
      renderReferenceSlots();
      updateRefCount();
      updateReferencePreview();
    });
  });

  if (refCountLabel) refCountLabel.textContent = `${referenceImages.length}/${MAX_REFERENCES}`;
  if (addReferenceButton) addReferenceButton.hidden = referenceImages.length >= MAX_REFERENCES;
}

function updateRefCount() {
  if (refCountLabel) refCountLabel.textContent = `${referenceImages.length}/${MAX_REFERENCES}`;
  if (addReferenceButton) addReferenceButton.hidden = referenceImages.length >= MAX_REFERENCES;
}

async function handleReferenceFilesPicked(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  const remaining = MAX_REFERENCES - referenceImages.length;
  const accepted = files.slice(0, remaining);
  for (const file of accepted) {
    const dataUrl = await readFileAsDataUrl(file);
    referenceImages.push({
      file,
      role: REFERENCE_ROLES[referenceImages.length % REFERENCE_ROLES.length].id,
      dataUrl
    });
  }
  renderReferenceSlots();
  updateReferencePreview();
  // 清空 input 让同样文件可重选
  event.target.value = "";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function updateReferencePreview() {
  if (!referenceImages.length) return;
  previewArea.className = "preview";
  const grid = referenceImages.map((item, i) => (
    `<figure style="margin:0;"><img src="${item.dataUrl}" alt="参考图 ${i + 1}" style="max-width:240px;max-height:280px;object-fit:cover;border-radius:10px;" /><figcaption style="font-size:11px;color:var(--muted);margin-top:4px;">#${i + 1} ${REFERENCE_ROLES.find((r) => r.id === item.role)?.label || item.role}</figcaption></figure>`
  )).join("");
  previewArea.innerHTML = `<div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">${grid}</div>`;
  setProgress(`已选择 ${referenceImages.length} 张参考图，填写描述后点击生成`, "Ready", 100);
}

function buildReferencePromptSuffix() {
  if (!referenceImages.length) return "";
  const lines = referenceImages.map((item, i) => {
    const roleLabel = REFERENCE_ROLES.find((r) => r.id === item.role)?.label || item.role;
    return `参考图 ${i + 1}（${roleLabel}）：按该图${roleLabel}理解并融入生成结果。`;
  });
  return `\n\n参考图说明：\n${lines.join("\n")}`;
}

function appendReferenceFieldsToFormData(formData) {
  // 移除旧单图字段,统一用 characterReferences + referenceRoles
  formData.delete("characterReference");
  formData.delete("characterReferences");
  referenceImages.forEach((item, i) => {
    formData.append("characterReferences", item.file, item.file.name || `ref-${i + 1}.png`);
  });
  formData.set("referenceRoles", JSON.stringify(referenceImages.map((item) => item.role)));
  formData.set("referenceCount", String(referenceImages.length));
}

function handleCharacterReferenceChange() {
  // 已弃用: 多图改由 referenceImages 状态管理,保留以防旧调用残留
}

function syncCustomModelField() {
  customModelField.hidden = videoModel.value !== "custom";
}

function syncCustomImageModelFields() {
  const mode = new FormData(form).get("toolMode") || "character";
  if (customCharacterImageModelField) {
    customCharacterImageModelField.hidden = !["character", "motion"].includes(mode) || characterImageModel.value !== "custom";
  }
  if (customUiImageModelField) {
    customUiImageModelField.hidden = mode !== "uiBatch" || uiImageModel.value !== "custom";
  }
}

function syncCostControls() {
  if (!videoResolution || !costCard) return;
  const model = videoModel.value === "custom" ? customVideoModel.value.trim() : videoModel.value;
  let duration = Number(videoDuration.value || 4);
  let specialNote = "";

  if (isMiniMaxVideoModel(model)) {
    const normalizedDuration = duration <= 6 ? 6 : 10;
    if (duration !== normalizedDuration) {
      videoDuration.value = String(normalizedDuration);
      duration = normalizedDuration;
      specialNote = "MiniMax 图生视频目前按 6 秒或 10 秒生成，这里已自动切到最近的可用秒数。";
    }
    if (videoResolution.value === "480p" && !model.includes("MiniMax-Hailuo-02")) {
      videoResolution.value = "720p";
      specialNote = "Hailuo 2.3 / 2.3 Fast 不支持 512P，这里已自动切到 768P 对应的 720p 档。";
    }
    if (videoResolution.value === "1080p" && duration !== 6) {
      videoResolution.value = "720p";
      specialNote = "MiniMax 1080P 只支持 6 秒；10 秒打样会自动使用 768P。";
    }
  }

  if (model.includes("seedance-2-0-fast") && videoResolution.value === "1080p") {
    videoResolution.value = "720p";
    specialNote = "2.0 fast 通常不建议用 1080p：要么更贵，要么可能被模型限制拒绝。这里先帮你降到 720p。";
  }

  const resolutionScore = { "480p": 1, "720p": 2, "1080p": 4 }[videoResolution.value] || 2;
  const fpsScore = 1;
  const modelScore = model.includes("seedance-2-0") ? 2 : model.toLowerCase().includes("fast") ? 1 : model.includes("minimax-video") ? 1.2 : 1.3;
  const durationScore = duration / 4;
  const score = resolutionScore * fpsScore * modelScore * durationScore;

  let level = "省钱档";
  let text = "适合反复试动作。";
  if (score >= 16) {
    level = "高成本";
    text = "建议只在动作已经确定后使用。";
  } else if (score >= 9) {
    level = "偏贵";
    text = "可以出正式版，但不适合大量试错。";
  } else if (score >= 5) {
    level = "中等";
    text = "适合小批量测试。";
  }

  const fpsLabel = isMiniMaxVideoModel(model) ? "MiniMax 官方视频档" : "官方约 24fps";
  costHint.textContent = `${videoResolution.value} / ${duration} 秒 / ${fpsLabel}：${level}`;
  costCard.innerHTML = `<strong>当前成本档位：${level}</strong><p>${videoResolution.value}，${duration} 秒，${fpsLabel}。${text}</p>`;
  costNote.textContent = specialNote || (isMiniMaxVideoModel(model)
    ? "MiniMax 图生视频以参考图作为首帧，动作主要由提示词控制。"
    : videoResolution.value === "1080p"
    ? "1080p 像素量明显更高，建议先用 720p 确认动作和画面稳定性。"
    : "真正稳定的省钱项是模型、分辨率和秒数；帧率可能被模型忽略，不要把它当成可靠降价按钮。");
}

function isMiniMaxVideoModel(model) {
  return String(model || "").startsWith("minimax-video:");
}

function applySelectedModel(formData) {
  if (videoModel.value === "custom") {
    const model = customVideoModel.value.trim();
    if (!model) throw new Error("请填写已开通的自定义视频模型 ID。");
    formData.set("videoModel", model);
  }
}

function applySelectedImageModel(formData, select) {
  formData.delete("characterImageModel");
  formData.delete("uiImageModel");
  formData.delete("customCharacterImageModel");
  formData.delete("uiCustomImageModel");
  if (!select?.value) return;
  if (select.value === "custom") {
    const input = select === uiImageModel ? uiCustomImageModel : customCharacterImageModel;
    const model = input?.value?.trim();
    if (!model) throw new Error("请填写已开通的自定义图片模型 ID。");
    formData.set("imageModel", model);
  } else {
    formData.set("imageModel", select.value);
  }
}

function schedulePromptPreview() {
  if (!promptPreview) return;
  clearTimeout(promptPreviewTimer);
  promptPreviewTimer = setTimeout(updatePromptPreview, 180);
}

async function updatePromptPreview() {
  if (!promptPreview) return;
  const mode = new FormData(form).get("toolMode") || "character";
  if (mode !== "motion") return;

  const formData = new FormData(form);
  formData.delete("finalVideo");
  formData.delete("characterReference");
  formData.delete("characterReferences");
  formData.delete("cutoutImages");
  if (videoModel.value === "custom" && customVideoModel.value.trim()) {
    formData.set("videoModel", customVideoModel.value.trim());
  }

  try {
    const response = await fetch("/api/prompt-preview", {
      method: "POST",
      body: formData
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "提示词预览失败");
    promptPreview.textContent = result.prompt || "还没有动作描述。";
    promptPreviewMeta.textContent = result.imageRole === "first_frame"
      ? "当前模型会以参考图作为首帧，并追加视角、背景和游戏素材约束"
      : "当前模型会以参考图作为参考图，并追加视角、背景和游戏素材约束";
  } catch (error) {
    promptPreview.textContent = error.message || String(error);
    promptPreviewMeta.textContent = "提示词预览暂时不可用";
  }
}

function syncRatioForCamera() {
  const recommended = {
    side: "16:9",
    front: "1:1",
    topdown: "1:1",
    isometric: "1:1"
  };
  videoRatio.value = recommended[cameraView.value] || "16:9";
}

function syncFramePanels() {
  const workflow = new FormData(form).get("frameWorkflow") || "manual";
  if (!currentVideo) {
    manualPanel.hidden = true;
    autoPanel.hidden = true;
    videoEmptyState.hidden = false;
    return;
  }
  videoEmptyState.hidden = true;
  manualPanel.hidden = workflow !== "manual";
  autoPanel.hidden = workflow !== "auto";
}

function renderPresets() {
  actionPresets.innerHTML = presets.map((preset) => (
    `<button class="preset-button" type="button" data-preset="${preset.name}">${preset.name}</button>`
  )).join("");
  actionPresets.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]");
    if (!button) return;
    const preset = presets.find((item) => item.name === button.dataset.preset);
    if (!preset) return;
    actionPrompt.value = preset.text;
    actionPrompt.focus();
    schedulePromptPreview();
  });
}

function resetResultOnly() {
  errorBox.textContent = "";
  jobLog.hidden = true;
  jobLog.innerHTML = "";
  links.innerHTML = "";
  previewArea.className = "preview empty";
  previewArea.innerHTML = `<div class="empty-asset"><strong>正在准备</strong><p>处理结果会出现在中央画布，导出入口会固定显示在下方。</p></div>`;
  setProgress("等待开始", "0%", 0);
}

function resetVideoWorkspace() {
  resetResultOnly();
  latestJob = null;
  currentVideo = null;
  manualCaptures = [];
  filmstripFrames = [];
  manualPanel.hidden = true;
  autoPanel.hidden = true;
  videoEmptyState.hidden = false;
  manualVideo.removeAttribute("src");
  manualVideo.load();
  timeScrubber.value = "0";
  timeScrubber.max = "1";
  currentTimeLabel.textContent = "0.000s";
  updateStepButtons();
  filmstrip.innerHTML = "";
  renderManualCaptures();
}

async function buildFilmstrip() {
  if (!manualVideo.duration || !manualVideo.videoWidth) return;
  const originalTime = manualVideo.currentTime;
  const count = 14;
  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = Math.round(180 * (manualVideo.videoHeight / manualVideo.videoWidth));
  const context = canvas.getContext("2d");
  filmstripFrames = [];
  filmstrip.innerHTML = "";
  manualVideo.pause();

  for (let index = 0; index < count; index += 1) {
    const time = count === 1 ? 0 : (manualVideo.duration * index) / (count - 1);
    await seekVideo(time);
    context.drawImage(manualVideo, 0, 0, canvas.width, canvas.height);
    const thumbnail = canvas.toDataURL("image/jpeg", 0.78);
    filmstripFrames.push({ time, thumbnail });
  }

  filmstrip.innerHTML = filmstripFrames.map((frame, index) => `
    <button type="button" class="film-frame" data-time="${frame.time}">
      <img src="${frame.thumbnail}" alt="Timeline frame ${index + 1}" />
      <span>${formatTime(frame.time)}</span>
    </button>
  `).join("");
  filmstrip.querySelectorAll("[data-time]").forEach((button) => {
    button.addEventListener("click", () => seekTo(Number(button.dataset.time)));
  });
  await seekVideo(originalTime);
  updateFilmstripSelection();
}

function seekVideo(time) {
  return new Promise((resolve) => {
    const done = () => {
      manualVideo.removeEventListener("seeked", done);
      resolve();
    };
    manualVideo.addEventListener("seeked", done, { once: true });
    manualVideo.currentTime = Math.min(Math.max(time, 0), manualVideo.duration || time);
  });
}

function seekWithWheel(event) {
  if (!manualVideo.duration) return;
  event.preventDefault();
  const step = event.shiftKey ? 0.01 : 0.04;
  const direction = event.deltaY > 0 ? 1 : -1;
  seekTo(manualVideo.currentTime + direction * step);
}

function syncScrubberBounds() {
  if (!manualVideo.duration) return;
  timeScrubber.max = String(manualVideo.duration);
  timeScrubber.step = "0.001";
  updateStepButtons();
  syncScrubberFromVideo();
}

function syncScrubberFromVideo() {
  if (!manualVideo.duration) return;
  timeScrubber.value = String(manualVideo.currentTime);
  currentTimeLabel.textContent = formatPreciseTime(manualVideo.currentTime);
  updateFilmstripSelection();
}

function stepVideo(direction) {
  if (!manualVideo.duration) {
    showError("请先上传或生成视频，等视频加载出来后再微调。");
    return;
  }
  seekTo(manualVideo.currentTime + direction / 24);
}

function updateStepButtons() {
  const ready = Boolean(manualVideo.duration);
  prevFrameButton.disabled = !ready;
  nextFrameButton.disabled = !ready;
  timeScrubber.disabled = !ready;
}

function beginTimelineDrag(event) {
  if (!manualVideo.duration) return;
  isDraggingTimeline = true;
  filmstrip.setPointerCapture?.(event.pointerId);
  seekFromTimelinePointer(event);
}

function dragTimeline(event) {
  if (!isDraggingTimeline) return;
  seekFromTimelinePointer(event);
}

function endTimelineDrag() {
  isDraggingTimeline = false;
}

function seekFromTimelinePointer(event) {
  const rect = filmstrip.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX - rect.left + filmstrip.scrollLeft, 0), filmstrip.scrollWidth);
  const ratio = filmstrip.scrollWidth ? x / filmstrip.scrollWidth : 0;
  seekTo(ratio * manualVideo.duration);
}

function seekTo(time) {
  if (!manualVideo.duration) return;
  const safeTime = Math.min(Math.max(Number(time) || 0, 0), manualVideo.duration);
  pendingSeek = safeTime;
  manualVideo.pause();
  manualVideo.currentTime = safeTime;
  timeScrubber.value = String(safeTime);
  currentTimeLabel.textContent = formatPreciseTime(safeTime);
  requestAnimationFrame(() => {
    if (pendingSeek === safeTime) updateFilmstripSelection();
  });
}

function updateFilmstripSelection() {
  if (!filmstripFrames.length) return;
  const buttons = [...filmstrip.querySelectorAll(".film-frame")];
  let nearest = 0;
  let best = Infinity;
  filmstripFrames.forEach((frame, index) => {
    const distance = Math.abs(frame.time - manualVideo.currentTime);
    if (distance < best) {
      best = distance;
      nearest = index;
    }
  });
  buttons.forEach((button, index) => button.classList.toggle("active", index === nearest));
}

function captureCurrentFrame() {
  if (!manualVideo.src || !manualVideo.videoWidth) {
    showError("视频还没有准备好。");
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = manualVideo.videoWidth;
  canvas.height = manualVideo.videoHeight;
  const context = canvas.getContext("2d");
  context.drawImage(manualVideo, 0, 0, canvas.width, canvas.height);
  manualCaptures.push({
    time: Number(manualVideo.currentTime.toFixed(3)),
    thumbnail: canvas.toDataURL("image/jpeg", 0.82)
  });
  renderManualCaptures();
}

function renderManualCaptures() {
  if (!manualCaptures.length) {
    manualFrames.innerHTML = `<p class="empty-note">还没有手动截帧。先拖动时间轴，再点“截取当前帧”。</p>`;
    return;
  }
  manualFrames.innerHTML = manualCaptures.map((capture, index) => `
    <article class="manual-frame">
      <img src="${capture.thumbnail}" alt="Manual frame ${index + 1}" />
      <span>${index + 1}. ${formatTime(capture.time)}</span>
      <button type="button" data-remove-frame="${index}">删除</button>
    </article>
  `).join("");
  manualFrames.querySelectorAll("[data-remove-frame]").forEach((button) => {
    button.addEventListener("click", () => {
      manualCaptures.splice(Number(button.dataset.removeFrame), 1);
      renderManualCaptures();
    });
  });
  // 手动截取的帧也喂给序列帧播放器(预览时用)
  if (manualCaptures.length) {
    initSequencePlayer(manualCaptures.map((c) => c.thumbnail), "手动截取帧");
  } else {
    clearSequencePlayer();
  }
}

async function exportManualFrames() {
  if (!currentVideo) {
    showError("请先上传或生成一个视频。");
    return;
  }
  if (!manualCaptures.length) {
    showError("请先截取至少一帧。");
    return;
  }
  try {
    setAutoNames("manual");
    manualExportButton.disabled = true;
    setProgress("正在导出手动选帧", "70%", 70);
    const formData = new FormData(form);
    const response = await fetch("/api/manual-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        video: currentVideo,
        characterName: formData.get("characterName"),
        actionName: formData.get("actionName"),
        times: manualCaptures.map((item) => item.time),
        backgroundMode: formData.get("backgroundMode"),
        outputFormat: formData.get("outputFormat"),
        jpgQuality: Number(formData.get("jpgQuality") || 90)
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "手动导出失败");
    latestJob = { result };
    renderResult(result);
    setProgress("导出完成", "100%", 100);
    addToRecent(result, {
      mode: "frames",
      prompt: actionPrompt.value || "",
      modelName: ""
    });
  } catch (error) {
    showError(error);
  } finally {
    manualExportButton.disabled = false;
  }
}

async function downloadZip(href, button) {
  if (!href) return;
  const originalText = button.textContent;
  try {
    button.disabled = true;
    button.textContent = "正在准备 ZIP...";
    const response = await fetch(href);
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "ZIP 下载失败");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = getDownloadName(response) || "frames.zip";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function getDownloadName(response) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || "";
}

function setAutoNames(kind = "asset") {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15).replace("T", "_");
  if (!characterNameInput.value.trim()) {
    characterNameInput.value = "sprite";
  }
  if (!actionNameInput.value.trim()) {
    actionNameInput.value = `${kind}_${stamp}`;
  }
}

let taskTimerHandle = null;
let taskStartedAt = 0;
let currentJobId = null;

function startTaskTimer() {
  stopTaskTimer();
  taskStartedAt = Date.now();
  if (taskTimer) {
    taskTimer.hidden = false;
    taskTimer.textContent = "00:00";
  }
  taskTimerHandle = setInterval(() => {
    if (!taskTimer) return;
    const elapsed = Math.floor((Date.now() - taskStartedAt) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const s = String(elapsed % 60).padStart(2, "0");
    taskTimer.textContent = `${m}:${s}`;
  }, 1000);
}

function stopTaskTimer() {
  if (taskTimerHandle) {
    clearInterval(taskTimerHandle);
    taskTimerHandle = null;
  }
  if (taskTimer && !currentJobId) taskTimer.hidden = true;
}

function setTaskMeta(modelName) {
  if (!taskMeta) return;
  if (modelName) {
    taskMeta.hidden = false;
    taskMeta.textContent = `· ${modelName}`;
  } else {
    taskMeta.hidden = true;
    taskMeta.textContent = "";
  }
}

function setProgress(title, text, percent) {
  stepTitle.textContent = title;
  progressText.textContent = text;
  barFill.style.width = `${percent}%`;
  // 从 title 末尾括号里提取模型名（如果有）
  const m = String(title || "").match(/[（(]([^()]+)[)）]\s*$/);
  setTaskMeta(m ? m[1] : "");
}

function formatTime(seconds) {
  return `${seconds.toFixed(2)}s`;
}

function formatPreciseTime(seconds) {
  return `${seconds.toFixed(3)}s`;
}

function formatVideoInfo(info) {
  const size = info.width && info.height ? `${info.width}×${info.height}` : "未知尺寸";
  const fps = info.fps ? `${Number(info.fps).toFixed(2)}fps` : "未知 fps";
  const duration = info.duration ? `${Number(info.duration).toFixed(2)} 秒` : "未知时长";
  return `${size} / ${fps} / ${duration}`;
}

function showError(error) {
  const message = error.message || String(error);
  if (message.includes("ModelNotOpen")) {
    errorBox.textContent = "当前账号还没有开通所选模型。请在火山方舟控制台确认图片模型或视频模型已开通；生图报错时先切换“图片模型”，视频报错时切换“视频模型”。";
    return;
  }
  if (message.includes("InvalidEndpointOrModel.NotFound")) {
    errorBox.textContent = "模型 ID 不存在或当前账号没有权限。生图任务请检查“图片模型”，视频任务请检查“视频模型”，必须和方舟控制台已开通的模型 ID 完全一致。";
    return;
  }
  if (message.includes("task_type") && message.includes("r2v")) {
    errorBox.textContent = "当前模型不支持参考图 r2v 模式。工具已改为：1.5/1.0 用首帧图生视频，2.0 用参考图模式。请刷新页面后再试一次。";
    return;
  }
  if (message.includes("framespersecond")) {
    errorBox.textContent = "当前模型不接受这个帧率设置。把“生成帧率”改回“模型默认 / 最稳”再试一次。";
    return;
  }
  if (message.includes("resolution")) {
    errorBox.textContent = "当前模型不接受这个分辨率设置。建议先改成 720p；如果还是失败，再用 480p 测试。";
    return;
  }
  if (message.includes("reference_video") && message.includes("web url")) {
    errorBox.textContent = "动作参考视频必须是公网 Web URL。火山方舟不接受本地上传视频作为 reference_video；如果只是想抽帧，请把视频放到 01 的“最终动作视频”。";
    return;
  }
  if (message.includes("resource download failed") || message.includes("content[2].video_url")) {
    errorBox.textContent = "火山方舟下载动作参考视频失败。请确认填的是 TOS 对象的预签名下载 URL，不是控制台地址；链接没有过期；复制到无痕窗口能直接播放或下载 mp4。";
    return;
  }
  if (message.includes("BiRefNet needs") || message.includes("AutoModelForImageSegmentation") || message.includes("torch")) {
    errorBox.textContent = "BiRefNet 本地模型没有准备好，可能缺少 torch / torchvision / transformers，或第一次下载模型太慢。可以先切回“快速绿幕/白底抠图”；如果要继续用 BiRefNet，需要先把本地模型依赖准备好。";
    return;
  }
  errorBox.textContent = message;
}

function renderJobLog(job) {
  const lines = [
    `本地任务：${job.id || "未知"}`,
    job.arkTaskId ? `方舟任务：${job.arkTaskId}` : "",
    ...(job.logs || []).slice(-8)
  ].filter(Boolean);
  if (!lines.length) {
    jobLog.hidden = true;
    return;
  }
  jobLog.hidden = false;
  jobLog.innerHTML = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

function setBusy(isBusy) {
  aiGenerateButton.disabled = isBusy;
  characterGenerateButton.disabled = isBusy;
  cutoutButton.disabled = isBusy;
  uiBatchButton.disabled = isBusy;
  autoExportButton.disabled = isBusy || !currentVideo;
  manualExportButton.disabled = isBusy || !currentVideo;
  if (cancelTaskButton) {
    cancelTaskButton.hidden = !isBusy;
    // 生图是同步接口,没有 jobId 可取消,按钮置灰并加提示
    const isCancellable = !!currentJobId;
    cancelTaskButton.disabled = !isCancellable;
    cancelTaskButton.title = isCancellable
      ? "停止当前任务"
      : "生图任务为同步请求,无法中途取消,请等待返回";
  }
  if (isBusy) {
    startTaskTimer();
  } else {
    stopTaskTimer();
  }
}

/* ===== 序列帧动画预览器 ===== */

const sequenceEl = document.querySelector("#sequencePlayer");
const sequenceFrame = document.querySelector("#sequenceFrame");
const sequenceEmpty = document.querySelector(".sequence-empty");
const sequenceIndexEl = document.querySelector("#sequenceIndex");
const sequenceTotalEl = document.querySelector("#sequenceTotal");
const sequenceThumbsEl = document.querySelector("#sequenceThumbs");
const sequencePlayBtn = document.querySelector("#sequencePlay");
const sequencePlayIcon = document.querySelector("#sequencePlayIcon");
const sequenceFirstBtn = document.querySelector("#sequenceFirst");
const sequencePrevBtn = document.querySelector("#sequencePrev");
const sequenceNextBtn = document.querySelector("#sequenceNext");
const sequenceLastBtn = document.querySelector("#sequenceLast");
const sequenceLoopInput = document.querySelector("#sequenceLoop");
const sequencePingpongInput = document.querySelector("#sequencePingpong");
const sequenceHintEl = document.querySelector("#sequenceHint");
const sequenceDurationInput = document.querySelector("#sequenceDuration");
const sequenceDurationValue = document.querySelector("#sequenceDurationValue");
const sequenceResetBtn = document.querySelector("#sequenceResetBtn");
const sequenceTimelineEl = document.querySelector("#sequenceTimeline");
const sequenceTimelineTrack = document.querySelector("#sequenceTimelineTrack");
const sequenceTimelineHandles = document.querySelector("#sequenceTimelineHandles");
const sequenceTimelineCursor = document.querySelector("#sequenceTimelineCursor");
const sequenceTimelineMarks = document.querySelector("#sequenceTimelineMarks");

let sequenceFrames = [];
// 每帧在时间轴上的归一化位置 [0, 1],长度 = sequenceFrames.length
// 第 0 帧固定 0,最后一帧固定 1,中间帧可拖动(0 < pos[i-1] < pos[i] < pos[i+1] < 1)
let sequencePositions = [];
let sequenceDir = 1; // 来回播放方向
let sequenceTimer = null;
let sequenceProgress = 0; // 当前播放进度 [0, 1]
let sequenceLoaded = false;

function clearSequencePlayer() {
  stopSequenceTimer();
  sequenceFrames = [];
  sequencePositions = [];
  sequenceProgress = 0;
  if (sequenceEl) sequenceEl.hidden = true;
}

function setSequencePlayIcon(playing) {
  if (!sequencePlayIcon) return;
  sequencePlayIcon.setAttribute("data-lucide", playing ? "pause" : "play");
  if (window.lucide) window.lucide.createIcons();
}

// 根据 progress 找到当前帧序号
function progressToFrameIdx(progress) {
  if (!sequenceFrames.length) return 0;
  for (let i = 0; i < sequencePositions.length; i++) {
    if (progress <= sequencePositions[i]) return i;
  }
  return sequenceFrames.length - 1;
}

function getTotalDurationMs() {
  // slider min="0.4",这里取 0.2s 作下限保证流畅
  const sec = Math.max(0.2, Number(sequenceDurationInput?.value) || 1);
  return sec * 1000;
}

function renderSequenceFrame() {
  if (!sequenceFrame) return;
  if (!sequenceFrames.length) {
    sequenceFrame.removeAttribute("src");
    if (sequenceEmpty) sequenceEmpty.style.display = "";
    if (sequenceIndexEl) sequenceIndexEl.textContent = "0";
    if (sequenceTotalEl) sequenceTotalEl.textContent = "0";
    if (sequenceTimelineCursor) sequenceTimelineCursor.style.left = "0%";
    return;
  }
  const idx = progressToFrameIdx(sequenceProgress);
  sequenceFrame.src = sequenceFrames[idx];
  if (sequenceEmpty) sequenceEmpty.style.display = "none";
  if (sequenceIndexEl) sequenceIndexEl.textContent = String(idx + 1);
  if (sequenceTotalEl) sequenceTotalEl.textContent = String(sequenceFrames.length);
  // 进度光标
  if (sequenceTimelineCursor) {
    sequenceTimelineCursor.style.left = `${sequenceProgress * 100}%`;
  }
  // 高亮缩略图 + handle
  if (sequenceThumbsEl) {
    sequenceThumbsEl.querySelectorAll(".sequence-thumb").forEach((t, i) => {
      t.classList.toggle("is-active", i === idx);
    });
  }
  if (sequenceTimelineHandles) {
    sequenceTimelineHandles.querySelectorAll(".sequence-handle").forEach((h, i) => {
      h.classList.toggle("is-current", i === idx);
    });
  }
}

function renderSequenceThumbs() {
  if (!sequenceThumbsEl) return;
  if (!sequenceFrames.length) {
    sequenceThumbsEl.innerHTML = "";
    return;
  }
  sequenceThumbsEl.innerHTML = sequenceFrames.map((src, i) => `
    <button type="button" class="sequence-thumb" data-seq-idx="${i}" title="第 ${i + 1} 帧">
      <img src="${src}" alt="第 ${i + 1} 帧" loading="lazy" />
    </button>
  `).join("");
  sequenceThumbsEl.querySelectorAll(".sequence-thumb").forEach((btn) => {
    btn.addEventListener("click", () => {
      stopSequenceTimer();
      const i = Number(btn.dataset.seqIdx);
      sequenceProgress = sequencePositions[i];
      renderSequenceFrame();
    });
  });
}

// 渲染时间轴上的把手 + 标尺
function renderTimelineHandles() {
  if (!sequenceTimelineHandles) return;
  if (sequenceFrames.length < 2) {
    sequenceTimelineHandles.innerHTML = "";
    if (sequenceTimelineMarks) sequenceTimelineMarks.innerHTML = "";
    return;
  }
  // 把手:中间帧可拖,首尾不可拖
  sequenceTimelineHandles.innerHTML = sequenceFrames.map((_, i) => {
    const isEnd = i === 0 || i === sequenceFrames.length - 1;
    const pos = (sequencePositions[i] * 100).toFixed(2);
    return `<button type="button" class="sequence-handle${isEnd ? " is-fixed" : ""}" data-handle-idx="${i}" style="left:${pos}%" title="第 ${i + 1} 帧"></button>`;
  }).join("");
  // 标尺:每帧在 0/0.25/0.5/0.75/1 标刻度
  if (sequenceTimelineMarks) {
    sequenceTimelineMarks.innerHTML = `
      <span style="left:0">0s</span>
      <span style="left:25%">${(getTotalDurationMs() / 1000 * 0.25).toFixed(2)}s</span>
      <span style="left:50%">${(getTotalDurationMs() / 1000 * 0.5).toFixed(2)}s</span>
      <span style="left:75%">${(getTotalDurationMs() / 1000 * 0.75).toFixed(2)}s</span>
      <span style="left:100%">${(getTotalDurationMs() / 1000).toFixed(2)}s</span>
    `;
  }
  bindHandleDrag();
}

function bindHandleDrag() {
  if (!sequenceTimelineHandles || !sequenceTimelineEl) return;
  const handles = sequenceTimelineHandles.querySelectorAll(".sequence-handle:not(.is-fixed)");
  handles.forEach((h) => {
    h.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      stopSequenceTimer();
      h.setPointerCapture(e.pointerId);
      const idx = Number(h.dataset.handleIdx);
      h.classList.add("is-dragging");
      const trackRect = sequenceTimelineEl.getBoundingClientRect();
      const min = sequencePositions[idx - 1];
      const max = sequencePositions[idx + 1];
      const minPx = min * trackRect.width;
      const maxPx = max * trackRect.width;
      const move = (ev) => {
        const x = Math.min(maxPx, Math.max(minPx, ev.clientX - trackRect.left));
        const pos = x / trackRect.width;
        sequencePositions[idx] = pos;
        h.style.left = `${pos * 100}%`;
      };
      const up = (ev) => {
        h.releasePointerCapture(ev.pointerId);
        h.classList.remove("is-dragging");
        h.removeEventListener("pointermove", move);
        h.removeEventListener("pointerup", up);
        // 把 progress 吸附到当前帧位置(避免跳到奇怪位置)
        sequenceProgress = sequencePositions[idx];
        renderSequenceFrame();
      };
      h.addEventListener("pointermove", move);
      h.addEventListener("pointerup", up);
    });
  });
}

// 重置为等间距
function resetTimelineEqual() {
  if (sequenceFrames.length < 2) return;
  sequencePositions = sequenceFrames.map((_, i) => i / (sequenceFrames.length - 1));
  sequenceProgress = 0;
  renderTimelineHandles();
  renderSequenceFrame();
}

function initSequencePlayer(frames, hint) {
  sequenceFrames = Array.from(frames || []).filter(Boolean);
  if (!sequenceFrames.length) {
    clearSequencePlayer();
    return;
  }
  // 默认等间距
  sequencePositions = sequenceFrames.map((_, i) => i / Math.max(1, sequenceFrames.length - 1));
  sequenceProgress = 0;
  sequenceDir = 1;
  if (sequenceEl) sequenceEl.hidden = false;
  if (sequenceHintEl && hint) sequenceHintEl.textContent = hint;
  if (sequenceDurationValue) sequenceDurationValue.textContent = String(sequenceDurationInput?.value || 1);
  renderSequenceThumbs();
  renderTimelineHandles();
  renderSequenceFrame();
  if (!sequenceLoaded) {
    sequenceLoaded = true;
    playSequence();
  }
}

function stopSequenceTimer() {
  if (sequenceTimer) {
    clearInterval(sequenceTimer);
    sequenceTimer = null;
  }
  setSequencePlayIcon(false);
}

function playSequence() {
  stopSequenceTimer();
  if (sequenceFrames.length < 1) return;
  setSequencePlayIcon(true);
  const totalMs = getTotalDurationMs();
  let lastTick = performance.now();
  sequenceTimer = setInterval(() => {
    const now = performance.now();
    const dt = (now - lastTick) * sequenceDir;
    lastTick = now;
    sequenceProgress += dt / totalMs;
    // 边界处理:来回 / 循环 / 停
    if (sequencePingpongInput?.checked) {
      if (sequenceProgress > 1) { sequenceDir = -1; sequenceProgress = 1; lastTick = now; }
      else if (sequenceProgress < 0) { sequenceDir = 1; sequenceProgress = 0; lastTick = now; }
    } else if (sequenceProgress > 1) {
      if (sequenceLoopInput?.checked) { sequenceProgress = 0; lastTick = now; }
      else { sequenceProgress = 1; stopSequenceTimer(); }
    } else if (sequenceProgress < 0) {
      sequenceProgress = 0;
    }
    renderSequenceFrame();
  }, 33);
}

if (sequencePlayBtn) sequencePlayBtn.addEventListener("click", () => {
  if (!sequenceFrames.length) return;
  if (sequenceTimer) stopSequenceTimer();
  else playSequence();
});
if (sequenceFirstBtn) sequenceFirstBtn.addEventListener("click", () => {
  stopSequenceTimer(); sequenceProgress = 0; renderSequenceFrame();
});
if (sequencePrevBtn) sequencePrevBtn.addEventListener("click", () => {
  stopSequenceTimer();
  sequenceProgress = Math.max(0, sequencePositions[Math.max(0, progressToFrameIdx(sequenceProgress) - 1)] - 0.0001);
  // 跳到上一帧:找到当前位置左侧最近的 position
  const idx = progressToFrameIdx(sequenceProgress);
  sequenceProgress = idx > 0 ? sequencePositions[idx - 1] : 0;
  renderSequenceFrame();
});
if (sequenceNextBtn) sequenceNextBtn.addEventListener("click", () => {
  stopSequenceTimer();
  const idx = progressToFrameIdx(sequenceProgress);
  sequenceProgress = idx < sequenceFrames.length - 1 ? sequencePositions[idx + 1] : 1;
  renderSequenceFrame();
});
if (sequenceLastBtn) sequenceLastBtn.addEventListener("click", () => {
  stopSequenceTimer(); sequenceProgress = 1; renderSequenceFrame();
});
if (sequenceDurationInput) {
  sequenceDurationInput.addEventListener("input", () => {
    if (sequenceDurationValue) sequenceDurationValue.textContent = String(sequenceDurationInput.value);
    // 重新渲染标尺
    if (sequenceTimelineMarks) {
      const sec = Number(sequenceDurationInput.value) || 1;
      sequenceTimelineMarks.innerHTML = `
        <span style="left:0">0s</span>
        <span style="left:25%">${(sec * 0.25).toFixed(2)}s</span>
        <span style="left:50%">${(sec * 0.5).toFixed(2)}s</span>
        <span style="left:75%">${(sec * 0.75).toFixed(2)}s</span>
        <span style="left:100%">${sec.toFixed(2)}s</span>
      `;
    }
  });
}
if (sequenceResetBtn) {
  sequenceResetBtn.addEventListener("click", resetTimelineEqual);
}

/* ===== 路由:首页 / 工具页切换 ===== */

const VALID_TOOLS = ["character", "cutout", "motion", "frames", "uiBatch"];
const TOOL_LABELS = {
  character: "AI 生图",
  cutout: "图片抠图",
  motion: "动作视频",
  frames: "视频抽帧",
  uiBatch: "批量 UI 素材"
};

function parseRoute(pathname) {
  if (pathname === "/" || pathname === "") return { page: "home", tool: null };
  const match = pathname.match(/^\/tools\/([a-zA-Z]+)\/?$/);
  if (match && VALID_TOOLS.includes(match[1])) return { page: "tool", tool: match[1] };
  return { page: "home", tool: null };
}

function applyRoute(route) {
  document.body.dataset.page = route.page;
  const label = document.querySelector("#toolSwitcherLabel");
  if (label) label.textContent = route.page === "tool" ? TOOL_LABELS[route.tool] : "所有工具";
  document.querySelectorAll(".tool-switcher-item[data-tool]").forEach((item) => {
    const active = route.page === "tool" && item.dataset.tool === route.tool;
    item.classList.toggle("is-active", active);
  });
  if (route.page === "tool" && typeof switchToolMode === "function") {
    switchToolMode(route.tool);
  }
}

function navigate(to, { replace = false } = {}) {
  if (location.pathname === to) return;
  if (replace) history.replaceState({}, "", to);
  else history.pushState({}, "", to);
  applyRoute(parseRoute(to));
}

window.addEventListener("popstate", () => {
  applyRoute(parseRoute(location.pathname));
});

// 拦截所有工具下拉点击 + 工具卡片点击 → 走路由而不是直接刷新
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href^='/tools/'], a.tool-card[href='/']");
  if (!link) return;
  event.preventDefault();
  navigate(link.getAttribute("href"));
  // 路由跳转后关闭工具下拉
  const menu = document.querySelector("#toolSwitcherMenu");
  const button = document.querySelector("#toolSwitcherButton");
  if (menu && button) {
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }
});

// 工具页路由切换时,把 frame-module 从 main.canvas-panel 搬到 inspector-panel 顶部
// 这样在工具页单栏布局下也能看到分帧工作区 + 序列帧动画
(function moveFrameModule() {
  const frameModule = document.querySelector(".frame-module");
  const inspectorPanel = document.querySelector(".inspector-panel");
  if (!frameModule || !inspectorPanel) return;
  // 插入到 inspector-panel 顶部(在 currentResult 之前)
  const currentResult = inspectorPanel.querySelector("#currentResult");
  if (currentResult) {
    inspectorPanel.insertBefore(frameModule, currentResult);
  } else {
    inspectorPanel.insertBefore(frameModule, inspectorPanel.firstChild);
  }
})();

// 拦截浏览器侧边栏 radio 切换(避免与路由冲突):radio 切换时同步 URL
function bindRadioToRoute() {
  const radios = document.querySelectorAll('input[name="toolMode"]');
  radios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) {
        const tool = radio.value;
        const current = parseRoute(location.pathname);
        if (current.page === "tool" && current.tool !== tool) {
          navigate(`/tools/${tool}`);
        }
      }
    });
  });
}
bindRadioToRoute();

/* ===== topbar 工具下拉菜单 ===== */

(function initToolSwitcher() {
  const button = document.querySelector("#toolSwitcherButton");
  const menu = document.querySelector("#toolSwitcherMenu");
  if (!button || !menu) return;
  const close = () => {
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
  };
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hidden) open(); else close();
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== button) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) close();
  });
})();

// 初始路由应用
applyRoute(parseRoute(location.pathname));

// 关闭当前结果
document.querySelector("#currentResultClose")?.addEventListener("click", () => {
  const card = document.querySelector("#currentResult");
  if (card) card.hidden = true;
});

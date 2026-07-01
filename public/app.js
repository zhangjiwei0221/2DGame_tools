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
const videoRatio = document.querySelector("select[name=videoRatio]");
const characterImageModel = document.querySelector("select[name=characterImageModel]");
const customCharacterImageModelField = document.querySelector("#customCharacterImageModelField");
const customCharacterImageModel = document.querySelector("input[name=customCharacterImageModel]");
const videoModel = document.querySelector("select[name=videoModel]");
const videoDuration = document.querySelector("select[name=videoDuration]");
const videoResolution = document.querySelector("#videoResolution");
const costHint = document.querySelector("#costHint");
const costCard = document.querySelector("#costCard");
const costNote = document.querySelector("#costNote");
const customModelField = document.querySelector("#customModelField");
const customVideoModel = document.querySelector("input[name=customVideoModel]");
const motionRefLibrary = document.querySelector("#motionRefLibrary");
const motionRefGrid = document.querySelector("#motionRefGrid");
const motionRefModelHint = document.querySelector("#motionRefModelHint");
const motionPresetIdInput = document.querySelector("#motionPresetId");
const motionLightbox = document.querySelector("#motionLightbox");
const motionLightboxVideo = document.querySelector("#motionLightboxVideo");
const motionLightboxTitle = document.querySelector("#motionLightboxTitle");
const characterNameInput = document.querySelector("#characterNameInput");
const actionNameInput = document.querySelector("#actionNameInput");
const actionPrompt = document.querySelector("textarea[name=actionPrompt]");
const characterReferenceInput = document.querySelector("input[name=characterReference]");
const referenceFileInput = document.querySelector("#referenceFileInput");
const referenceSlots = document.querySelector("#referenceSlots");
const addReferenceButton = document.querySelector("#addReferenceButton");
const refCountLabel = document.querySelector("#refCount");
const loginOpenButton = document.querySelector("#loginOpenButton");
const accountMenu = document.querySelector("#accountMenu");
const accountName = document.querySelector("#accountName");
const creditBalance = document.querySelector("#creditBalance");
const logoutButton = document.querySelector("#logoutButton");
const authModal = document.querySelector("#authModal");
const authForm = document.querySelector("#authForm");
const authPhone = document.querySelector("#authPhone");
const authCode = document.querySelector("#authCode");
const sendCodeButton = document.querySelector("#sendCodeButton");
const authMessage = document.querySelector("#authMessage");

const REFERENCE_ROLES = [
  { id: "style", label: "风格" },
  { id: "character", label: "主体" },
  { id: "composition", label: "构图" },
  { id: "first_frame", label: "首帧" }
];
const MAX_REFERENCES = 4;
const referenceImages = []; // [{ file, role, dataUrl }]
const finalVideo = document.querySelector("#finalVideo");
const cutoutImages = document.querySelector("#cutoutImages");
const cutoutImageList = document.querySelector("#cutoutImageList");
const cutoutImageCount = document.querySelector("#cutoutImageCount");
const cutoutProgress = document.querySelector("#cutoutProgress");
const cutoutStepTitle = document.querySelector("#cutoutStepTitle");
const cutoutProgressText = document.querySelector("#cutoutProgressText");
const cutoutBarFill = document.querySelector("#cutoutBarFill");
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
const goMotionFromCharacterButton = document.querySelector("#goMotionFromCharacterButton");

let latestJob = null;
let manualCaptures = [];
let filmstripFrames = [];
let isDraggingTimeline = false;
let pendingSeek = null;
let currentVideo = null;
let backgroundModeTouched = false;
let recentResults = [];
let currentUser = null;
let currentCredits = 0;
let sendCodeTimer = null;
let lastCharacterImageUrl = ""; // 最近一次生图结果的图片 URL,供"用这张图生成动作视频"使用

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
  frames: "film"
};

const MODE_LABELS = {
  character: "生图",
  cutout: "抠图",
  motion: "视频",
  frames: "抽帧"
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

setAutoNames();
loadConfig();
loadMe();
loadRecentResults();
renderRecentGallery();
syncControls();
syncToolMode();
syncFramePanels();
renderManualCaptures();
updateStepButtons();
updateGoMotionButton();

// lucide 图标初始化(defer 加载,需在 DOMContentLoaded 后调用)
if (window.lucide && typeof window.lucide.createIcons === "function") {
  window.lucide.createIcons();
}

function openAuthModal(message = "") {
  if (!authModal) return;
  authModal.hidden = false;
  setAuthMessage(message, false);
  setTimeout(() => authPhone?.focus(), 0);
  if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
}

function closeAuthModal() {
  if (authModal) authModal.hidden = true;
}

function setAuthMessage(message, ok = false) {
  if (!authMessage) return;
  authMessage.textContent = message || "";
  authMessage.classList.toggle("is-ok", Boolean(ok));
}

function renderAccount() {
  if (currentUser) {
    if (loginOpenButton) loginOpenButton.hidden = true;
    if (accountMenu) accountMenu.hidden = false;
    if (accountName) accountName.textContent = currentUser.nickname || currentUser.phone || "已登录";
    if (creditBalance) creditBalance.textContent = String(currentCredits || 0);
  } else {
    if (loginOpenButton) loginOpenButton.hidden = false;
    if (accountMenu) accountMenu.hidden = true;
  }
  if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
}

async function loadMe() {
  try {
    const response = await fetch("/api/me");
    const data = await response.json();
    currentUser = data.user || null;
    currentCredits = Number(data.credits || 0);
  } catch {
    currentUser = null;
    currentCredits = 0;
  }
  renderAccount();
}

function requireLogin() {
  // 备案合规:个人学习网站屏蔽登录拦截
  // 工具全部可匿名使用
  return true;
}

async function sendLoginCode() {
  const phone = authPhone?.value?.trim() || "";
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    setAuthMessage("请输入有效的手机号。");
    return;
  }
  sendCodeButton.disabled = true;
  setAuthMessage("正在发送验证码...");
  try {
    const response = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "验证码发送失败");
    const devCode = data.devCode ? ` 内测验证码：${data.devCode}` : "";
    setAuthMessage(`验证码已发送。${devCode}`, true);
    let remain = 60;
    sendCodeButton.textContent = `${remain}s`;
    clearInterval(sendCodeTimer);
    sendCodeTimer = setInterval(() => {
      remain -= 1;
      if (remain <= 0) {
        clearInterval(sendCodeTimer);
        sendCodeButton.disabled = false;
        sendCodeButton.textContent = "获取验证码";
      } else {
        sendCodeButton.textContent = `${remain}s`;
      }
    }, 1000);
  } catch (error) {
    sendCodeButton.disabled = false;
    sendCodeButton.textContent = "获取验证码";
    setAuthMessage(error.message || String(error));
  }
}

async function submitLogin(event) {
  event.preventDefault();
  const phone = authPhone?.value?.trim() || "";
  const code = authCode?.value?.trim() || "";
  setAuthMessage("正在登录...");
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "登录失败");
    currentUser = data.user;
    currentCredits = Number(data.credits || 0);
    renderAccount();
    closeAuthModal();
    if (data.welcome?.granted) {
      setProgress(`已登录，获得 ${data.welcome.amount} 体验积分`, "Ready", 100);
    }
  } catch (error) {
    setAuthMessage(error.message || String(error));
  }
}

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {}
  currentUser = null;
  currentCredits = 0;
  renderAccount();
}

loginOpenButton?.addEventListener("click", () => openAuthModal());
sendCodeButton?.addEventListener("click", sendLoginCode);
authForm?.addEventListener("submit", submitLogin);
logoutButton?.addEventListener("click", logout);
authModal?.querySelectorAll("[data-auth-close]").forEach((el) => el.addEventListener("click", closeAuthModal));
motionLightbox?.querySelectorAll("[data-lightbox-close]").forEach((el) => el.addEventListener("click", closeMotionLightbox));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && authModal && !authModal.hidden) closeAuthModal();
  if (event.key === "Escape" && motionLightbox && !motionLightbox.hidden) closeMotionLightbox();
});

form.addEventListener("change", () => {
  syncControls();
  syncToolMode();
  syncFramePanels();
});
form.addEventListener("submit", generateAiVideo);
characterGenerateButton.addEventListener("click", generateCharacterImage);
cutoutButton.addEventListener("click", cutoutUploadedImages);
goMotionFromCharacterButton.addEventListener("click", goMotionWithCurrentImage);
document.querySelectorAll("[data-switch-mode]").forEach((button) => {
  button.addEventListener("click", () => switchToolMode(button.dataset.switchMode));
});
initReferenceUploader();
finalVideo.addEventListener("change", prepareExistingVideo);
qualityInput.addEventListener("input", () => {
  qualityValue.textContent = qualityInput.value;
});
videoModel.addEventListener("change", syncCustomModelField);
videoModel.addEventListener("change", syncCostControls);
videoModel.addEventListener("change", syncMotionRefAvailability);
customVideoModel.addEventListener("input", syncCostControls);
customVideoModel.addEventListener("input", syncMotionRefAvailability);
characterImageModel.addEventListener("change", syncCustomImageModelFields);
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

// 只收集"当前模式下可见"的表单字段,避免隐藏区域里的同名字段(如多个 negativePrompt)
// 一起被打包提交。隐藏区域已被标记 inert/hidden,据此跳过。
function isInInertSubtree(el) {
  let node = el;
  while (node && node !== form) {
    if (node.hidden || node.hasAttribute?.("inert")) return true;
    node = node.parentElement;
  }
  return false;
}

function buildScopedFormData() {
  const data = new FormData();
  const controls = form.querySelectorAll("input, select, textarea");
  for (const el of controls) {
    if (!el.name) continue;
    // 隐藏的 toolMode/characterName/actionName 等始终保留(它们是逻辑字段,不在可见区域)
    const isLogicHidden = el.type === "hidden" || el.name === "toolMode";
    if (!isLogicHidden && isInInertSubtree(el)) continue;
    if (el.type === "radio" || el.type === "checkbox") {
      if (!el.checked) continue;
      data.append(el.name, el.value);
    } else if (el.type === "file") {
      for (const file of el.files) data.append(el.name, file, file.name);
    } else {
      data.append(el.name, el.value);
    }
  }
  return data;
}

async function generateAiVideo(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  setAutoNames("ai");
  setBusy(true, true);
  resetResultOnly();
  setProgress("正在根据参考图和动作描述生成新视频", "0%", 0);

  const formData = buildScopedFormData();
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
  if (!requireLogin()) return;
  setAutoNames("character");
  setBusy(true);
  resetResultOnly();
  setProgress("正在生成图片", "0%", 0);

  const formData = buildScopedFormData();
  formData.delete("finalVideo");
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
    lastCharacterImageUrl = result.image || "";
    renderResult(result);
    setProgress("图片已生成", "100%", 100);
    updateGoMotionButton();
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

// "用这张图生成动作视频":只有在已有生成图片时才可用,并把该图作为首帧参考带入 motion 模式
function updateGoMotionButton() {
  if (!goMotionFromCharacterButton) return;
  const hasImage = Boolean(lastCharacterImageUrl);
  goMotionFromCharacterButton.disabled = !hasImage;
  goMotionFromCharacterButton.title = hasImage
    ? "把当前生成的图片作为首帧,切到动作视频"
    : "请先生成一张图片,才能用它生成动作视频";
}

async function goMotionWithCurrentImage() {
  if (!lastCharacterImageUrl) {
    showError("还没有可用的图片。请先在生图工具里生成一张,再用它生成动作视频。");
    return;
  }
  if (referenceImages.length >= MAX_REFERENCES) {
    showError(`参考图最多 ${MAX_REFERENCES} 张,请先在动作视频页移除一张再试。`);
    switchToolMode("motion");
    return;
  }
  try {
    // 把服务器上的生图结果拉成 dataURL,作为 first_frame 参考塞进参考图列表
    const response = await fetch(lastCharacterImageUrl);
    if (!response.ok) throw new Error("无法读取当前图片");
    const blob = await response.blob();
    const file = new File([blob], "from-character.png", { type: blob.type || "image/png" });
    const dataUrl = await readFileAsDataUrl(file);
    referenceImages.push({ file, role: "first_frame", dataUrl });
    renderReferenceSlots();
    updateRefCount();
    switchToolMode("motion");
    updateReferencePreview();
    setProgress("已把当前图片带入动作视频,作为首帧参考", "Ready", 100);
  } catch (error) {
    showError(error);
    switchToolMode("motion");
  }
}

async function prepareExistingVideo() {
  if (!requireLogin()) return;
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
  if (!requireLogin()) return;
  const files = cutoutImages?.files || [];
  if (!files.length) {
    showError("请先上传要抠图的图片。");
    return;
  }
  setAutoNames("cutout");
  setBusy(true, true);
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

async function exportAutoFrames() {
  if (!requireLogin()) return;
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
  // topbar-status 块已删除(2026-06-30 简化),DOM 不存在直接跳过
  const statusEl = document.querySelector("#configStatus");
  if (statusEl) {
    statusEl.textContent = config.mock ? "演示模式" : "已连接";
  }
  // dot 元素也跳过
  const dot = document.querySelector("#statusDot");
  if (!dot) return;
  if (config.mock) {
    dot.className = "status-dot warn";
    dot.title = "不会产生 API 费用";
  } else {
    dot.className = "status-dot ok";
    dot.title = "API 密钥已配置，本地运行中";
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
  if (input.actionPrompt && (input.characterReference || (Array.isArray(input.characterReferences) && input.characterReferences.length))) return "motion";
  if (input.workflowAction === "video" || input.workflowAction === "frames") return "frames";
  return "character";
}

function showCurrentResult({ type, src, alt, result }) {
  const card = document.querySelector("#currentResult");
  const body = document.querySelector("#currentResultBody");
  if (!card || !body) return;
  let html = "";
  if (type === "image" && src) {
    html = `<a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${escapeHtml(alt || "结果")}" /></a>`;
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
  if (result.batchResults) {
    renderBatchCutoutResult(result);
    showCurrentResult({ type: "batchCutout", result });
  }
  if (result.frames && result.frames.length) {
    // 抽帧/序列帧导出完成 → 加载到序列帧播放器
    initSequencePlayer(result.frames, "导出序列帧");
  }
  // 结果只留在 staging(临时),用户主动点"保存到本地"才复制进 exports(正式)
  const exportAbs = result.exportAbs || "";
  const exportRel = result.exportDir || "";
  const staging = result.staging || "";
  const charName = result.characterName || characterNameInput.value || "asset";
  const actName = result.actionName || actionNameInput.value || "";
  const pathDisplay = exportRel && !exportRel.startsWith("/staging/")
    ? exportRel
    : (exportRel ? exportRel.replace(/^\/staging\//, "staging/") : "");
  links.innerHTML = [
    result.download ? `<a href="${result.download}" download>下载图片</a>` : "",
    result.manifest ? `<a href="${result.manifest}" target="_blank">查看 manifest</a>` : "",
    result.preview ? `<a href="${result.preview}" target="_blank">打开预览图</a>` : "",
    staging && !exportAbs ? `<button type="button" class="link-button primary-action save-staging" data-staging="${escapeHtml(staging)}" data-char="${escapeHtml(charName)}" data-act="${escapeHtml(actName)}" title="复制到 exports 正式目录">💾 保存到本地</button>` : "",
    exportAbs ? `<button type="button" class="link-button open-folder" data-path="${escapeHtml(exportAbs)}" title="${escapeHtml(exportAbs)}">📁 在文件夹中显示</button>` : "",
    exportRel ? `<button type="button" class="link-button copy-path" data-path="${escapeHtml(exportRel)}" title="复制路径">📋 复制路径</button>` : "",
    result.videoInfo ? `<span>实际视频：${formatVideoInfo(result.videoInfo)}</span>` : "",
    staging && !exportAbs ? `<span class="export-hint">结果暂存中，点"保存到本地"才会写入 exports。</span>` : "",
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
      // 保存成功:把 exports 路径写回当前结果并重渲染,出现"在文件夹中显示"
      if (latestJob?.result) {
        latestJob.result.exportAbs = data.exportAbs || "";
        latestJob.result.exportDir = data.exportRel || data.exportDir || "";
        renderResult(latestJob.result);
      } else {
        btn.textContent = "已保存 ✓";
        btn.disabled = true;
      }
      setProgress("已保存到 exports", "100%", 100);
    } catch (err) {
      showError(err);
      btn.textContent = "💾 保存到本地";
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

// 统一设置区块的隐藏状态:hidden(布局) + inert(交互/Tab) + aria-hidden(读屏),三重保证
function setSectionHidden(element, isHidden) {
  if (!element) return;
  element.hidden = isHidden;
  if (isHidden) {
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("inert", "");
  } else {
    element.removeAttribute("aria-hidden");
    element.removeAttribute("inert");
  }
}

function syncToolMode() {
  const mode = new FormData(form).get("toolMode") || "character";
  const titles = {
    character: "生图结果",
    cutout: "抠图结果",
    motion: "动作视频结果",
    frames: "视频抽帧结果"
  };
  canvasTitle.textContent = titles[mode] || "当前资产";
  // 隐藏其它模式的区块:同时用 hidden + inert + aria-hidden,
  // 即使 CSS 没加载,inert 也能让无关控件退出 Tab 序和读屏树(防 #1 的"样式异常"场景)。
  document.querySelectorAll("[data-mode-only]").forEach((element) => {
    const modes = element.dataset.modeOnly.split(",").map((item) => item.trim());
    setSectionHidden(element, !modes.includes(mode));
  });
  document.querySelectorAll("[data-motion-only]").forEach((element) => {
    setSectionHidden(element, mode !== "motion");
  });
  setSectionHidden(characterGenerateButton, mode !== "character");
  if (!currentVideo && previewArea.classList.contains("empty")) {
    // 预览区在参数下方,空状态保持中性文案即可
    const hintEl = previewArea.querySelector(".empty-asset > p");
    const titleEl = previewArea.querySelector(".empty-asset > strong");
    if (hintEl) hintEl.textContent = "生成或处理完成后，结果会显示在这里。";
    if (titleEl) titleEl.textContent = "结果预览";
  }
  syncDefaultBackgroundModeForTool(mode);
}

function syncDefaultBackgroundModeForTool(mode) {
  if (!backgroundMode || backgroundModeTouched) return;
  backgroundMode.value = "u2netp";
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

  let level = "轻量档";
  let text = "适合反复试动作。";
  if (score >= 16) {
    level = "高级档";
    text = "建议只在动作已经确定后使用。";
  } else if (score >= 9) {
    level = "偏高清";
    text = "可以出正式版，但不适合大量试错。";
  } else if (score >= 5) {
    level = "标准档";
    text = "适合小批量测试。";
  }

  const fpsLabel = isMiniMaxVideoModel(model) ? "MiniMax 官方视频档" : "官方约 24fps";
  costHint.textContent = `${videoResolution.value} / ${duration} 秒 / ${fpsLabel}：${level}`;
  costCard.innerHTML = `<strong>当前规格档位：${level}</strong><p>${videoResolution.value}，${duration} 秒，${fpsLabel}。${text}</p>`;
  costNote.textContent = specialNote || (isMiniMaxVideoModel(model)
    ? "MiniMax 图生视频以参考图作为首帧，动作主要由提示词控制。"
    : videoResolution.value === "1080p"
    ? "1080p 像素量明显更高，建议先用 720p 确认动作和画面稳定性。"
    : "规格由模型、分辨率和秒数决定；帧率可能被模型忽略，不要把它当成可靠开关。");
}

function isMiniMaxVideoModel(model) {
  return String(model || "").startsWith("minimax-video:");
}

// ---- 动作参考库(预设视频)----
let motionPresets = [];
let selectedMotionPresetId = "";

async function initMotionPresets() {
  if (!motionRefGrid) return;
  try {
    const response = await fetch("/api/motion-presets");
    const data = await response.json();
    motionPresets = Array.isArray(data.presets) ? data.presets : [];
  } catch {
    motionPresets = [];
  }
  renderMotionPresets();
  syncMotionRefAvailability();
}

function renderMotionPresets() {
  if (!motionRefGrid) return;
  motionRefGrid.innerHTML = "";
  // "不使用参考"卡片
  motionRefGrid.appendChild(buildMotionRefNoneCard());
  motionPresets.forEach((preset) => motionRefGrid.appendChild(buildMotionRefCard(preset)));
  updateMotionRefSelection();
}

function buildMotionRefNoneCard() {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "motion-ref-card motion-ref-none";
  card.dataset.presetId = "";
  card.innerHTML = `<div class="motion-ref-none-inner"><i data-lucide="ban"></i><span>不使用参考</span><small>纯文字生成</small></div>`;
  card.addEventListener("click", () => selectMotionPreset(""));
  return card;
}

function buildMotionRefCard(preset) {
  const card = document.createElement("div");
  card.className = "motion-ref-card";
  card.dataset.presetId = preset.id;

  const thumb = document.createElement("button");
  thumb.type = "button";
  thumb.className = "motion-ref-thumb";
  thumb.setAttribute("aria-label", `播放 ${preset.name} 预览`);
  if (preset.posterUrl) {
    // 有封面图:直接用作背景,点击才加载 mp4
    thumb.style.backgroundImage = `url("${preset.posterUrl}")`;
    thumb.innerHTML = `<span class="motion-ref-play"><i data-lucide="play"></i></span>`;
  } else {
    // 无封面图:用 preload=metadata 的视频显示首帧当封面(#t=0.1 定位首帧),点击才播放
    const poster = document.createElement("video");
    poster.src = `${preset.videoUrl}#t=0.1`;
    poster.preload = "metadata";
    poster.muted = true;
    poster.playsInline = true;
    poster.className = "motion-ref-video";
    thumb.appendChild(poster);
    const overlay = document.createElement("span");
    overlay.className = "motion-ref-play";
    overlay.innerHTML = `<i data-lucide="play"></i>`;
    thumb.appendChild(overlay);
  }
  thumb.addEventListener("click", () => playMotionPreview(thumb, preset));

  const meta = document.createElement("div");
  meta.className = "motion-ref-meta";
  meta.innerHTML = `<div class="motion-ref-name">${preset.name}</div>` +
    `<div class="motion-ref-sub"><span class="motion-ref-tag">${preset.category || ""}</span>` +
    `<span class="motion-ref-dur">${preset.durationHint || ""}</span></div>`;

  const useButton = document.createElement("button");
  useButton.type = "button";
  useButton.className = "motion-ref-use ghost-button";
  useButton.textContent = "使用";
  useButton.addEventListener("click", () => selectMotionPreset(preset.id));

  card.append(thumb, meta, useButton);
  return card;
}

// 点击封面:弹出居中大悬浮框播放完整视频(看清角色全貌)
function playMotionPreview(thumb, preset) {
  if (!motionLightbox || !motionLightboxVideo) return;
  if (motionLightboxTitle) motionLightboxTitle.textContent = preset.name || "动作预览";
  motionLightboxVideo.src = preset.videoUrl;
  motionLightbox.hidden = false;
  document.body.classList.add("lightbox-open");
  motionLightboxVideo.currentTime = 0;
  motionLightboxVideo.play().catch(() => {});
}

function closeMotionLightbox() {
  if (!motionLightbox || motionLightbox.hidden) return;
  motionLightboxVideo?.pause();
  if (motionLightboxVideo) motionLightboxVideo.removeAttribute("src"), motionLightboxVideo.load();
  motionLightbox.hidden = true;
  document.body.classList.remove("lightbox-open");
}

function selectMotionPreset(id) {
  selectedMotionPresetId = id;
  if (motionPresetIdInput) motionPresetIdInput.value = id;
  updateMotionRefSelection();
}

function updateMotionRefSelection() {
  if (!motionRefGrid) return;
  motionRefGrid.querySelectorAll(".motion-ref-card").forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.presetId === selectedMotionPresetId);
  });
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

// 仅 Seedance 支持参考视频;选 MiniMax 时禁用参考库并清空选择
function syncMotionRefAvailability() {
  if (!motionRefLibrary) return;
  const model = videoModel.value === "custom" ? customVideoModel.value.trim() : videoModel.value;
  const unsupported = isMiniMaxVideoModel(model);
  motionRefLibrary.classList.toggle("is-disabled", unsupported);
  if (motionRefModelHint) motionRefModelHint.hidden = !unsupported;
  if (motionRefGrid) motionRefGrid.toggleAttribute("inert", unsupported);
  if (unsupported && selectedMotionPresetId) selectMotionPreset("");
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
  formData.delete("customCharacterImageModel");
  if (!select?.value) return;
  if (select.value === "custom") {
    const model = customCharacterImageModel?.value?.trim();
    if (!model) throw new Error("请填写已开通的自定义图片模型 ID。");
    formData.set("imageModel", model);
  } else {
    formData.set("imageModel", select.value);
  }
}

function syncFramePanels() {
  const workflow = new FormData(form).get("frameWorkflow") || "manual";
  // 「按总数/按帧率」及其参数只属于自动抽帧,手动选帧时隐藏,避免混淆。
  // 与是否已上传视频无关,放在最前面统一处理。
  document.querySelectorAll("[data-workflow-only]").forEach((element) => {
    setSectionHidden(element, element.dataset.workflowOnly !== workflow);
  });
  if (!currentVideo) {
    manualPanel.hidden = true;
    autoPanel.hidden = true;
    videoEmptyState.hidden = false;
    // 没有视频时,序列帧播放器也应保持隐藏(只有截帧/导出后才出现)。
    // 直接查 DOM 避免引用尚未初始化的 sequenceEl(模块顶层 const 存在 TDZ)。
    const seqEl = document.querySelector("#sequencePlayer");
    if (seqEl && !seqEl.querySelector("#sequenceFrame")?.src) seqEl.hidden = true;
    return;
  }
  videoEmptyState.hidden = true;
  manualPanel.hidden = workflow !== "manual";
  autoPanel.hidden = workflow !== "auto";
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
  if (!requireLogin()) return;
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

function setBusy(isBusy, cancellable = false) {
  aiGenerateButton.disabled = isBusy;
  characterGenerateButton.disabled = isBusy;
  cutoutButton.disabled = isBusy;
  autoExportButton.disabled = isBusy || !currentVideo;
  manualExportButton.disabled = isBusy || !currentVideo;
  if (cancelTaskButton) {
    // 只有异步轮询任务(视频/抠图)才真正可取消;同步接口(生图/抽帧)不显示取消按钮
    const showCancel = isBusy && cancellable;
    cancelTaskButton.hidden = !showCancel;
    cancelTaskButton.disabled = !showCancel;
    cancelTaskButton.title = "停止当前任务";
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

const VALID_TOOLS = ["character", "cutout", "motion", "frames"];
const TOOL_LABELS = {
  character: "AI 生图",
  cutout: "图片抠图",
  motion: "动作视频",
  frames: "视频抽帧"
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

// 工具页两栏工作台:左栏 = inspector-panel(参数,可滚动),
// 右栏 = canvas-panel(预览 + 分帧 + 历史,sticky 跟随)。
// #currentResult 原生在参数栏里,属于"输出",搬到右栏 canvas-panel 顶部。
(function buildToolWorkbench() {
  const canvasPanel = document.querySelector(".canvas-panel");
  const currentResult = document.querySelector("#currentResult");
  if (canvasPanel && currentResult && currentResult.parentElement !== canvasPanel) {
    canvasPanel.insertBefore(currentResult, canvasPanel.firstChild);
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

// 加载动作参考库
initMotionPresets();

// 关闭当前结果
document.querySelector("#currentResultClose")?.addEventListener("click", () => {
  const card = document.querySelector("#currentResult");
  if (card) card.hidden = true;
});

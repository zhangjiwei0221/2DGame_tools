import argparse
import json
import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


class ColorBackgroundRemover:
    def remove(self, image):
        return remove_color_background(image)


class UiSafeBackgroundRemover:
    def remove(self, image):
        return remove_outer_background(image)


class NoBackgroundRemover:
    def remove(self, image):
        return image.convert("RGBA")


class U2NetPBackgroundRemover:
    """轻量抠图模型(rembg + u2netp/u2net)。

    - 权重大小 4.7 MB(u2netp)/176 MB(u2net),Apache 2.0 可商用
    - CPU 推理 1-3 秒/张
    - 内存峰值 ~750 MB(u2netp)/~1.2 GB(u2net)
    - 适合 2 GB 内存服务器(u2netp)
    - 对游戏素材(角色立绘、道具、图标)精度足够
    """

    # rembg 支持的模型名(不是 HuggingFace 模型名)
    REMBG_MODELS = {
        "u2netp": "u2netp",
        "u2net": "u2net",
        "isnet-general-use": "isnet-general-use",
        "isnet-anime": "isnet-anime",
    }

    def __init__(self, model_name="u2netp", device="cpu"):
        try:
            from rembg import new_session  # noqa: F401
        except ImportError as exc:
            raise RuntimeError(
                "U2Net-p needs the `rembg` package. "
                "Install with: pip install rembg[cpu]"
            ) from exc

        # model_name 可能是 HuggingFace 名(BIREFNET_MODEL 注入),过滤到 rembg 支持的几个
        env_model = os.environ.get("U2NETP_MODEL", "u2netp")
        chosen = env_model if env_model in self.REMBG_MODELS else "u2netp"
        if model_name in self.REMBG_MODELS:
            chosen = model_name
        self.model_name = chosen
        self._session = None

    def _ensure_session(self):
        if self._session is None:
            from rembg import new_session
            self._session = new_session(self.model_name)
        return self._session

    def remove(self, image):
        import io
        from rembg import remove
        from PIL import Image

        session = self._ensure_session()
        buf = io.BytesIO()
        image = image.convert("RGBA")
        image.save(buf, format="PNG")
        out_bytes = remove(buf.getvalue(), session=session)
        return Image.open(io.BytesIO(out_bytes)).convert("RGBA")


class BiRefNetBackgroundRemover:
    def __init__(self, model_name, device):
        try:
            import torch
            from torchvision import transforms
            from transformers import AutoModelForImageSegmentation
        except ImportError as exc:
            raise RuntimeError(
                "BiRefNet needs torch, torchvision, and transformers. "
                "Install them first, then retry BiRefNet matting."
            ) from exc

        self.torch = torch
        self.transforms = transforms
        self.device = self.resolve_device(device)
        self.use_half = self.device == "cuda"
        if hasattr(torch, "set_float32_matmul_precision"):
            torch.set_float32_matmul_precision("high")

        self.model = AutoModelForImageSegmentation.from_pretrained(
            model_name,
            trust_remote_code=True,
        )
        self.model.to(self.device)
        if self.use_half:
            self.model.half()
        self.model.eval()
        self.transform = transforms.Compose([
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])

    def resolve_device(self, device):
        if device and device != "auto":
            return device
        return "cuda" if self.torch.cuda.is_available() else "cpu"

    def remove(self, image):
        source = image.convert("RGB")
        tensor = self.transform(source).unsqueeze(0).to(self.device)
        if self.use_half:
            tensor = tensor.half()

        with self.torch.no_grad():
            output = self.model(tensor)

        mask = self.extract_mask(output)
        mask_image = self.transforms.ToPILImage()(mask).resize(source.size, Image.Resampling.BILINEAR)
        rgba = image.convert("RGBA")
        existing_alpha = np.array(rgba.getchannel("A"), dtype=np.uint16)
        predicted_alpha = np.array(mask_image, dtype=np.uint16)
        alpha = np.minimum(existing_alpha, predicted_alpha).astype(np.uint8)
        rgba.putalpha(Image.fromarray(alpha, "L"))
        return rgba

    def extract_mask(self, output):
        if isinstance(output, dict):
            output = output.get("logits") or output.get("out") or next(iter(output.values()))
        if isinstance(output, (list, tuple)):
            output = output[-1]
        mask = output.sigmoid().detach().cpu()[0].squeeze()
        return mask


class AutoBackgroundRemover:
    def __init__(self, model_name, device):
        self.model_name = model_name
        self.device = device
        # 默认走 U2Net-p(轻量、可商用、2G 服务器能跑)
        # BiRefNet 是"高级"模式,只在用户显式选 birefnet 时才用
        self._u2netp = None
        self._birefnet = None
        self.last_mode = None

    def remove(self, image):
        ui_result = remove_outer_background(image)
        if is_cutout_usable(ui_result):
            self.last_mode = "ui"
            return ui_result

        # fallback 链路: U2Net-p -> UI
        try:
            if self._u2netp is None:
                self._u2netp = U2NetPBackgroundRemover("u2netp", self.device)
            result = self._u2netp.remove(image)
            self.last_mode = "u2netp"
            return result
        except Exception:
            self.last_mode = "ui"
            return ui_result

    def with_birefnet(self):
        """显式走 BiRefNet 路径(高级模式,服务器需 6G+ 内存)。"""
        if self._birefnet is None:
            self._birefnet = BiRefNetBackgroundRemover(self.model_name, self.device)
        return self._birefnet


def remove_color_background(image):
    rgba = image.convert("RGBA")
    data = np.array(rgba)
    near_green, near_white = background_color_candidates(data)
    data[:, :, 3] = np.where(near_green | near_white, 0, data[:, :, 3])
    return Image.fromarray(data, "RGBA")


def remove_outer_background(image):
    rgba = image.convert("RGBA")
    data = np.array(rgba)
    candidate = border_background_candidates(data).astype(np.uint8)
    if candidate.max() == 0:
        return rgba

    _, labels = cv2.connectedComponents(candidate, connectivity=8)
    border_labels = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
    border_labels.discard(0)
    if not border_labels:
        return rgba

    outer_background = np.isin(labels, list(border_labels))
    data[:, :, 3] = np.where(outer_background, 0, data[:, :, 3])
    data[:, :, 3] = remove_tiny_alpha_islands(data[:, :, 3])
    return Image.fromarray(data, "RGBA")


def border_background_candidates(data):
    near_green, near_white = background_color_candidates(data)
    border = np.zeros(near_white.shape, dtype=bool)
    border[0, :] = True
    border[-1, :] = True
    border[:, 0] = True
    border[:, -1] = True
    white_score = near_white[border].mean()
    green_score = near_green[border].mean()

    if green_score > 0.25 and green_score > white_score * 2:
        return near_green
    if white_score > 0.10:
        return near_white

    rgb = data[:, :, :3].astype(np.int16)
    border_rgb = rgb[border]
    target = np.median(border_rgb, axis=0)
    distance = np.linalg.norm(rgb - target, axis=2)
    return distance < 35


def remove_tiny_alpha_islands(alpha):
    foreground = (alpha > 0).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(foreground, connectivity=8)
    if count <= 2:
        return alpha
    areas = stats[:, cv2.CC_STAT_AREA]
    largest = int(max(areas[1:]))
    min_area = max(64, int(largest * 0.002))
    keep_labels = [index for index in range(1, count) if areas[index] >= min_area]
    return np.where(np.isin(labels, keep_labels), alpha, 0).astype(np.uint8)


def is_cutout_usable(image):
    alpha = np.array(image.convert("RGBA").getchannel("A"))
    h, w = alpha.shape
    foreground = alpha > 8
    foreground_ratio = foreground.mean()
    if foreground_ratio < 0.01 or foreground_ratio > 0.92:
        return False

    border = np.zeros(alpha.shape, dtype=bool)
    border[0, :] = True
    border[-1, :] = True
    border[:, 0] = True
    border[:, -1] = True
    if foreground[border].mean() > 0.02:
        return False

    transparent = (alpha < 8).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(transparent, connectivity=8)
    if count <= 2:
        return True
    border_labels = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
    internal_holes = 0
    for index in range(1, count):
        if index not in border_labels:
            internal_holes += stats[index, cv2.CC_STAT_AREA]
    return internal_holes / float(w * h) < 0.01


def background_color_candidates(data):
    rgb_uint8 = data[:, :, :3].astype(np.uint8)
    rgb = rgb_uint8.astype(np.int16)
    hsv = cv2.cvtColor(rgb_uint8, cv2.COLOR_RGB2HSV)
    hue = hsv[:, :, 0]
    saturation = hsv[:, :, 1]
    value = hsv[:, :, 2]
    green_hsv = (hue >= 35) & (hue <= 95) & (saturation >= 45) & (value >= 45)
    green_dominant = (rgb[:, :, 1] > rgb[:, :, 0] + 20) & (rgb[:, :, 1] > rgb[:, :, 2] + 20)
    white_distance = np.linalg.norm(rgb - np.array([255, 255, 255]), axis=2)
    near_green = green_hsv & green_dominant
    near_white = white_distance < 35
    return near_green, near_white


def make_background_remover(mode, model_name, device):
    if mode == "none":
        return NoBackgroundRemover()
    if mode == "auto":
        # 默认 auto 走 U2Net-p 兜底(U2Net-p 失败才用 UI)
        return AutoBackgroundRemover(model_name, device)
    if mode == "ui":
        return UiSafeBackgroundRemover()
    if mode == "u2netp":
        # 显式选 u2netp 模式(轻量,2G 服务器可用)
        return U2NetPBackgroundRemover(model_name or "u2netp", device)
    if mode == "u2net":
        # 标准 U2Net(精度略好,内存 1-1.5G)
        return U2NetPBackgroundRemover("u2net", device)
    if mode == "birefnet":
        return BiRefNetBackgroundRemover(model_name, device)
    return ColorBackgroundRemover()


def normalize_frame(image, frame_size, background_remover=None):
    background_remover = background_remover or ColorBackgroundRemover()
    image = background_remover.remove(image)
    bbox = image.getbbox()
    canvas = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    if not bbox:
        return canvas

    cropped = image.crop(bbox)
    max_w = int(frame_size * 0.78)
    max_h = int(frame_size * 0.88)
    scale = min(max_w / cropped.width, max_h / cropped.height, 1.0)
    new_size = (max(1, int(cropped.width * scale)), max(1, int(cropped.height * scale)))
    cropped = cropped.resize(new_size, Image.Resampling.LANCZOS)
    x = (frame_size - cropped.width) // 2
    y = frame_size - cropped.height - int(frame_size * 0.06)
    canvas.alpha_composite(cropped, (x, y))
    return canvas


def resolve_range(capture, start_sec, end_sec):
    fps = capture.get(cv2.CAP_PROP_FPS) or 24
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total / fps if fps > 0 else 0
    start = max(0.0, float(start_sec or 0))
    end = float(end_sec) if end_sec is not None else duration
    end = min(max(end, start), duration)
    start_index = int(round(start * fps))
    end_index = int(round(end * fps))
    return fps, total, max(0, start_index), min(max(total - 1, 0), max(start_index, end_index - 1))


def choose_indexes(start_index, end_index, mode, count, fps, sample_fps):
    if end_index < start_index:
        return [start_index]
    if mode == "fps":
        step = max(1, int(round(fps / max(sample_fps, 0.1))))
        return list(range(start_index, end_index + 1, step))
    return np.linspace(start_index, end_index, count).round().astype(int).tolist()


def extract_frames(video_path, mode, count, sample_fps, start_sec, end_sec):
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps, total, start_index, end_index = resolve_range(capture, start_sec, end_sec)
    if total <= 0:
        raise RuntimeError("Video has no readable frames")

    indexes = choose_indexes(start_index, end_index, mode, count, fps, sample_fps)
    frames = []
    used_indexes = []
    for index in indexes:
        capture.set(cv2.CAP_PROP_POS_FRAMES, int(index))
        ok, frame = capture.read()
        if not ok:
            continue
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frames.append(Image.fromarray(rgb))
        used_indexes.append(int(index))
    capture.release()

    if not frames:
        raise RuntimeError("No frames could be extracted")
    if mode == "count":
        while len(frames) < count:
            frames.append(frames[-1].copy())
            used_indexes.append(used_indexes[-1])
        frames = frames[:count]
        used_indexes = used_indexes[:count]
    return frames, used_indexes, fps, total


def save_frame(frame, out_path, output_format, jpg_quality):
    if output_format == "jpg":
        background = Image.new("RGB", frame.size, (255, 255, 255))
        background.paste(frame, mask=frame.getchannel("A"))
        background.save(out_path, quality=jpg_quality, optimize=True)
    else:
        frame.save(out_path)


def make_preview(frames, out_path):
    columns = min(6, len(frames))
    rows = int(np.ceil(len(frames) / columns))
    w, h = frames[0].size
    sheet = Image.new("RGBA", (columns * w, rows * h), (24, 28, 36, 255))
    for i, frame in enumerate(frames):
        sheet.alpha_composite(frame, ((i % columns) * w, (i // columns) * h))
    sheet.save(out_path)


def parse_optional_float(value):
    if value in (None, ""):
        return None
    return float(value)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--character", required=True)
    parser.add_argument("--action", required=True)
    parser.add_argument("--frames", type=int, default=12)
    parser.add_argument("--mode", choices=["count", "fps"], default="count")
    parser.add_argument("--sample-fps", type=float, default=1.0)
    parser.add_argument("--start-sec", type=parse_optional_float)
    parser.add_argument("--end-sec", type=parse_optional_float)
    parser.add_argument("--output-format", choices=["png", "jpg"], default="png")
    parser.add_argument("--jpg-quality", type=int, default=90)
    parser.add_argument("--frame-size", type=int, default=256)
    parser.add_argument("--background-mode", choices=["auto", "ui", "color", "birefnet", "u2netp", "u2net", "none"], default="birefnet")
    parser.add_argument("--birefnet-model", default=os.environ.get("BIREFNET_MODEL", "ZhengPeng7/BiRefNet"))
    parser.add_argument("--birefnet-device", default=os.environ.get("BIREFNET_DEVICE", "auto"))
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    raw_frames, indexes, source_fps, source_total = extract_frames(
        Path(args.input),
        args.mode,
        args.frames,
        args.sample_fps,
        args.start_sec,
        args.end_sec,
    )
    background_remover = make_background_remover(args.background_mode, args.birefnet_model, args.birefnet_device)
    frames = [normalize_frame(frame, args.frame_size, background_remover) for frame in raw_frames]

    ext = "jpg" if args.output_format == "jpg" else "png"
    names = []
    for index, frame in enumerate(frames, start=1):
        name = f"frame_{index:03d}.{ext}"
        save_frame(frame, out_dir / name, args.output_format, args.jpg_quality)
        names.append(name)

    make_preview(frames, out_dir / "preview.png")
    manifest = {
        "character": args.character,
        "action": args.action,
        "frame_count": len(names),
        "frame_size": args.frame_size,
        "output_format": args.output_format,
        "background_mode": args.background_mode,
        "birefnet_model": args.birefnet_model if args.background_mode == "birefnet" else None,
        "extract_mode": args.mode,
        "sample_fps": args.sample_fps,
        "start_sec": args.start_sec,
        "end_sec": args.end_sec,
        "source_fps": source_fps,
        "source_total_frames": source_total,
        "source_frame_indexes": indexes,
        "frames": names,
        "preview": "preview.png",
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=True, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

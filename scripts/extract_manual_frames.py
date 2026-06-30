import argparse
import json
from pathlib import Path

import cv2
from PIL import Image

from process_video import make_background_remover, make_preview, normalize_frame, save_frame


def capture_at(video_path, second):
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")
    fps = capture.get(cv2.CAP_PROP_FPS) or 24
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    index = max(0, min(total - 1, int(round(second * fps))))
    capture.set(cv2.CAP_PROP_POS_FRAMES, index)
    ok, frame = capture.read()
    capture.release()
    if not ok:
        raise RuntimeError(f"Cannot capture frame at {second}s")
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    return Image.fromarray(rgb), index, fps, total


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--character", required=True)
    parser.add_argument("--action", required=True)
    parser.add_argument("--times", required=True)
    parser.add_argument("--output-format", choices=["png", "jpg"], default="png")
    parser.add_argument("--jpg-quality", type=int, default=90)
    parser.add_argument("--frame-size", type=int, default=256)
    parser.add_argument("--background-mode", choices=["auto", "ui", "color", "birefnet", "u2netp", "u2net", "none"], default="u2netp")
    parser.add_argument("--birefnet-model", default="ZhengPeng7/BiRefNet")
    parser.add_argument("--birefnet-device", default="auto")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    times = [float(item) for item in args.times.split(",") if item.strip()]
    if not times:
        raise RuntimeError("No manual frame times supplied")

    ext = "jpg" if args.output_format == "jpg" else "png"
    frames = []
    names = []
    indexes = []
    source_fps = 0
    source_total = 0
    background_remover = make_background_remover(args.background_mode, args.birefnet_model, args.birefnet_device)
    for number, second in enumerate(times, start=1):
        raw, index, source_fps, source_total = capture_at(Path(args.input), second)
        frame = normalize_frame(raw, args.frame_size, background_remover)
        name = f"frame_{number:03d}.{ext}"
        save_frame(frame, out_dir / name, args.output_format, args.jpg_quality)
        frames.append(frame)
        names.append(name)
        indexes.append(index)

    make_preview(frames, out_dir / "preview.png")
    manifest = {
        "character": args.character,
        "action": args.action,
        "frame_count": len(names),
        "frame_size": args.frame_size,
        "output_format": args.output_format,
        "background_mode": args.background_mode,
        "birefnet_model": args.birefnet_model if args.background_mode == "birefnet" else None,
        "extract_mode": "manual",
        "manual_times": times,
        "source_fps": source_fps,
        "source_total_frames": source_total,
        "source_frame_indexes": indexes,
        "frames": names,
        "preview": "preview.png",
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=True, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

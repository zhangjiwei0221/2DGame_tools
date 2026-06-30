import argparse
import json
import os
from pathlib import Path

from PIL import Image

from process_video import make_background_remover, save_frame


def progress(percent, message):
    print(f"PROGRESS {percent} {message}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--asset", required=True)
    parser.add_argument("--output-format", choices=["png", "jpg"], default="png")
    parser.add_argument("--jpg-quality", type=int, default=90)
    parser.add_argument("--background-mode", choices=["auto", "ui", "color", "birefnet", "u2netp", "u2net", "none"], default="auto")
    parser.add_argument("--birefnet-model", default=os.environ.get("BIREFNET_MODEL", "ZhengPeng7/BiRefNet"))
    parser.add_argument("--birefnet-device", default=os.environ.get("BIREFNET_DEVICE", "auto"))
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    progress(18, "正在读取图片")
    source = Image.open(args.input).convert("RGBA")
    if args.background_mode in ("birefnet", "u2netp", "u2net"):
        import threading, time as _time
        _stop_heartbeat = threading.Event()
        model_label = {"birefnet": "BiRefNet", "u2netp": "U2Net-p", "u2net": "U2Net"}[args.background_mode]
        def _heartbeat():
            start = _time.time()
            while not _stop_heartbeat.is_set():
                progress(28, f"正在加载 {model_label} 模型…({int(_time.time() - start)}s)")
                _stop_heartbeat.wait(2)
        threading.Thread(target=_heartbeat, daemon=True).start()
        remover = make_background_remover(args.background_mode, args.birefnet_model, args.birefnet_device)
        _stop_heartbeat.set()
    else:
        progress(38, "正在准备抠图处理器")
        remover = make_background_remover(args.background_mode, args.birefnet_model, args.birefnet_device)
    progress(58, "正在分割主体并生成透明通道")
    result = remover.remove(source)

    ext = "jpg" if args.output_format == "jpg" else "png"
    output_name = f"{args.asset}_cutout.{ext}"
    output_path = out_dir / output_name
    progress(82, "正在保存抠图结果")
    save_frame(result, output_path, args.output_format, args.jpg_quality)

    manifest = {
        "asset": args.asset,
        "source_size": list(source.size),
        "output_size": list(result.size),
        "output_format": args.output_format,
        "background_mode": args.background_mode,
        "birefnet_model": args.birefnet_model if args.background_mode == "birefnet" else None,
        "image": output_name,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=True, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

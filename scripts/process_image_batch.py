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
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--output-format", choices=["png", "jpg"], default="png")
    parser.add_argument("--jpg-quality", type=int, default=90)
    parser.add_argument("--background-mode", choices=["auto", "ui", "color", "birefnet", "none"], default="auto")
    parser.add_argument("--birefnet-model", default=os.environ.get("BIREFNET_MODEL", "ZhengPeng7/BiRefNet"))
    parser.add_argument("--birefnet-device", default=os.environ.get("BIREFNET_DEVICE", "auto"))
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = Path(args.manifest)
    batch = json.loads(manifest_path.read_text(encoding="utf-8"))
    items = batch.get("items", [])

    if args.background_mode == "birefnet":
        import threading, time as _time
        _stop_heartbeat = threading.Event()

        def _heartbeat():
            start = _time.time()
            while not _stop_heartbeat.is_set():
                progress(8, f"正在加载 BiRefNet 模型…({int(_time.time() - start)}s)")
                _stop_heartbeat.wait(2)

        threading.Thread(target=_heartbeat, daemon=True).start()
        remover = make_background_remover(args.background_mode, args.birefnet_model, args.birefnet_device)
        _stop_heartbeat.set()
    else:
        progress(8, "正在准备批量抠图处理器")
        remover = make_background_remover(args.background_mode, args.birefnet_model, args.birefnet_device)

    results = []
    total = max(len(items), 1)
    for index, item in enumerate(items, start=1):
        progress(10 + int((index - 1) / total * 80), f"正在抠图 {index}/{len(items)}: {item.get('assetName', 'asset')}")
        source_path = Path(item["source"])
        image = Image.open(source_path).convert("RGBA")
        result = remover.remove(image)

        output_name = item["output"]
        output_path = out_dir / output_name
        save_frame(result, output_path, args.output_format, args.jpg_quality)
        results.append({
            **item,
            "output": output_name,
            "source_size": list(image.size),
            "output_size": list(result.size),
        })

    progress(94, "正在保存批量抠图记录")
    batch["items"] = results
    batch["output_format"] = args.output_format
    batch["background_mode"] = args.background_mode
    batch["birefnet_model"] = args.birefnet_model if args.background_mode == "birefnet" else None
    manifest_path.write_text(json.dumps(batch, ensure_ascii=True, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

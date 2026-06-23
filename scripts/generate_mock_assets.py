import argparse
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


def draw_character(size=512, offset_x=0, lift=0):
    image = Image.new("RGBA", (size, size), (0, 255, 0, 255))
    draw = ImageDraw.Draw(image)
    cx = size // 2 + offset_x
    ground = int(size * 0.82) - lift
    head_r = int(size * 0.075)
    body_w = int(size * 0.14)
    body_h = int(size * 0.25)
    palette = {
        "skin": (255, 214, 174, 255),
        "hair": (48, 35, 32, 255),
        "coat": (44, 116, 209, 255),
        "boot": (37, 40, 48, 255),
        "accent": (255, 198, 58, 255),
    }

    draw.ellipse((cx - head_r, ground - body_h - head_r * 3, cx + head_r, ground - body_h - head_r), fill=palette["skin"])
    draw.pieslice((cx - head_r - 3, ground - body_h - head_r * 3 - 8, cx + head_r + 3, ground - body_h - head_r + 2), 180, 360, fill=palette["hair"])
    draw.rounded_rectangle((cx - body_w, ground - body_h, cx + body_w, ground - 24), radius=18, fill=palette["coat"])
    draw.rectangle((cx - body_w, ground - body_h + 22, cx + body_w, ground - body_h + 34), fill=palette["accent"])
    draw.line((cx - body_w, ground - body_h + 34, cx - body_w - 44, ground - 94), fill=palette["skin"], width=16)
    draw.line((cx + body_w, ground - body_h + 34, cx + body_w + 50, ground - 88), fill=palette["skin"], width=16)
    leg_phase = offset_x / 22 if offset_x else 0
    left_step = int(math.sin(leg_phase) * 34)
    right_step = -left_step
    draw.line((cx - 26, ground - 30, cx - 42 + left_step, ground + 36), fill=palette["boot"], width=18)
    draw.line((cx + 26, ground - 30, cx + 42 + right_step, ground + 36), fill=palette["boot"], width=18)
    draw.ellipse((cx + 20, ground - body_h - head_r * 2 - 4, cx + 29, ground - body_h - head_r * 2 + 5), fill=(20, 24, 32, 255))
    return image


def make_character(out, name):
    image = draw_character()
    image.save(out)


def make_video(out, character, frames):
    size = 512
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(out), fourcc, 12, (size, size))
    for index in range(frames):
        phase = index / max(frames - 1, 1)
        offset = int(math.sin(phase * math.tau * 2) * 18)
        lift = int(abs(math.sin(phase * math.tau * 2)) * 14)
        frame = draw_character(size=size, offset_x=offset, lift=lift).convert("RGB")
        writer.write(cv2.cvtColor(np.array(frame), cv2.COLOR_RGB2BGR))
    writer.release()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=["character", "video"])
    parser.add_argument("--out", required=True)
    parser.add_argument("--name", default="hero")
    parser.add_argument("--character")
    parser.add_argument("--frames", type=int, default=48)
    args = parser.parse_args()

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    if args.kind == "character":
        make_character(args.out, args.name)
    else:
        make_video(args.out, args.character, args.frames)


if __name__ == "__main__":
    main()

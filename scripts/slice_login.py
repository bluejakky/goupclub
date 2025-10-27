#!/usr/bin/env python3
import os
import sys
import json
from typing import List, Tuple

import numpy as np
from PIL import Image, ImageDraw


def ensure_dir(path: str):
    if not os.path.exists(path):
        os.makedirs(path, exist_ok=True)


def _to_gray(img: np.ndarray) -> np.ndarray:
    if img.ndim == 3:
        r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]
        gray = (0.299 * r + 0.587 * g + 0.114 * b)
    else:
        gray = img.astype(np.float32)
    return gray.astype(np.float32)


def _convolve2d(image: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    kh, kw = kernel.shape
    pad_h, pad_w = kh // 2, kw // 2
    padded = np.pad(image, ((pad_h, pad_h), (pad_w, pad_w)), mode='edge')
    out = np.zeros_like(image, dtype=np.float32)
    for y in range(out.shape[0]):
        for x in range(out.shape[1]):
            region = padded[y:y+kh, x:x+kw]
            out[y, x] = float((region * kernel).sum())
    return out


def _edges_binary(gray: np.ndarray) -> np.ndarray:
    kx = np.array([[1, 0, -1], [2, 0, -2], [1, 0, -1]], dtype=np.float32)
    ky = np.array([[1, 2, 1], [0, 0, 0], [-1, -2, -1]], dtype=np.float32)
    gx = _convolve2d(gray, kx)
    gy = _convolve2d(gray, ky)
    mag = np.hypot(gx, gy)
    # threshold using percentile to adapt image contrast
    t = np.percentile(mag, 85)
    bin_edge = (mag >= t).astype(np.uint8)
    return bin_edge


def _dilate(binary: np.ndarray, iterations: int = 1) -> np.ndarray:
    kernel = np.ones((3, 3), dtype=np.uint8)
    out = binary.copy()
    for _ in range(iterations):
        # convolution to count neighbors
        kh, kw = kernel.shape
        pad_h, pad_w = kh // 2, kw // 2
        padded = np.pad(out, ((pad_h, pad_h), (pad_w, pad_w)), mode='constant')
        acc = np.zeros_like(out, dtype=np.int32)
        for y in range(out.shape[0]):
            for x in range(out.shape[1]):
                region = padded[y:y+kh, x:x+kw]
                acc[y, x] = int((region * kernel).sum())
        out = (acc > 0).astype(np.uint8)
    return out


def _connected_components(binary: np.ndarray) -> List[Tuple[int, int, int, int]]:
    h, w = binary.shape
    visited = np.zeros((h, w), dtype=np.uint8)
    boxes: List[Tuple[int, int, int, int]] = []
    for y in range(h):
        for x in range(w):
            if binary[y, x] and not visited[y, x]:
                # BFS
                stack = [(y, x)]
                visited[y, x] = 1
                minx, miny = x, y
                maxx, maxy = x, y
                count = 0
                while stack:
                    cy, cx = stack.pop()
                    count += 1
                    minx, miny = min(minx, cx), min(miny, cy)
                    maxx, maxy = max(maxx, cx), max(maxy, cy)
                    for ny in (cy-1, cy, cy+1):
                        for nx in (cx-1, cx, cx+1):
                            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and binary[ny, nx]:
                                visited[ny, nx] = 1
                                stack.append((ny, nx))
                bw = maxx - minx + 1
                bh = maxy - miny + 1
                boxes.append((minx, miny, bw, bh))
    return boxes


def find_candidate_boxes(img: np.ndarray) -> List[Tuple[int, int, int, int]]:
    h, w = img.shape[:2]
    gray = _to_gray(img)
    edges = _edges_binary(gray)
    edges = _dilate(edges, iterations=1)

    boxes = _connected_components(edges)

    filtered = []
    for (x, y, bw, bh) in boxes:
        area = bw * bh
        if area < 2000:
            continue
        if area > (w * h * 0.6):
            continue
        ratio = bw / float(bh)
        if ratio < 0.2 or ratio > 5.0:
            continue
        filtered.append((x, y, bw, bh))

    # sort by area descending then apply crude NMS
    filtered.sort(key=lambda b: b[2] * b[3], reverse=True)
    selected: List[Tuple[int, int, int, int]] = []
    def iou(a, b):
        ax1, ay1, aw, ah = a
        bx1, by1, bw, bh = b
        ax2, ay2 = ax1 + aw, ay1 + ah
        bx2, by2 = bx1 + bw, by1 + bh
        inter_x1 = max(ax1, bx1)
        inter_y1 = max(ay1, by1)
        inter_x2 = min(ax2, bx2)
        inter_y2 = min(ay2, by2)
        inter_w = max(0, inter_x2 - inter_x1)
        inter_h = max(0, inter_y2 - inter_y1)
        inter_area = inter_w * inter_h
        a_area = aw * ah
        b_area = bw * bh
        union = a_area + b_area - inter_area
        return inter_area / union if union > 0 else 0.0
    for b in filtered:
        if all(iou(b, sb) <= 0.9 for sb in selected):
            selected.append(b)

    mediums = [b for b in selected if 5000 <= b[2] * b[3] <= 150000]
    smalls = [b for b in selected if 2000 <= b[2] * b[3] < 5000]
    larges = [b for b in selected if b[2] * b[3] > 150000]
    final = mediums + smalls + larges[:3]
    final.sort(key=lambda b: (b[1], b[0]))
    return final


def save_slices(img: np.ndarray, boxes: List[Tuple[int, int, int, int]], out_dir: str) -> List[dict]:
    ensure_dir(out_dir)
    meta = []
    pil_img = Image.fromarray(img)
    for i, (x, y, w, h) in enumerate(boxes, start=1):
        pad = 6
        x1 = max(0, x - pad)
        y1 = max(0, y - pad)
        x2 = min(img.shape[1], x + w + pad)
        y2 = min(img.shape[0], y + h + pad)
        crop = pil_img.crop((x1, y1, x2, y2))
        name = f"slice_{i:03d}.png"
        crop.save(os.path.join(out_dir, name))
        meta.append({"name": name, "bbox": [int(x1), int(y1), int(x2 - x1), int(y2 - y1)]})
    return meta


def save_preview(img: np.ndarray, boxes: List[Tuple[int, int, int, int]], out_path: str):
    pil_prev = Image.fromarray(img)
    draw = ImageDraw.Draw(pil_prev)
    for i, (x, y, w, h) in enumerate(boxes, start=1):
        x2, y2 = x + w, y + h
        draw.rectangle([(x, y), (x2, y2)], outline=(14, 165, 233), width=2)
        draw.text((x, max(0, y - 12)), str(i), fill=(14, 165, 233))
    pil_prev.save(out_path)


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 scripts/slice_login.py <input_png> <output_dir>")
        sys.exit(1)
    in_path = sys.argv[1]
    out_dir = sys.argv[2]
    if not os.path.exists(in_path):
        print(f"Input not found: {in_path}")
        sys.exit(2)

    pil = Image.open(in_path).convert('RGB')
    img = np.array(pil)

    boxes = find_candidate_boxes(img)
    meta = save_slices(img, boxes, out_dir)
    ensure_dir(out_dir)
    with open(os.path.join(out_dir, 'slices.json'), 'w', encoding='utf-8') as f:
        json.dump({"input": in_path, "count": len(meta), "slices": meta}, f, ensure_ascii=False, indent=2)
    save_preview(img, boxes, os.path.join(out_dir, 'preview_bboxes.png'))
    print(f"Done. Slices: {len(meta)} -> {out_dir}")


if __name__ == '__main__':
    main()
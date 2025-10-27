#!/usr/bin/env python3
import os
from PIL import Image

IN_PATH = os.path.join('UIDESIGN', '登录页.png')
OUT_PATH = os.path.join('miniprogram', 'assets', 'login', 'slice_004.png')

# 重新裁剪 slice_004：按当前元数据 [0,0,786,896]
X1, Y1, W, H = 0, 0, 786, 896
X2, Y2 = X1 + W, Y1 + H

def main():
    if not os.path.exists(IN_PATH):
        raise FileNotFoundError(f'Input not found: {IN_PATH}')
    img = Image.open(IN_PATH).convert('RGB')
    w, h = img.size
    x1 = max(0, min(w, X1))
    y1 = max(0, min(h, Y1))
    x2 = max(0, min(w, X2))
    y2 = max(0, min(h, Y2))
    crop = img.crop((x1, y1, x2, y2))
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    crop.save(OUT_PATH)
    print(f'Saved: {OUT_PATH} [{x1},{y1},{x2-x1},{y2-y1}]')

if __name__ == '__main__':
    main()
#!/usr/bin/env python3
import os
from PIL import Image

IN_PATH = os.path.join('UIDESIGN', '登录页.png')
OUT_PATH = os.path.join('miniprogram', 'assets', 'login', 'slice_012.png')

# 根据现有 slice_012 的中心，扩展覆盖范围以贴近原图背景
# 原 bbox: [350, 1163, 86, 50] -> 中心 (393, 1188)
# 新 bbox: 使用原图比例（保持 86x50 原始尺寸），后续在页面上进行横向平铺扩展
NEW_W, NEW_H = 86, 50
CENTER_X, CENTER_Y = 393, 1188
X1 = max(0, CENTER_X - NEW_W // 2)
Y1 = max(0, CENTER_Y - NEW_H // 2)
X2 = CENTER_X + NEW_W // 2
Y2 = CENTER_Y + NEW_H // 2

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
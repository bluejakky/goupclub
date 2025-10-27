#!/usr/bin/env python3
import os, json
from PIL import Image

IN_PATH = os.path.join('UIDESIGN', '登录页.png')
OUT_DIR = os.path.join('miniprogram', 'assets', 'login')
OUT_JSON = os.path.join(OUT_DIR, 'custom_slices.json')
OUT_WXML = os.path.join('miniprogram', 'pages', 'login', 'login.wxml')

# 根据你的要求，仅输出以下四个自定义切片：
# 1) 用户名及其前面的图标  2) 密码及其前面的图标
# 3) 登录按钮及其背景      4) 手机号快捷登录
# 坐标为依据现有版式的合理默认值，可按需微调
SLICES = [
    {"name": "custom_username.png", "bbox": [198, 1100, 490, 60]},
    {"name": "custom_password.png", "bbox": [198, 1187, 490, 60]},
    {"name": "custom_login.png",    "bbox": [240, 1585, 340, 60]},
    {"name": "custom_phone_quick.png", "bbox": [93, 971, 220, 50]},
]

def clamp_bbox(w, h, x, y, bw, bh):
    x1 = max(0, min(w, x))
    y1 = max(0, min(h, y))
    x2 = max(0, min(w, x + bw))
    y2 = max(0, min(h, y + bh))
    return x1, y1, x2, y2

def main():
    if not os.path.exists(IN_PATH):
        raise FileNotFoundError(f'Input not found: {IN_PATH}')
    img = Image.open(IN_PATH).convert('RGB')
    W, H = img.size
    os.makedirs(OUT_DIR, exist_ok=True)

    meta = []
    for s in SLICES:
        name = s['name']
        x, y, bw, bh = s['bbox']
        x1, y1, x2, y2 = clamp_bbox(W, H, x, y, bw, bh)
        crop = img.crop((x1, y1, x2, y2))
        crop.save(os.path.join(OUT_DIR, name))
        meta.append({"name": name, "bbox": [int(x1), int(y1), int(x2 - x1), int(y2 - y1)]})

    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump({"input": IN_PATH, "count": len(meta), "slices": meta}, f, ensure_ascii=False, indent=2)

    # 生成页面，仅渲染上述四个切片，并在登录按钮上叠加点击层
    lines = []
    lines.append('<view class="page login-page">')
    lines.append('  <view class="design-canvas" style="transform: scale({{designScale}}); transform-origin: left top;">')
    for s in meta:
        name = s['name']
        x, y, w, h = s['bbox']
        lines.append(f'    <image class="slice" src="/assets/login/{name}" style="left:{x}px; top:{y}px; width:{w}px; height:{h}px"/>')
    # 登录点击层（注册不生成）
    for s in meta:
        if s['name'] == 'custom_login.png':
            x, y, w, h = s['bbox']
            lines.append(f'    <view class="btn btn-login" style="left:{x}px; top:{y}px; width:{w}px; height:{h}px" bindtap="onSubmit"></view>')
            break
    lines.append('  </view>')
    lines.append('</view>')
    os.makedirs(os.path.dirname(OUT_WXML), exist_ok=True)
    with open(OUT_WXML, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'Custom slices written: {OUT_JSON}; WXML updated: {OUT_WXML}')

if __name__ == '__main__':
    main()
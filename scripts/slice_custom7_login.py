#!/usr/bin/env python3
import os, json
from PIL import Image

IN_PATH = os.path.join('UIDESIGN', '登录页.png')
OUT_DIR = os.path.join('miniprogram', 'assets', 'login')
OUT_JSON = os.path.join(OUT_DIR, 'custom7_slices.json')
OUT_WXML = os.path.join('miniprogram', 'pages', 'login', 'login.wxml')
CFG_PATH = os.path.join('scripts', 'custom7_config.json')
CANVAS_CFG_JS = os.path.join('miniprogram', 'pages', 'login', 'canvas-config.js')
DESIGN_BG_PATH = os.path.join('miniprogram', 'assets', 'login', 'design.png')

# 七项自定义切片：
# 1) 登录/注册区域上方整体图（不含按钮区）
# 2) 登录文本（标签/按钮文案）
# 3) 注册文本（标签/按钮文案）
# 4) 用户名 + 左侧图标
# 5) 密码 + 左侧图标
# 6) 登录按钮含背景（完整按钮块）
# 7) 手机号快捷登录

DEFAULT_SLICES = [
    {"name": "c7_above_buttons.png",   "bbox": [0, 1160, 786, 380]},
    {"name": "c7_login_label.png",     "bbox": [260, 1548, 160, 56]},
    {"name": "c7_register_label.png",  "bbox": [436, 1548, 160, 56]},
    {"name": "c7_username.png",        "bbox": [160, 1050, 560, 76]},
    {"name": "c7_password.png",        "bbox": [160, 1140, 560, 76]},
    {"name": "c7_login_button.png",    "bbox": [220, 1538, 380, 80]},
    {"name": "c7_phone_quick.png",     "bbox": [80, 920, 260, 60]},
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

    # 读取自定义坐标配置（如存在）
    slices_cfg = None
    if os.path.exists(CFG_PATH):
        try:
            with open(CFG_PATH, 'r', encoding='utf-8') as cf:
                data = json.load(cf)
                slices_cfg = data.get('slices')
        except Exception as e:
            print(f'[warn] 读取 {CFG_PATH} 失败，使用默认坐标: {e}')
    SLICES = slices_cfg if slices_cfg else DEFAULT_SLICES

    # 若未提供或需要动态计算“上方区域”，根据 登录/注册 文本的最小 top 自动推导
    names = [s['name'] for s in SLICES]
    if 'c7_above_buttons.png' in names:
        # 查找登录与注册的顶边 y
        top_candidates = []
        for key in ('c7_login_label.png', 'c7_register_label.png'):
            for s in SLICES:
                if s['name'] == key:
                    x, y, bw, bh = s['bbox']
                    top_candidates.append(y)
                    break
        if top_candidates:
            ymin = min(top_candidates)
            # 以最小 top 之上区域作为上方切片（留 8px 余量）
            auto_above = {"name": "c7_above_buttons.png", "bbox": [0, 0, W, max(0, ymin - 8)]}
            # 替换现有上方切片的 bbox
            for s in SLICES:
                if s['name'] == 'c7_above_buttons.png':
                    s['bbox'] = auto_above['bbox']
                    break

    meta = []
    for s in SLICES:
        name = s['name']
        x, y, bw, bh = s['bbox']
        x1, y1, x2, y2 = clamp_bbox(W, H, x, y, bw, bh)
        crop = img.crop((x1, y1, x2, y2))
        crop.save(os.path.join(OUT_DIR, name))
        meta.append({"name": name, "bbox": [int(x1), int(y1), int(x2 - x1), int(y2 - y1)]})

    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump({"input": IN_PATH, "canvas_size": [W, H], "count": len(meta), "slices": meta}, f, ensure_ascii=False, indent=2)

    # 生成 JS 画布配置（供页面读取设计尺寸）
    os.makedirs(os.path.dirname(CANVAS_CFG_JS), exist_ok=True)
    with open(CANVAS_CFG_JS, 'w', encoding='utf-8') as cf:
        cf.write(f"module.exports = {{ designW: {W}, designH: {H} }}\n")

    # 输出整图作为对齐参考背景
    img.save(DESIGN_BG_PATH)

    # 生成页面：仅渲染自定义7个切片；登录/注册添加点击层
    lines = []
    lines.append('<view class="page login-page">')
    lines.append('  <view class="design-canvas {{debug?\'debug\':\'\'}}" style="width: {{designW}}px; height: {{designH}}px; transform: scale({{designScale}}); transform-origin: left top;">')
    # 背景整图（便于核对切片位置）
    lines.append(f'    <image class="slice design-bg" src="/assets/login/design.png" style="left:0px; top:0px; width:{W}px; height:{H}px"/>')
    for s in meta:
        name = s['name']
        x, y, w, h = s['bbox']
        lines.append(f'    <image class="slice" src="/assets/login/{name}" style="left:{x}px; top:{y}px; width:{w}px; height:{h}px"/>')
    # 点击层：登录按钮与注册标签
    def find_bbox(n):
        for s in meta:
            if s['name'] == n:
                return s['bbox']
        return None
    for n, cls, tap in [("c7_login_button.png", "btn-login", "onSubmit"), ("c7_register_label.png", "btn-register", "onRegister")]:
        bbox = find_bbox(n)
        if bbox:
            x, y, w, h = bbox
            lines.append(f'    <view class="btn {cls}" style="left:{x}px; top:{y}px; width:{w}px; height:{h}px" bindtap="{tap}"></view>')
    lines.append('  </view>')
    lines.append('</view>')

    os.makedirs(os.path.dirname(OUT_WXML), exist_ok=True)
    with open(OUT_WXML, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'Custom7 slices written: {OUT_JSON}; WXML updated: {OUT_WXML}')

if __name__ == '__main__':
    main()
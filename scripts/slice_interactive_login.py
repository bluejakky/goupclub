#!/usr/bin/env python3
import os, json
from PIL import Image

IN_PATH = os.path.join('UIDESIGN', '登录页.png')
OUT_DIR = os.path.join('miniprogram', 'assets', 'login')
OUT_JSON = os.path.join(OUT_DIR, 'interactive_slices.json')
OUT_WXML = os.path.join('miniprogram', 'pages', 'login', 'login.wxml')
OUT_WXSS = os.path.join('miniprogram', 'pages', 'login', 'login.wxss')
CANVAS_CFG_JS = os.path.join('miniprogram', 'pages', 'login', 'canvas-config.js')
CFG_PATH = os.path.join('scripts', 'interactive_config.json')

DEFAULT_CFG = {
  "bboxes": {
    "top_area": [0, 0, 786, 520],
    "register_label": [436, 1548, 160, 56],
    "login_button_bg": [220, 1538, 380, 80],
    "phone_quick_label": [80, 920, 260, 60],
    "username_bg": [160, 1050, 560, 76],
    "password_bg": [160, 1140, 560, 76],
    "privacy_text": [160, 1480, 260, 40],
    "privacy_checkbox": [120, 1482, 32, 32]
  },
  "inputs": {
    "username": [170, 1060, 540, 60],
    "password": [170, 1150, 540, 60]
  }
}

def clamp_bbox(w, h, x, y, bw, bh):
    x1 = max(0, min(w, x))
    y1 = max(0, min(h, y))
    x2 = max(0, min(w, x + bw))
    y2 = max(0, min(h, y + bh))
    return x1, y1, x2, y2

def crop(img, w, h, bbox):
    x, y, bw, bh = bbox
    x1, y1, x2, y2 = clamp_bbox(w, h, x, y, bw, bh)
    return img.crop((x1, y1, x2, y2)), (x1, y1, x2-x1, y2-y1)

def main():
    if not os.path.exists(IN_PATH):
        raise FileNotFoundError(f'Input not found: {IN_PATH}')
    os.makedirs(OUT_DIR, exist_ok=True)
    img = Image.open(IN_PATH).convert('RGB')
    W, H = img.size

    # load config
    cfg = DEFAULT_CFG
    if os.path.exists(CFG_PATH):
        try:
            with open(CFG_PATH, 'r', encoding='utf-8') as f:
                file_cfg = json.load(f)
                for k in ('bboxes','inputs'):
                    if k in file_cfg:
                        cfg[k] = file_cfg[k]
        except Exception as e:
            print(f'[warn] failed to read {CFG_PATH}: {e}')

    b = cfg['bboxes']
    i = cfg['inputs']

    # crop slices
    meta = []
    to_crop = [
        ('top_area.png', b['top_area']),
        ('register_label.png', b['register_label']),
        ('login_button_bg.png', b['login_button_bg']),
        ('phone_quick_label.png', b['phone_quick_label']),
        ('username_bg.png', b['username_bg']),
        ('password_bg.png', b['password_bg']),
        ('privacy_text.png', b['privacy_text'])
    ]
    for name, bbox in to_crop:
        patch, real = crop(img, W, H, bbox)
        patch.save(os.path.join(OUT_DIR, name))
        meta.append({"name": name, "bbox": [int(real[0]), int(real[1]), int(real[2]), int(real[3])]})

    # export whole design for alignment
    img.save(os.path.join(OUT_DIR, 'design.png'))

    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump({"input": IN_PATH, "canvas_size": [W, H], "count": len(meta), "slices": meta, "inputs": i}, f, ensure_ascii=False, indent=2)

    # canvas config
    os.makedirs(os.path.dirname(CANVAS_CFG_JS), exist_ok=True)
    with open(CANVAS_CFG_JS, 'w', encoding='utf-8') as cf:
        cf.write(f"module.exports = {{ designW: {W}, designH: {H} }}\n")

    # generate WXML
    def style_rect(x,y,w,h):
        return f'left:{x}px; top:{y}px; width:{w}px; height:{h}px'
    def bbox_of(name):
        for s in meta:
            if s['name'] == name:
                return s['bbox']
        return None

    lines = []
    lines.append('<view class="page login-page">')
    lines.append('  <view class="design-canvas {{debug?\'debug\':\'\'}}" style="width: {{designW}}px; height: {{designH}}px; transform: scale({{designScale}}); transform-origin: left top;">')
    # background design image for alignment
    lines.append(f'    <image class="slice design-bg" src="/assets/login/design.png" style="{style_rect(0,0,W,H)}"/>')
    # render background slices
    for s in meta:
        name = s['name']
        x, y, w, h = s['bbox']
        lines.append(f'    <image class="slice" src="/assets/login/{name}" style="{style_rect(x,y,w,h)}"/>')
    # inputs
    ux,uy,uw,uh = i['username']
    px,py,pw,ph = i['password']
    lines.append(f'    <input class="abs-input" style="{style_rect(ux,uy,uw,uh)}" placeholder="请输入用户名" bindinput="onInput" data-field="username"/>')
    lines.append(f'    <input class="abs-input" style="{style_rect(px,py,pw,ph)}" placeholder="请输入密码" password="true" bindinput="onInput" data-field="password"/>')
    # click overlays: login, register, phone quick, privacy checkbox
    for key, cls, tap in [
        ('login_button_bg.png','btn-login','onSubmit'),
        ('register_label.png','btn-register','onRegister'),
        ('phone_quick_label.png','btn-phone','onPhoneQuick')
    ]:
        bbox = bbox_of(key)
        if bbox:
            x,y,w,h = bbox
            lines.append(f'    <view class="btn {cls}" style="{style_rect(x,y,w,h)}" bindtap="{tap}"></view>')
    cbx = b['privacy_checkbox']
    cx,cy,cw,ch = cbx
    lines.append(f'    <view class="agree-box" style="{style_rect(cx,cy,cw,ch)}" bindtap="toggleAgree">')
    lines.append('      <view class="agree-inner {{agree?\'on\':\'\'}}"></view>')
    lines.append('    </view>')
    lines.append('  </view>')
    lines.append('</view>')
    os.makedirs(os.path.dirname(OUT_WXML), exist_ok=True)
    with open(OUT_WXML, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # ensure WXSS contains needed classes (append minimal if missing)
    # we do not overwrite existing styles; only ensure essentials
    if os.path.exists(OUT_WXSS):
        base = open(OUT_WXSS,'r',encoding='utf-8').read()
    else:
        base = ''
    additions = '''
.design-canvas { position: relative; margin: 0 auto; overflow: hidden; }
.slice { position: absolute; pointer-events: none; }
.abs-input { position: absolute; z-index: 12; background: transparent; border: none; padding: 6px 10px; font-size: 14px; color: #111; }
.btn { position: absolute; z-index: 10; }
.agree-box { position: absolute; z-index: 11; border: 1px solid #aaa; border-radius: 4px; }
.agree-inner { width: 100%; height: 100%; background: transparent; }
.agree-inner.on { background: #07c160; }
.design-canvas.debug .slice { outline: 1px dashed rgba(0, 128, 255, 0.4); }
.design-canvas.debug .btn, .design-canvas.debug .agree-box { outline: 1px dashed rgba(255, 0, 0, 0.5); }
'''
    with open(OUT_WXSS,'w',encoding='utf-8') as wf:
        wf.write(base + ('\n' if base and not base.endswith('\n') else '') + additions)

    print(f'Interactive slices written: {OUT_JSON}; WXML/WXSS updated.')

if __name__ == '__main__':
    main()
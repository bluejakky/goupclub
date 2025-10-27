#!/usr/bin/env python3
import os, json
from PIL import Image

IN_IMG = os.path.join('UIDESIGN', '登录页.png')
CFG_PATH = os.path.join('scripts', 'interactive_config.json')

def is_purple(r,g,b):
    # 粗略紫色检测：蓝和红较高，绿较低
    return r > 100 and b > 140 and g < 110 and (b - g) > 60

def detect_largest_purple_rect(img):
    w,h = img.size
    # 扫描下半区域，统计紫色像素的包围盒
    ymin = h//2
    minx,miny,maxx,maxy = w, h, 0, 0
    count = 0
    px = img.load()
    for y in range(ymin, h):
        for x in range(0, w):
            r,g,b = px[x,y]
            if is_purple(r,g,b):
                count += 1
                if x < minx: minx = x
                if y < miny: miny = y
                if x > maxx: maxx = x
                if y > maxy: maxy = y
    if count < 500: # 防止误检
        return None
    # 添加一些边距
    pad = 6
    minx = max(0, minx - pad)
    miny = max(0, miny - pad)
    maxx = min(w, maxx + pad)
    maxy = min(h, maxy + pad)
    return [minx, miny, maxx - minx, maxy - miny]

def main():
    if not os.path.exists(IN_IMG):
        raise FileNotFoundError(IN_IMG)
    img = Image.open(IN_IMG).convert('RGB')
    w,h = img.size

    # 读取现有配置
    cfg = {}
    if os.path.exists(CFG_PATH):
        with open(CFG_PATH,'r',encoding='utf-8') as f:
            cfg = json.load(f)
    else:
        cfg = {"bboxes":{}, "inputs":{}}

    b = cfg.setdefault('bboxes', {})
    i = cfg.setdefault('inputs', {})

    # 自动检测紫色登录按钮背景
    purple = detect_largest_purple_rect(img)
    if purple:
        b['login_button_bg'] = purple
        # 基于按钮位置，推算其他区域（相对偏移的经验值）
        # 注册与登录文案一般位于按钮上方约 40~70px 的区域
        btn_x, btn_y, btn_w, btn_h = purple
        b['register_label'] = [btn_x + btn_w - 160, btn_y - 60, 150, 48]
        # 手机号快捷登录通常位于更上方一块文本区域
        b['phone_quick_label'] = [btn_x - 140, btn_y - 180, 260, 56]
        # 文本框背景：在按钮上方约 400~520px 处，两行
        b['username_bg'] = [btn_x - 40, btn_y - 480, btn_w + 80, 70]
        b['password_bg'] = [btn_x - 40, btn_y - 390, btn_w + 80, 70]
        # 输入框实际区域稍微收缩 10px 内边距
        i['username'] = [b['username_bg'][0] + 10, b['username_bg'][1] + 8, b['username_bg'][2] - 20, b['username_bg'][3] - 16]
        i['password'] = [b['password_bg'][0] + 10, b['password_bg'][1] + 8, b['password_bg'][2] - 20, b['password_bg'][3] - 16]
        # 隐私单选与文案：通常在按钮上方约 120px 的一行，单选在文案左侧
        b['privacy_text'] = [btn_x + 40, btn_y - 120, 260, 40]
        b['privacy_checkbox'] = [b['privacy_text'][0] - 28, b['privacy_text'][1] + 4, 22, 22]
        # 顶部背景区域：到登录/注册文案之上
        top_cut = max(0, b['register_label'][1] - 8)
        b['top_area'] = [0, 0, w, top_cut]

    # 写回配置
    with open(CFG_PATH,'w',encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    print('Auto alignment updated interactive_config.json')

if __name__ == '__main__':
    main()
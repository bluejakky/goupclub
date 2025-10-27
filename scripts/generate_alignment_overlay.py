#!/usr/bin/env python3
import os, json
from PIL import Image, ImageDraw

IN_IMG = os.path.join('UIDESIGN', '登录页.png')
CFG_PATH = os.path.join('scripts', 'interactive_config.json')
OUT_IMG = os.path.join('miniprogram', 'assets', 'login', 'audit.png')

COLORS = {
    'top_area': (200, 200, 200),
    'register_label': (255, 80, 80),
    'login_button_bg': (80, 200, 120),
    'phone_quick_label': (80, 120, 255),
    'username_bg': (255, 165, 0),
    'password_bg': (150, 80, 200),
    'privacy_text': (120, 120, 120),
    'privacy_checkbox': (255, 0, 200),
    'username_input': (0, 0, 0),
    'password_input': (0, 0, 0)
}

def rect(draw, bbox, color, width=3):
    x, y, w, h = bbox
    draw.rectangle([x, y, x+w, y+h], outline=color, width=width)

def main():
    if not os.path.exists(IN_IMG):
        raise FileNotFoundError(f'Input not found: {IN_IMG}')
    img = Image.open(IN_IMG).convert('RGB')
    draw = ImageDraw.Draw(img)

    with open(CFG_PATH, 'r', encoding='utf-8') as f:
        cfg = json.load(f)
    b = cfg.get('bboxes', {})
    i = cfg.get('inputs', {})

    # draw regions
    order = [
        'top_area','register_label','login_button_bg','phone_quick_label',
        'username_bg','password_bg','privacy_text','privacy_checkbox'
    ]
    for key in order:
        if key in b:
            rect(draw, b[key], COLORS.get(key, (0,0,0)))

    # draw inputs
    if 'username' in i:
        rect(draw, i['username'], COLORS['username_input'], width=2)
    if 'password' in i:
        rect(draw, i['password'], COLORS['password_input'], width=2)

    os.makedirs(os.path.dirname(OUT_IMG), exist_ok=True)
    img.save(OUT_IMG)
    print(f'Audit overlay written: {OUT_IMG}')

if __name__ == '__main__':
    main()
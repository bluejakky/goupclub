#!/usr/bin/env python3
import os, json

IN_JSON = os.path.join('miniprogram', 'assets', 'login', 'slices.json')
OUT_WXML = os.path.join('miniprogram', 'pages', 'login', 'login.wxml')

def main():
    with open(IN_JSON, 'r', encoding='utf-8') as f:
        meta = json.load(f)
    slices = meta.get('slices', [])

    lines = []
    lines.append('<view class="page login-page">')
    lines.append('  <view class="design-canvas" style="transform: scale({{designScale}}); transform-origin: left top;">')
    for s in slices:
        name = s['name']
        x, y, w, h = s['bbox']
        lines.append(f'    <image class="slice" src="/assets/login/{name}" style="left:{x}px; top:{y}px; width:{w}px; height:{h}px"/>')
    # add clickable overlays for login/register if present
    def find_bbox(name):
        for s in slices:
            if s['name'] == name:
                return s['bbox']
        return None
    for btn_name, cls, tap in [('slice_013.png', 'btn-login', 'onSubmit'), ('slice_014.png', 'btn-register', 'onRegister')]:
        bbox = find_bbox(btn_name)
        if bbox:
            x, y, w, h = bbox
            lines.append(f'    <view class="btn {cls}" style="left:{x}px; top:{y}px; width:{w}px; height:{h}px" bindtap="{tap}"></view>')
    lines.append('  </view>')
    lines.append('</view>')

    os.makedirs(os.path.dirname(OUT_WXML), exist_ok=True)
    with open(OUT_WXML, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'WXML generated: {OUT_WXML} (slices: {len(slices)})')

if __name__ == '__main__':
    main()
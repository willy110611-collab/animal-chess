# 打包：source/ 的原始碼 → repo 根目錄的 index.html（網站）＋ server/worker.js（伺服器）
# 用法（在 source/ 資料夾裡）：npm install（第一次）→ python3 build.py
import os, re, sys
H = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(H); S = os.path.join(H, 'src')
rd = lambda p: open(p, encoding='utf-8').read()
CLIENT = ['data','sheet','engine','game','models','scene3d','units3d','icons','audio','ui','features','net','account','ladder','eggs','main']
js = '\n'.join(rd(os.path.join(S, f + '.js')) for f in CLIENT)
page = rd(os.path.join(S, 'template.html')).replace('/*__JS__*/', '(function(){\n' + js + '\n})();')
three_p = os.path.join(H, 'node_modules/three/build/three.min.js')
if not os.path.exists(three_p): sys.exit('先在 source/ 執行 npm install（需要 three.js）')
pwa = '<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#3b2a24"><link rel="apple-touch-icon" href="apple-touch-icon.png"><link rel="icon" href="icon-192.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="動物戰棋">'
full = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' + pwa + '</head><body style="margin:0">' + page.replace('/*__THREE__*/', '<script>' + rd(three_p) + '</script>') + '</body></html>'
open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8').write(full)
# 預覽版（three.js 走 CDN，給 claude.ai artifact 用；不放進 repo）
os.makedirs(os.path.join(H, 'dist'), exist_ok=True)
open(os.path.join(H, 'dist/preview.html'), 'w', encoding='utf-8').write(page.replace('/*__THREE__*/', '<script src="https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js"></script>'))
# 伺服器：共用遊戲邏輯＋server.js
imp = "import { DurableObject } from 'cloudflare:workers';\n"
srv = rd(os.path.join(H, 'server/server.js')).replace(imp, '')
game = '\n'.join(rd(os.path.join(S, f + '.js')) for f in ['data','sheet','engine','game'])
_v = re.search(r"dataset\.v\s*=\s*'([^']+)'", rd(os.path.join(S, 'ui.js')))
srv = srv.replace('__VER__', _v.group(1) if _v else '')
open(os.path.join(ROOT, 'server/worker.js'), 'w', encoding='utf-8').write(imp + game + '\n' + srv)
# 版本號提醒
v = re.search(r"dataset\.v\s*=\s*'([^']+)'", rd(os.path.join(S, 'ui.js')))
sw = rd(os.path.join(ROOT, 'sw.js')) if os.path.exists(os.path.join(ROOT, 'sw.js')) else ''
cv = re.search(r"zoo-v([0-9.]+)", sw)
print('完成：index.html', len(full), '字、server/worker.js')
if v and cv and v.group(1) != cv.group(1): print(f'提醒：ui.js 版本 {v.group(1)}，sw.js CACHE 是 zoo-v{cv.group(1)}，上線前請把 sw.js 改成一致')

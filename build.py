#!/usr/bin/env python3
"""Turn the claude.ai artifact page into the installable app's index.html.

Usage: python3 build.py path/to/artifact.html
The artifact page is the source of truth; run this after changing it, then bump VERSION in sw.js.
"""
import sys, re

src = open(sys.argv[1], encoding='utf-8').read()
# drop the viewer skeleton if the file was saved from a published artifact
if src.lstrip().lower().startswith('<!doctype'):
    src = src.split('<body>', 1)[1].rsplit('</body>', 1)[0]

def rep(old, new):
    global src
    assert src.count(old) == 1, old[:70]
    src = src.replace(old, new)

# In the app there is no claude.ai viewer, so save files with a normal download.
rep("""    const dl = await getDownloads();
    if (!dl) {""", """    const dl = await getDownloads();
    if (!dl && !window.claude) {
      try {
        const blob = data instanceof Blob ? data : new Blob([data], {
          type: /\\.json$/.test(filename) ? 'application/json' : 'text/plain'
        });
        const u = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = u;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 4000);
        toast('Saved ' + filename);
        return;
      } catch (e) {/* fall through to the copy sheet */}
    }
    if (!dl) {""")
rep("Personal picks need Claude, which isn’t available in this view.",
    "Personal picks from Claude only work in the claude.ai version for now.")

HEAD = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="theme-color" content="#FAF8F3">'
        '<meta name="apple-mobile-web-app-capable" content="yes">'
        '<meta name="mobile-web-app-capable" content="yes">'
        '<meta name="apple-mobile-web-app-status-bar-style" content="default">'
        '<meta name="apple-mobile-web-app-title" content="Zara">'
        '<link rel="manifest" href="manifest.webmanifest">'
        '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">'
        '<link rel="icon" type="image/png" href="icons/icon-192.png">'
        '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);'
        'padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}'
        'body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}'
        'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n')
TAIL = ("\n<script>if ('serviceWorker' in navigator) window.addEventListener('load', () => "
        "navigator.serviceWorker.register('sw.js').catch(() => {}));</script>\n</body></html>\n")
open('index.html', 'w', encoding='utf-8').write(HEAD + src.strip() + TAIL)
print('index.html written,', len(HEAD + src) // 1024, 'KB')

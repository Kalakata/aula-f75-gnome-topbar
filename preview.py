#!/usr/bin/env python3
"""Render an aulactl animation to a GIF, no keyboard needed: preview.py NAME SECONDS OUT.gif
Draws the F75's LED grid (15 columns x 6 rows, holes left out), so it shows what each LED gets,
not the exact keycap layout."""
import importlib.machinery, importlib.util, os, sys
from PIL import Image, ImageDraw, ImageFilter

here=os.path.dirname(os.path.abspath(__file__))
loader=importlib.machinery.SourceFileLoader('aulactl', os.path.join(here,'aulactl'))
a=importlib.util.module_from_spec(importlib.util.spec_from_loader('aulactl',loader)); loader.exec_module(a)

name,secs,out=sys.argv[1],float(sys.argv[2]),sys.argv[3]
if name in ('music','pulse'): sys.exit('music and pulse need live audio; pick another')
K,G,FPS=40,6,20                                         # key size, gap, frame rate
W,H=a.COLS*(K+G)+G, a.ROWS*(K+G)+G
px=a.ANIMS[name](); frames=[]
for n in range(int(secs*FPS)):
    t=n/FPS
    if hasattr(px,'step'): px.step(t)
    glow=Image.new('RGB',(W,H)); caps=Image.new('RGB',(W,H),(14,14,16))
    dg,dc=ImageDraw.Draw(glow),ImageDraw.Draw(caps)
    for c in range(a.COLS):
        for r in range(a.ROWS):
            if c*a.ROWS+r in a.NO_KEY: continue
            rgb=tuple(int(max(0,min(1,v))*255) for v in px(c,r,t))
            x,y=G+c*(K+G),G+r*(K+G)
            dg.rounded_rectangle((x,y,x+K,y+K),8,fill=rgb)              # light under the cap
            dc.rounded_rectangle((x+3,y+3,x+K-3,y+K-3),7,fill=tuple(22+v*3//4 for v in rgb))   # caps let most of the light through
    img=Image.blend(caps,glow.filter(ImageFilter.GaussianBlur(4)),0.35)
    frames.append(img.convert('P',palette=Image.Palette.ADAPTIVE,colors=64))
frames[0].save(out,save_all=True,append_images=frames[1:],duration=1000//FPS,loop=0,optimize=True)
print(f'{out}: {len(frames)} frames, {os.path.getsize(out)//1024} KB')

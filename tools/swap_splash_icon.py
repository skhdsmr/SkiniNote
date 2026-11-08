"""assets/splash.png의 아이콘만 app_final 스플래시의 아이콘(옆얼굴 + 잎사귀)으로 갈아 끼운다.

    python3 tools/swap_splash_icon.py

워드마크와 태그라인은 손대지 않는다. 두 스플래시는 크기(1200×1200)도 배경색도 같고 배경이
완전한 단색이라, 아이콘 주변을 넉넉히 잘라 붙여도 이음매가 보이지 않는다. 붙이기 전에 원래
아이콘 자리를 배경색으로 지운다 — 새 아이콘이 옛 카드의 그림자까지 다 덮지는 않기 때문이다.

새 아이콘 카드는 488px, 이 스플래시의 카드는 620px이라 그 비율만큼 키워 옛 카드와 같은
자리·같은 크기에 놓는다. 판형이 그대로여서 글자와의 간격도 원래대로 남는다.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(ROOT), 'app_final', 'assets', 'splash.png')
DST = os.path.join(ROOT, 'assets', 'splash.png')

BG = (237, 240, 244)

SRC_CENTER = (600, 465)   # app_final 카드 중심 (x356..843, y220..709에서 측정)
SRC_CARD = 488            # 카드 한 변
CROP_HALF = 330           # 그림자까지 넉넉히 (아래 워드마크는 y811부터라 닿지 않는다)

DST_CENTER = (600, 500)   # 이 스플래시의 카드 중심 (x290..909, y190..809)
DST_CARD = 620
WORDMARK_TOP = 870        # 워드마크 첫 획 — 지우기도 붙이기도 여기서 멈춘다

src = Image.open(SRC).convert('RGB')
dst = Image.open(DST).convert('RGB')

icon = src.crop((SRC_CENTER[0] - CROP_HALF, SRC_CENTER[1] - CROP_HALF,
                 SRC_CENTER[0] + CROP_HALF, SRC_CENTER[1] + CROP_HALF))
side = round(2 * CROP_HALF * DST_CARD / SRC_CARD)
icon = icon.resize((side, side), Image.LANCZOS)

# 옛 아이콘 자리(그림자 포함)를 배경색으로 지운다 — 워드마크 바로 위까지만
dst.paste(BG, (140, 90, 1060, WORDMARK_TOP))
top = DST_CENTER[1] - side // 2
icon = icon.crop((0, 0, side, min(side, WORDMARK_TOP - top)))
dst.paste(icon, (DST_CENTER[0] - side // 2, top))
dst.save(DST)
print('saved', DST, dst.size)

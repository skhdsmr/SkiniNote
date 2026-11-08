# -*- coding: utf-8 -*-
"""아토피 4증상(홍반·구진·찰상·태선화) → 사용자 언어 3축 UX 스케치 생성기.

앱 코드와 무관한 디자인 시안용 스크립트. 실행: python3 make_sketches.py
결과 PNG는 이 폴더에 저장된다.
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', 'assets')
FONT_DIR = '/usr/share/fonts/truetype/nanum'
S = 2  # 슈퍼샘플링 배율 — 1x 좌표로 그리고 마지막에 축소

# ── 디자인 토큰 (src/theme.ts) ──
BG = '#EDF0F4'
CARD = '#FFFFFF'
INK = '#1C1C1E'
SUB = '#8E8E93'
LINE = '#ECECEF'
GREEN = '#93D258'
GREEN_INK = '#16320A'
GREEN_MUTED = '#4C6B2C'
BOX = '#F6F8FA'
DISABLED = '#E7E9EC'
GOOD = '#5B8DEF'  # sev0 — 좋아짐

# ── 3축 색 ──
INFL = '#EB5757'    # 염증 반응 (홍반+구진)
SCRATCH = '#F2994A'  # 긁은 흔적 (찰상)
CHRONIC = '#9C8370'  # 만성 흔적 (태선화)
INFL_BG, SCRATCH_BG, CHRONIC_BG = '#FDECEC', '#FEF2E7', '#F3EEEA'

# 레이어(의학 용어) 색 — 같은 축 안에서 톤만 다르게
L_ERY = '#EB5757'   # 홍반
L_PAP = '#C2185B'   # 구진
L_EXC = '#F2994A'   # 찰상
L_LICH = '#8D6E63'  # 태선화


def rgb(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


_fonts = {}


def F(size, w='R'):
    key = (size, w)
    if key not in _fonts:
        name = {'L': 'NanumSquareL.ttf', 'R': 'NanumSquareR.ttf', 'B': 'NanumSquareB.ttf',
                'EB': 'NanumSquareEB.ttf'}[w]
        _fonts[key] = ImageFont.truetype(os.path.join(FONT_DIR, name), int(size * S))
    return _fonts[key]


class Screen:
    def __init__(self, w, h, bg=BG):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w * S, h * S), rgb(bg))
        self.d = ImageDraw.Draw(self.im)

    # 기본 도형 ---------------------------------------------------------
    def rect(self, x, y, w, h, fill=None, r=0, outline=None, width=1):
        box = [x * S, y * S, (x + w) * S, (y + h) * S]
        self.d.rounded_rectangle(box, radius=r * S, fill=rgb(fill) if isinstance(fill, str) else fill,
                                 outline=rgb(outline) if isinstance(outline, str) else outline,
                                 width=int(width * S))

    def card(self, x, y, w, h, r=24, fill=CARD):
        sh = Image.new('RGBA', self.im.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle([x * S, (y + 4) * S, (x + w) * S, (y + h + 4) * S],
                                             radius=r * S, fill=(30, 40, 60, 22))
        sh = sh.filter(ImageFilter.GaussianBlur(9 * S))
        self.im.alpha_composite(sh)
        self.rect(x, y, w, h, fill, r)

    def circle(self, cx, cy, r, fill=None, outline=None, width=1):
        self.d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S],
                       fill=rgb(fill) if isinstance(fill, str) else fill,
                       outline=rgb(outline) if isinstance(outline, str) else outline, width=int(width * S))

    def line(self, pts, fill=INK, width=2, dash=None):
        pts = [(x * S, y * S) for x, y in pts]
        col = rgb(fill) if isinstance(fill, str) else fill
        if not dash:
            self.d.line(pts, fill=col, width=int(width * S), joint='curve')
            return
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            L = math.hypot(x2 - x1, y2 - y1)
            n = int(L // (dash * S * 2)) + 1
            for i in range(n):
                t0, t1 = i * 2 * dash * S / L, min(1, (i * 2 + 1) * dash * S / L)
                if t0 >= 1:
                    break
                self.d.line([(x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0),
                             (x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1)], fill=col, width=int(width * S))

    def text(self, x, y, s, size=16, w='R', fill=INK, anchor='la'):
        self.d.text((x * S, y * S), s, font=F(size, w), fill=rgb(fill) if isinstance(fill, str) else fill,
                    anchor=anchor)

    def tw(self, s, size=16, w='R'):
        return self.d.textlength(s, font=F(size, w)) / S

    def para(self, x, y, s, size=15, w='R', fill=SUB, lh=1.55):
        for i, ln in enumerate(s.split('\n')):
            self.text(x, y + i * size * lh, ln, size, w, fill)

    # 공통 UI ---------------------------------------------------------
    def header(self, s):
        self.rect(0, 0, self.w, 64, '#1E1E1E')
        self.text(20, 32, s, 22, 'B', '#FFFFFF', 'lm')

    def nav(self, title, y=130, back=True, sub=None):
        if back:
            self.line([(60, y - 12), (48, y), (60, y + 12)], INK, 3)
        self.text(self.w / 2, y, title, 30, 'EB', INK, 'mm')
        if sub:
            self.text(self.w / 2, y + 34, sub, 16, 'R', SUB, 'mm')

    def chip(self, x, y, s, fill, fg, size=15, w='B', h=32, outline=None, dot=None, pad=14):
        tw = self.tw(s, size, w) + pad * 2 + (18 if dot else 0)
        self.rect(x, y, tw, h, fill, h / 2, outline=outline, width=1.5)
        tx = x + pad
        if dot:
            self.circle(tx + 5, y + h / 2, 6, dot)
            tx += 18
        self.text(tx, y + h / 2, s, size, w, fg, 'lm')
        return tw

    def note(self, x, y, s, w=None):
        lines = s.split('\n')
        ww = w or max(self.tw(l, 16) for l in lines) + 32
        hh = len(lines) * 26 + 18
        self.rect(x, y, ww, hh, '#FFF0F0', 12, outline='#EB5757', width=1.2)
        for i, l in enumerate(lines):
            self.text(x + 16, y + 12 + i * 26, l, 16, 'R', '#E03E3E')

    def toggle(self, x, y, on=True):
        self.rect(x, y, 52, 30, GREEN if on else DISABLED, 15)
        self.circle(x + (37 if on else 15), y + 15, 12, '#FFFFFF')

    def checkbox(self, x, y, on=False, color=GREEN):
        if on:
            self.rect(x, y, 24, 24, color, 7)
            self.line([(x + 6, y + 12), (x + 10.5, y + 16.5), (x + 18, y + 8)], '#FFFFFF', 3)
        else:
            self.rect(x, y, 24, 24, '#FFFFFF', 7, outline='#DADDE2', width=2)

    def chevron(self, x, y, c=SUB):
        self.line([(x - 4, y - 8), (x + 4, y), (x - 4, y + 8)], c, 2.4)

    def button(self, x, y, w, h, s, fill=GREEN, fg=GREEN_INK, size=19):
        self.rect(x, y, w, h, fill, 16)
        self.text(x + w / 2, y + h / 2, s, size, 'EB', fg, 'mm')

    def axis_icon(self, cx, cy, kind, r=22):
        c, bg = {'infl': (INFL, INFL_BG), 'scratch': (SCRATCH, SCRATCH_BG), 'chronic': (CHRONIC, CHRONIC_BG)}[kind]
        self.circle(cx, cy, r, bg)
        k = r / 22
        if kind == 'infl':  # 불꽃
            pts = [(0, -13), (6, -5), (9, 3), (6, 10), (0, 12), (-6, 10), (-9, 3), (-6, -4), (-3, 0)]
            self.d.polygon([((cx + px * k) * S, (cy + py * k) * S) for px, py in pts], fill=rgb(c))
            self.circle(cx, cy + 6 * k, 3.5 * k, bg)
        elif kind == 'scratch':  # 세 줄 긁힘
            for dx in (-7, 0, 7):
                self.line([(cx + dx * k - 4 * k, cy - 10 * k), (cx + dx * k + 4 * k, cy + 10 * k)], c, 3.2 * k)
        else:  # 겹친 층(두꺼워짐)
            for i, dy in enumerate((-7, 0, 7)):
                self.rect(cx - 11 * k, cy + dy * k - 2.5 * k, 22 * k, 5 * k, c if i else CHRONIC_BG, 2.5 * k,
                          outline=c, width=1.5)

    def paste(self, img, x, y):
        self.im.alpha_composite(img.convert('RGBA'), (int(x * S), int(y * S)))

    def save(self, name):
        out = self.im.resize((self.w, self.h), Image.LANCZOS).convert('RGB')
        out.save(os.path.join(HERE, name))
        return out


def level_bar(sc, x, y, n, color, total=3, seg=26, gap=4, h=8):
    """4단계(없음·약간·보통·심함)를 3칸으로 — 없음이면 전부 꺼짐."""
    for i in range(total):
        sc.rect(x + i * (seg + gap), y, seg, h, color if i < n else DISABLED, h / 2)


# ════════════════════════════════════════════════════════════════════
# 사진 + 증상 마스크 (팔 오금 사진 위에 손으로 그린 가상 마스크)
# ════════════════════════════════════════════════════════════════════
ARM = Image.open(os.path.join(ASSETS, 'dump_photos', 'arm', '01.jpg')).convert('RGB')
AW, AH = ARM.size


def _mask():
    return Image.new('L', (AW, AH), 0)


def mask_erythema():
    m = _mask()
    ImageDraw.Draw(m).polygon([(60, 255), (85, 205), (135, 160), (190, 128), (260, 112), (305, 128), (312, 175),
                               (295, 215), (250, 250), (195, 275), (130, 280), (78, 275)], fill=255)
    return m.filter(ImageFilter.GaussianBlur(10)).point(lambda v: 255 if v > 120 else 0)


PAPULES = [(108, 232), (124, 248), (150, 214), (163, 196), (141, 262), (98, 256), (186, 232), (232, 160),
           (246, 140), (176, 258), (120, 205), (205, 245)]


def mask_papules():
    m = _mask()
    d = ImageDraw.Draw(m)
    for x, y in PAPULES:
        d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=255)
    return m


def mask_excoriation():
    m = _mask()
    d = ImageDraw.Draw(m)
    for a, b in [((266, 122), (292, 152)), ((146, 150), (174, 153)), ((113, 218), (126, 241)),
                 ((206, 150), (214, 188)), ((226, 140), (234, 192)), ((255, 132), (261, 182)),
                 ((93, 236), (108, 228))]:
        d.line([a, b], fill=255, width=4)
    return m


def mask_lichen():
    m = _mask()
    ImageDraw.Draw(m).polygon([(190, 122), (250, 104), (300, 114), (306, 168), (272, 206), (214, 202),
                               (188, 172)], fill=255)
    return m.filter(ImageFilter.GaussianBlur(6)).point(lambda v: 255 if v > 128 else 0)


def overlay(base, mask, color, alpha=95, hatch=False):
    """마스크를 반투명 면 + 진한 외곽선으로 덮는다."""
    col = rgb(color)
    out = base.convert('RGBA')
    fill = Image.new('RGBA', base.size, col[:3] + (alpha,))
    if hatch:
        hl = Image.new('L', base.size, 0)
        hd = ImageDraw.Draw(hl)
        for k in range(-base.size[1], base.size[0], 9):
            hd.line([(k, 0), (k + base.size[1], base.size[1])], fill=200, width=2)
        a = Image.new('L', base.size, alpha - 30)
        a.paste(hl, (0, 0), hl)
        fill.putalpha(a)
    clear = Image.new('RGBA', base.size, (0, 0, 0, 0))
    out = Image.alpha_composite(out, Image.composite(fill, clear, mask))
    edge = mask.filter(ImageFilter.MaxFilter(5)).point(lambda v: 255 if v else 0)
    edge = Image.eval(Image.merge('L', [edge]), lambda v: v)
    inner = mask.filter(ImageFilter.MinFilter(3))
    ring = Image.composite(Image.new('L', base.size, 255), Image.new('L', base.size, 0), edge)
    ring.paste(0, (0, 0), inner)
    out = Image.alpha_composite(out, Image.composite(Image.new('RGBA', base.size, col[:3] + (255,)), clear, ring))
    return out


def cover(img, w, h, radius=18):
    """img를 w×h 박스에 cover로 맞추고 모서리를 둥글린다 (S배 픽셀)."""
    W, H = int(w * S), int(h * S)
    sc = max(W / img.width, H / img.height)
    r = img.resize((int(img.width * sc + 0.5), int(img.height * sc + 0.5)), Image.LANCZOS)
    l, t = (r.width - W) // 2, (r.height - H) // 2
    r = r.crop((l, t, l + W, t + H)).convert('RGBA')
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, W, H], radius=radius * S, fill=255)
    r.putalpha(m)
    return r


def arm_with_layers(layers=('ery', 'pap', 'exc', 'lich')):
    im = ARM.convert('RGBA')
    if 'lich' in layers:
        im = overlay(im, mask_lichen(), L_LICH, 110, hatch=True)
    if 'ery' in layers:
        im = overlay(im, mask_erythema(), L_ERY, 70)
    if 'exc' in layers:
        im = overlay(im, mask_excoriation(), L_EXC, 160)
    if 'pap' in layers:
        im = overlay(im, mask_papules(), L_PAP, 170)
    return im


def arm_before():
    """10/04 시점 가정 — 같은 사진에 홍반을 진하게 얹어 '더 심했던' 상태를 흉내낸다."""
    m = mask_erythema().filter(ImageFilter.GaussianBlur(18)).point(lambda v: int(v * 0.55))
    red = Image.new('RGB', ARM.size, (205, 70, 70))
    im = Image.composite(red, ARM, m)
    d = ImageDraw.Draw(im)
    rnd = random.Random(3)
    for _ in range(40):
        x, y = rnd.randint(90, 290), rnd.randint(130, 270)
        if mask_erythema().getpixel((x, y)):
            d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(185, 60, 65))
    return im


# ════════════════════════════════════════════════════════════════════
# ① 검사 결과 — 증상 레이어 토글 + 3축 요약
# ════════════════════════════════════════════════════════════════════
def screen_result():
    sc = Screen(780, 1780)
    sc.header('① 검사 결과 — 원본 | 증상 부위 표시 + 사용자 언어 3축')
    sc.nav('검사 결과', sub='왼팔 오금 · 11월 1일 오후 9:12')

    # 사진 — 앱 결과 화면(ExamResultScreen photoRow)처럼 왼쪽 원본, 오른쪽 분할 오버레이
    sc.card(40, 196, 700, 490)
    pw, ph = 318, 272
    sc.paste(cover(ARM, pw, ph, 14), 64, 220)
    sc.paste(cover(arm_with_layers(('ery', 'exc', 'lich')), pw, ph, 14), 398, 220)
    sc.text(64 + pw / 2, 514, '촬영 이미지 (원본)', 15, 'B', SUB, 'mm')
    sc.text(398 + pw / 2, 514, '증상 부위 표시', 15, 'B', SUB, 'mm')

    sc.line([(64, 544), (716, 544)], LINE, 1.5)
    sc.text(64, 566, '증상 레이어', 16, 'B', INK)
    sc.text(716, 566, '탭해서 켜고 끄기 (오른쪽 사진에 반영)', 14, 'R', SUB, 'ra')
    x = 64
    for name, col, on in [('홍반', L_ERY, True), ('구진', L_PAP, False), ('찰상', L_EXC, True), ('태선화', L_LICH, True)]:
        if on:
            x += sc.chip(x, 598, name, col, '#FFFFFF', 16, 'B', 40, dot=None, pad=20) + 10
        else:
            x += sc.chip(x, 598, name + '  끔', '#FFFFFF', SUB, 16, 'B', 40, outline='#DADDE2', pad=20) + 10
    sc.text(64, 656, '색이 칠해진 곳이 AI가 찾은 부위예요 · 진단이 아닌 참고용이에요', 13, 'R', SUB)

    # 피부 종합 상태 — 앱 MetricCard 구조: 제목·점수·단계 배지 + 4단계 알약 막대(현재 단계만 채움)
    skin = 32
    segs = [('매우 나쁨', '#EB5757'), ('나쁨', '#F2994A'), ('주의', '#FFD966'), ('좋음', '#5B8DEF')]
    cur = 1
    y = 716
    sc.card(40, y, 700, 168)
    sc.text(68, y + 40, '피부 종합 상태', 21, 'EB', INK, 'lm')
    sc.text(68 + sc.tw('피부 종합 상태', 21, 'EB') + 14, y + 42, str(skin), 24, 'EB', INK, 'lm')
    sc.text(68 + sc.tw('피부 종합 상태', 21, 'EB') + 14 + sc.tw(str(skin), 24, 'EB') + 4, y + 46, '/100', 14, 'R', SUB, 'lm')
    bw_ = sc.tw(segs[cur][0], 15, 'EB') + 40
    sc.rect(712 - max(bw_, 74), y + 22, max(bw_, 74), 36, segs[cur][1], 10)
    sc.text(712 - max(bw_, 74) / 2, y + 40, segs[cur][0], 15, 'EB', '#FFFFFF', 'mm')
    segw = (644 - 3 * 6) / 4
    for i, (nm, c) in enumerate(segs):
        sx = 68 + i * (segw + 6)
        sc.rect(sx, y + 84, segw, 12, c if i == cur else LINE, 6)
        sc.text(sx + segw / 2, y + 116, nm, 13, 'EB' if i == cur else 'R', c if i == cur else SUB, 'mm')
    sc.text(68, y + 148, '염증·긁은 흔적·만성 흔적을 합쳐 매긴 점수예요 (100점에 가까울수록 좋아요)', 13, 'R', SUB, 'lm')

    # 3축 요약
    sc.text(44, 926, '지금 이 부위는', 22, 'EB', INK)
    sc.text(736, 930, '칸 0~3 = 없음·약간·보통·심함', 13, 'R', SUB, 'ra')
    y = 966
    sc.card(40, y, 700, 570)
    rows = [
        ('infl', '염증 반응', INFL, 3, '심함', '지금 피부가 예민하게 반응하고 있어요', '홍반 · 구진', '트리거 탐정'),
        ('scratch', '긁은 흔적', SCRATCH, 2, '보통', '긁어서 피부가 손상됐어요', '찰상', '감염 체크'),
        ('chronic', '만성 흔적', CHRONIC, 1, '약간', '이 부위는 오래 반복돼서 두꺼워졌어요', '태선화', '회복 트래커'),
    ]
    for i, (k, label, col, n, lv, msg, med, action) in enumerate(rows):
        ry = y + 28 + i * 190
        if i:
            sc.line([(72, ry - 24), (708, ry - 24)], LINE, 1.5)
        sc.axis_icon(96, ry + 22, k, 26)
        sc.text(138, ry + 8, label, 21, 'EB', INK)
        level_bar(sc, 138 + sc.tw(label, 21, 'EB') + 16, ry + 14, n, col)
        sc.text(708, ry + 8, lv, 18, 'EB', col, 'ra')
        sc.text(138, ry + 46, msg, 17, 'R', '#3A3A3C')
        sc.chip(138, ry + 84, '의학 용어: ' + med, BOX, SUB, 13, 'R', 28, pad=10)
        aw = sc.tw(action + '  ', 15, 'B') + 40
        sc.rect(708 - aw, ry + 80, aw, 36, {'infl': INFL_BG, 'scratch': SCRATCH_BG, 'chronic': CHRONIC_BG}[k], 18)
        sc.text(708 - aw + 16, ry + 98, action, 15, 'B', col, 'lm')
        sc.chevron(708 - 18, ry + 98, col)

    sc.note(40, 1572, '메인에는 사용자 언어 3축만, 의학 용어(홍반·구진·찰상·태선화)는\n'
                      '레이어 칩과 작은 회색 태그로만 노출 → 진료 때 의사와 대화할 때 쓰기')
    sc.note(40, 1664, '피부 종합 상태는 앱과 같은 4단계(좋음·주의·나쁨·매우 나쁨) 알약 막대\n'
                      '각 축의 버튼이 증상별 특화 기능(④⑤⑥)으로 연결')
    return sc.save('01_result_symptom_layers.png')


# ════════════════════════════════════════════════════════════════════
# ② 기록 탭 = 바디맵 (바디맵 + 경과기록 통합)
# ════════════════════════════════════════════════════════════════════
def body_silhouette(h):
    """body_outline.png를 높이 h(1x)로 맞추고, 몸 안쪽 마스크를 함께 돌려준다."""
    src = Image.open(os.path.join(ASSETS, 'body', 'body_outline.png')).convert('L')
    sc = h * S / src.height
    W, H = int(src.width * sc), int(h * S)
    src = src.resize((W, H), Image.LANCZOS)
    lines = src.point(lambda v: 255 if v < 170 else 0)
    fill = lines.copy()
    ImageDraw.floodfill(fill, (0, 0), 128)
    inside = fill.point(lambda v: 255 if v == 0 else 0)
    inside = inside.filter(ImageFilter.MaxFilter(3))
    return lines, inside, sc / S


# 원본 327×949 좌표계 기준 부위. 화면 기준 오른쪽 = 사용자의 왼쪽
# 앱 전신 결과(WholeBodyResultScreen)처럼 불투명 원 = 상태(축 색, 고정 크기), 점선 원 = 넓이
REGIONS = [
    # key, 이름, (cx, cy), 색, 라벨 쪽, 오늘 넓이%, 4주 전 넓이%
    ('face', '얼굴(볼)', (163, 82), INFL, 'L', 12, 5),
    ('neck', '목', (163, 165), CHRONIC, 'R', 7, 8),
    ('elbowR', '오른팔 오금', (52, 395), INFL, 'L', 6, 11),
    ('elbowL', '왼팔 오금', (274, 395), SCRATCH, 'R', 9, 15),
    ('handL', '왼손등', (290, 548), SCRATCH, 'R', 4, 4),
    ('kneeR', '오른 무릎', (122, 705), GOOD, 'L', 1, 9),
]


def area_r(pct):
    """넓이% → 점선 원 반지름. 앱과 같이 √넓이에 비례 (원의 면적이 넓이%에 선형)."""
    return 16 + 34 * math.sqrt(min(1, max(0, (pct - 0.5) / 19.5)))


def dashed_circle(sc, cx, cy, r, color, width=2, seg_deg=None):
    n = max(8, int(2 * math.pi * r / 9))
    for i in range(0, n, 2):
        a0, a1 = 360 * i / n, 360 * (i + 1) / n
        sc.d.arc([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], a0, a1,
                 fill=rgb(color) if isinstance(color, str) else color, width=int(width * S))


def body_silhouette(h):
    """body_outline.png를 높이 h(1x)로 맞추고, 몸 안쪽 마스크를 함께 돌려준다."""
    src = Image.open(os.path.join(ASSETS, 'body', 'body_outline.png')).convert('L')
    sc = h * S / src.height
    W, H = int(src.width * sc), int(h * S)
    src = src.resize((W, H), Image.LANCZOS)
    lines = src.point(lambda v: 255 if v < 170 else 0)
    fill = lines.copy()
    ImageDraw.floodfill(fill, (0, 0), 128)
    inside = fill.point(lambda v: 255 if v == 0 else 0)
    inside = inside.filter(ImageFilter.MaxFilter(3))
    return lines, inside, sc / S


def draw_bodymap(sc, x, y, h, selected='elbowL', compare=True, label_x=(None, None)):
    lines, inside, k = body_silhouette(h)
    base = Image.new('RGBA', lines.size, (0, 0, 0, 0))
    base.paste(rgb('#F4F5F7'), (0, 0), inside)
    clear = Image.new('RGBA', lines.size, (0, 0, 0, 0))
    ink = Image.new('RGBA', lines.size, rgb('#6B6F76'))
    base = Image.alpha_composite(base, Image.composite(ink, clear, lines))
    sc.paste(base, x, y)
    for key, name, (cx, cy), col, side, now, past in REGIONS:
        px, py = x + cx * k, y + cy * k
        if compare:
            dashed_circle(sc, px, py, area_r(past), '#9EA3AB', 1.8)
        # 오늘 넓이: 연한 면 + 점선
        layer = Image.new('RGBA', sc.im.size, (0, 0, 0, 0))
        r = area_r(now)
        ImageDraw.Draw(layer).ellipse([(px - r) * S, (py - r) * S, (px + r) * S, (py + r) * S], fill=rgb(col, 45))
        sc.im.alpha_composite(layer)
        dashed_circle(sc, px, py, r, col, 2.4)
        sc.circle(px, py, 9, col, '#FFFFFF', 2)
        sel = key == selected
        if sel:
            sc.circle(px, py, r + 7, None, INK, 3)
        lx = label_x[0] if side == 'L' else label_x[1]
        tw = sc.tw(name, 15, 'B') + 30
        bx = lx - tw if side == 'L' else lx
        edge = px - r if side == 'L' else px + r
        sc.line([(edge, py), (bx + (tw if side == 'L' else 0), py)], '#B6BAC1', 1.5)
        sc.rect(bx, py - 17, tw, 34, INK if sel else '#FFFFFF', 17, outline=None if sel else '#DADDE2', width=1.5)
        sc.circle(bx + 14, py, 5, col)
        sc.text(bx + 24, py, name, 15, 'B', '#FFFFFF' if sel else INK, 'lm')


def screen_bodymap():
    sc = Screen(780, 2290)
    sc.header('② 기록 탭 > 경과 관찰 — 바디맵 + 경과기록 통합')
    sc.text(44, 126, '경과 관찰', 32, 'EB', INK, 'lm')
    sc.text(44, 160, '4곳을 지켜보고 있어요', 15, 'R', SUB, 'lm')
    sc.text(736, 130, '보호자 모드 · 서준이', 15, 'B', GREEN_MUTED, 'rm')

    y0 = 180
    sc.card(40, y0, 700, 1000)
    sc.text(68, y0 + 34, '몸 전체 상태', 21, 'EB', INK)
    sc.toggle(660, y0 + 26, True)
    sc.text(648, y0 + 41, '4주 전 넓이 겹쳐보기', 15, 'B', '#3A3A3C', 'rm')
    k = 640 / 949
    bx = 390 - 327 * k / 2
    draw_bodymap(sc, bx, y0 + 80, 640, label_x=(bx - 4, bx + 327 * k + 4))

    # 날짜 슬라이더 — 앱 전신 결과의 DaySlider와 같은 방식
    sy = y0 + 760
    sc.text(390, sy, '오늘', 22, 'EB', INK, 'mm')
    sc.text(390, sy + 30, '2026.11.1', 15, 'R', SUB, 'mm')
    ty = sy + 74
    sc.rect(68, ty - 3, 644, 6, DISABLED, 3)
    sc.rect(68, ty - 3, 644, 6, GREEN, 3)
    for i in range(5):
        sc.circle(68 + 644 * i / 4, ty, 3, '#FFFFFF')
    sc.circle(68, ty, 8, '#FFFFFF', '#9EA3AB', 2)
    sc.circle(712, ty, 14, '#FFFFFF', GREEN, 3)
    sc.text(68, ty + 30, '4주 전', 14, 'R', SUB, 'lm')
    sc.text(712, ty + 30, '오늘', 14, 'R', SUB, 'rm')

    # 범례 (색 = 축, 모양 = 상태/넓이)
    ly = y0 + 900
    lx = 68
    for col, s in [(INFL, '염증 반응'), (SCRATCH, '긁은 흔적'), (CHRONIC, '만성 흔적'), (GOOD, '좋아졌어요')]:
        sc.circle(lx + 7, ly, 7, col)
        sc.text(lx + 22, ly, s, 15, 'B', '#3A3A3C', 'lm')
        lx += sc.tw(s, 15, 'B') + 52
    ly += 40
    sc.circle(75, ly, 7, INK)
    sc.text(90, ly, '가장 두드러진 축', 14, 'R', '#3A3A3C', 'lm')
    dashed_circle(sc, 270, ly, 10, INK, 1.8)
    sc.text(288, ly, '오늘 넓이', 14, 'R', '#3A3A3C', 'lm')
    dashed_circle(sc, 410, ly, 10, '#9EA3AB', 1.8)
    sc.text(428, ly, '4주 전 넓이', 14, 'R', '#3A3A3C', 'lm')

    # 부위 탭 → 바텀시트: 최근 사진 결과 + 최근 중증도
    y = 1210
    sc.card(40, y, 700, 650)
    sc.text(68, y + 32, '왼팔 오금', 22, 'EB', INK)
    sc.text(68 + sc.tw('왼팔 오금', 22, 'EB') + 12, y + 38, '기록 9회 · 넓이 15% → 9%', 15, 'R', SUB)
    sc.chip(68, y + 76, '최근 결과 · 11/01 오후 9:12', '#EFF5E4', GREEN_MUTED, 14, 'B', 30)
    pw, ph = 312, 220
    sc.paste(cover(ARM, pw, ph, 14), 68, y + 120)
    sc.paste(cover(arm_with_layers(('ery', 'exc', 'lich')), pw, ph, 14), 400, y + 120)
    sc.text(68 + pw / 2, y + 362, '촬영 이미지 (원본)', 14, 'B', SUB, 'mm')
    sc.text(400 + pw / 2, y + 362, '증상 부위 표시', 14, 'B', SUB, 'mm')
    sc.line([(68, y + 392), (712, y + 392)], LINE, 1.5)
    for i, (k2, label, col, n, lv, msg) in enumerate([
        ('infl', '염증 반응', INFL, 1, '약간', '많이 줄었어요'),
        ('scratch', '긁은 흔적', SCRATCH, 3, '심함', '최근 3일 늘었어요'),
        ('chronic', '만성 흔적', CHRONIC, 1, '약간', '8주째 조금씩 회복 중')]):
        ry = y + 424 + i * 52
        sc.axis_icon(86, ry + 10, k2, 16)
        sc.text(114, ry + 10, label, 17, 'B', INK, 'lm')
        level_bar(sc, 226, ry + 6, n, col, seg=26)
        sc.text(334, ry + 10, lv, 15, 'EB', col, 'lm')
        sc.text(712, ry + 10, msg, 16, 'R', '#3A3A3C', 'rm')
    sc.button(68, y + 580, 644, 52, '이 부위 기록 보기  →')

    # 부위 목록
    y = 1890
    sc.text(44, y, '부위별 목록', 18, 'B', SUB)
    sc.card(40, y + 36, 700, 230)
    for i, (name, col, s, d) in enumerate([
        ('얼굴(볼)', INFL, '염증 반응 늘었어요 · 넓이 5% → 12%', '11/01'),
        ('목', CHRONIC, '만성 흔적 10주째', '10/30'),
        ('오른 무릎', GOOD, '거의 나았어요 · 넓이 9% → 1%', '10/20')]):
        ry = y + 66 + i * 70
        if i:
            sc.line([(68, ry - 18), (712, ry - 18)], LINE, 1.5)
        sc.circle(78, ry + 14, 8, col)
        sc.text(100, ry + 14, name, 18, 'B', INK, 'lm')
        sc.text(210, ry + 14, s, 16, 'R', '#3A3A3C', 'lm')
        sc.text(670, ry + 14, d, 15, 'R', SUB, 'rm')
        sc.chevron(700, ry + 14)

    sc.note(40, 2196, '토글을 켜면 4주 전 넓이(회색 점선)가 겹쳐져 커졌는지/줄었는지 바로 보임\n'
                      '슬라이더로 날짜를 옮기면 그 시점의 색·넓이로 바뀜 (앱 전신 결과와 동일)')
    return sc.save('02_bodymap_records_hub.png')


# ════════════════════════════════════════════════════════════════════
# ③ 부위 기록 — 비교 슬라이더 + 3축 변화 + 부위 타임라인
# ════════════════════════════════════════════════════════════════════
def screen_part():
    sc = Screen(780, 1960)
    sc.header('③ 기록 탭 > 경과 관찰 > 부위 기록 — 비교 슬라이더 + 3축 타임라인')
    sc.nav('왼팔 오금', sub='기록 9회 · 9/8부터')

    sc.card(40, 196, 700, 620)
    sc.text(68, 232, '전후 비교', 21, 'EB', INK)
    sc.text(712, 236, '날짜 바꾸기', 15, 'B', GREEN_MUTED, 'ra')
    W, H = 652, 430
    before = cover(arm_before(), W, H)
    after = cover(ARM, W, H)
    split = 0.46
    comp = after.copy()
    comp.paste(before.crop((0, 0, int(W * S * split), int(H * S))), (0, 0))
    m = Image.new('L', comp.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, comp.width, comp.height], radius=18 * S, fill=255)
    comp.putalpha(m)
    sc.paste(comp, 64, 276)
    hx = 64 + W * split
    sc.line([(hx, 276), (hx, 276 + H)], '#FFFFFF', 4)
    sc.circle(hx, 276 + H / 2, 26, '#FFFFFF')
    sc.line([(hx - 6, 276 + H / 2 - 8), (hx - 13, 276 + H / 2), (hx - 6, 276 + H / 2 + 8)], INK, 3)
    sc.line([(hx + 6, 276 + H / 2 - 8), (hx + 13, 276 + H / 2), (hx + 6, 276 + H / 2 + 8)], INK, 3)
    sc.rect(80, 292, 84, 32, (28, 28, 30, 190), 16)
    sc.text(122, 308, '10/04', 15, 'B', '#FFFFFF', 'mm')
    sc.rect(616, 292, 84, 32, (28, 28, 30, 190), 16)
    sc.text(658, 308, '11/01', 15, 'B', '#FFFFFF', 'mm')
    sc.text(390, 740, '◀  좌우로 밀어서 비교하세요  ▶', 15, 'R', SUB, 'mm')
    sc.toggle(568, 768, False)
    sc.text(554, 783, '증상 레이어 겹쳐보기', 15, 'R', '#3A3A3C', 'rm')

    # 변화 요약
    y = 846
    sc.card(40, y, 700, 300)
    sc.text(68, y + 30, '4주 동안 이렇게 바뀌었어요', 21, 'EB', INK)
    rows = [('infl', '염증 반응', '↓', '많이 줄었어요', GOOD),
            ('scratch', '긁은 흔적', '→', '비슷해요', SUB),
            ('chronic', '만성 흔적', '↓', '조금 얇아졌어요', GOOD)]
    for i, (k, label, arrow, msg, col) in enumerate(rows):
        ry = y + 100 + i * 64
        sc.axis_icon(90, ry, k, 20)
        sc.text(126, ry, label, 18, 'B', INK, 'lm')
        sc.rect(400, ry - 18, 312, 36, '#EEF3FD' if col == GOOD else BOX, 18)
        sc.text(420, ry, arrow, 20, 'EB', col, 'lm')
        sc.text(448, ry, msg, 17, 'B', col if col == GOOD else '#3A3A3C', 'lm')

    # 부위 타임라인 (3축 스파크라인)
    y = 1176
    sc.card(40, y, 700, 470)
    sc.text(68, y + 30, '부위 타임라인', 21, 'EB', INK)
    sc.text(712, y + 34, '점을 탭하면 비교 날짜로', 14, 'R', SUB, 'ra')
    dates = ['9/8', '9/15', '9/22', '9/29', '10/4', '10/11', '10/18', '10/25', '11/1']
    series = [('infl', '염증 반응', INFL, [1, 2, 2, 3, 3, 2, 1, 1, 0]),
              ('scratch', '긁은 흔적', SCRATCH, [3, 3, 2, 2, 3, 2, 2, 3, 3]),
              ('chronic', '만성 흔적', CHRONIC, [2, 2, 2, 2, 2, 1, 1, 1, 1])]
    x0, x1 = 210, 700
    for i, (k, label, col, vals) in enumerate(series):
        ry = y + 90 + i * 110
        sc.axis_icon(88, ry + 32, k, 18)
        sc.text(114, ry + 32, label, 15, 'B', INK, 'lm')
        sc.rect(x0 - 10, ry, x1 - x0 + 20, 64, BOX, 12)
        pts = [(x0 + j * (x1 - x0) / (len(vals) - 1), ry + 54 - v * 15) for j, v in enumerate(vals)]
        sc.line(pts, col, 3)
        for j, (px, py) in enumerate(pts):
            sel = j in (4, 8)
            sc.circle(px, py, 7 if sel else 5, col if sel else '#FFFFFF', col, 2.5)
    for j, dd in enumerate(dates):
        if j % 2 == 0 or j == 8:
            sc.text(x0 + j * (x1 - x0) / 8, y + 430, dd, 13, 'R', SUB, 'mm')
    sc.line([(x0 + 4 * (x1 - x0) / 8, y + 84), (x0 + 4 * (x1 - x0) / 8, y + 414)], '#5B8DEF', 1.5, dash=5)
    sc.text(x0 + 4 * (x1 - x0) / 8, y + 72, '처방 변경', 12, 'B', '#5B8DEF', 'mm')

    # 특화 기능 바로가기
    y = 1676
    for i, (k, s, c, bg) in enumerate([('infl', '트리거 탐정', INFL, INFL_BG),
                                        ('scratch', '긁기 리포트', SCRATCH, SCRATCH_BG),
                                        ('chronic', '회복 트래커', CHRONIC, CHRONIC_BG)]):
        bx = 40 + i * 240
        sc.rect(bx, y, 220, 64, bg, 18)
        sc.axis_icon(bx + 36, y + 32, k, 18)
        sc.text(bx + 62, y + 32, s, 17, 'EB', c, 'lm')

    sc.note(40, 1780, '사진 비교 아래에 의학 용어 대신 사용자 언어로 변화 요약\n'
                      '타임라인 점 2개를 고르면 위 슬라이더의 비교 날짜가 바뀜')
    return sc.save('03_part_compare_timeline.png')


# ════════════════════════════════════════════════════════════════════
# ④ 염증 → 트리거 탐정
# ════════════════════════════════════════════════════════════════════
def screen_trigger():
    sc = Screen(780, 1960)
    sc.header('④ 염증 반응(홍반·구진) — 트리거 탐정')
    sc.nav('트리거 탐정')

    y = 196
    sc.card(40, y, 700, 170, fill=INFL_BG)
    sc.axis_icon(96, y + 58, 'infl', 30)
    sc.text(144, y + 40, '염증이 갑자기 늘었어요', 23, 'EB', '#C0392B')
    sc.text(144, y + 78, '얼굴(볼) · 10/29 대비 +38%', 16, 'R', '#3A3A3C')
    sc.text(68, y + 130, '최근 3일 기록에서 평소와 다른 점을 찾아봤어요', 16, 'R', '#3A3A3C')

    y = 396
    sc.card(40, y, 700, 610)
    sc.text(68, y + 30, '혹시 이런 변화가 있었나요?', 21, 'EB', INK)
    sc.text(68, y + 66, '10/29 ~ 11/01 일지', 14, 'R', SUB)
    items = [('날씨·습도', '습도 28% (평소 45%)', True, '10/30~31 건조'),
             ('새 제품', 'OO 바디워시 처음 사용', True, '10/30'),
             ('수면', '평균 5.2시간 (평소 7시간)', True, '3일'),
             ('땀', '체육 활동 기록 없음', False, ''),
             ('음식', '새로 먹은 음식 없음', False, '')]
    for i, (cat, s, flag, when) in enumerate(items):
        ry = y + 110 + i * 102
        if i:
            sc.line([(68, ry - 14), (712, ry - 14)], LINE, 1.5)
        sc.chip(68, ry, cat, '#FFF4E5' if flag else BOX, '#B8650F' if flag else SUB, 14, 'B', 28, pad=12)
        if when:
            sc.text(712, ry + 14, when, 14, 'R', SUB, 'rm')
        sc.text(68, ry + 52, s, 18, 'B' if flag else 'R', INK if flag else SUB, 'lm')
        if flag:
            sc.rect(520, ry + 36, 88, 34, GREEN, 17)
            sc.text(564, ry + 53, '맞아요', 15, 'B', GREEN_INK, 'mm')
            sc.rect(616, ry + 36, 96, 34, '#FFFFFF', 17, outline='#DADDE2', width=1.5)
            sc.text(664, ry + 53, '아니에요', 15, 'B', SUB, 'mm')

    # 개인 패턴
    y = 1066
    sc.card(40, y, 700, 500)
    sc.chip(68, y + 26, '6주 데이터로 찾은 내 패턴', '#EFF5E4', GREEN_MUTED, 14, 'B', 30)
    sc.text(68, y + 96, '습도가 낮은 날 다음에', 24, 'EB', INK, 'lm')
    sc.text(68, y + 132, '염증이 늘었어요', 24, 'EB', INK, 'lm')
    sc.text(68, y + 172, '건조한 날(습도 35% 미만) 5번 중 4번, 1~2일 뒤 염증이 올라갔어요', 15, 'R', SUB, 'lm')
    cx0, cy0, cw, ch = 88, y + 210, 610, 200
    hum = [52, 48, 30, 29, 44, 50, 33, 27, 46, 49, 51, 31, 28, 45]
    inf = [1.2, 1.1, 1.3, 2.4, 2.8, 1.6, 1.3, 2.2, 3.0, 1.8, 1.3, 1.4, 2.6, 2.9]
    bw = cw / len(hum)
    sc.rect(cx0, cy0 + ch * (1 - 35 / 60), cw, ch * 35 / 60, '#FBFBFC', 0)
    for i, hv in enumerate(hum):
        bh = ch * hv / 60
        sc.rect(cx0 + i * bw + 6, cy0 + ch - bh, bw - 12, bh, '#C7D7F7' if hv >= 35 else '#5B8DEF', 5)
    sc.line([(cx0, cy0 + ch * (1 - 35 / 60)), (cx0 + cw, cy0 + ch * (1 - 35 / 60))], SUB, 1.2, dash=4)
    pts = [(cx0 + i * bw + bw / 2, cy0 + ch - v / 3.2 * ch) for i, v in enumerate(inf)]
    sc.line(pts, INFL, 3)
    for p in pts:
        sc.circle(*p, 5, '#FFFFFF', INFL, 2.5)
    ly = cy0 + ch + 30
    sc.rect(cx0, ly - 7, 16, 14, '#5B8DEF', 3)
    sc.text(cx0 + 24, ly, '습도 (진한 막대 = 35% 미만)', 14, 'R', '#3A3A3C', 'lm')
    sc.circle(cx0 + 330, ly, 6, '#FFFFFF', INFL, 2.5)
    sc.text(cx0 + 344, ly, '염증 반응', 14, 'R', '#3A3A3C', 'lm')

    y = 1596
    sc.card(40, y, 700, 120, fill='#EFF5E4')
    sc.text(68, y + 34, '건조 예보가 있는 날엔 미리 알려드릴까요?', 18, 'EB', GREEN_MUTED)
    sc.text(68, y + 74, '전날 저녁 보습 알림 + 실내 가습 권장', 15, 'R', GREEN_MUTED)
    sc.toggle(660, y + 44, True)

    sc.note(40, 1750, '염증 축이 급증하면 자동으로 이 카드가 뜸 (홈 / 결과 화면)\n'
                      '"맞아요" 응답이 쌓일수록 개인 패턴 정확도가 올라감\n'
                      '상관관계일 뿐 원인 단정 X — 문구는 항상 "~했어요"로 관찰만 전달')
    return sc.save('04_inflammation_trigger_detective.png')


# ════════════════════════════════════════════════════════════════════
# ⑤ 긁은 흔적 → 긁기 패턴 리포트 + 감염 체크
# ════════════════════════════════════════════════════════════════════
def screen_scratch():
    sc = Screen(780, 1960)
    sc.header('⑤ 긁은 흔적(찰상) — 긁기 패턴 리포트 + 감염 체크')
    sc.nav('긁기 패턴 리포트')

    y = 196
    sc.card(40, y, 700, 500)
    sc.chip(68, y + 26, '최근 2주', SCRATCH_BG, '#B8650F', 14, 'B', 30)
    sc.text(68, y + 96, '밤에 긁는 패턴이 보여요', 24, 'EB', INK, 'lm')
    sc.text(68, y + 134, '잠을 6시간 못 잔 다음 날, 긁은 흔적이 평균 2배였어요', 16, 'R', SUB, 'lm')
    cx0, cy0, cw, ch = 88, y + 180, 610, 220
    exc = [1, 1, 2, 3, 2, 1, 1, 2, 3, 4, 3, 2, 3, 4]
    itch = [3, 4, 5, 7, 6, 4, 3, 5, 7, 8, 7, 5, 7, 8]
    sleep = [7.2, 7, 6.1, 5.2, 6, 7, 7.4, 6.2, 5.4, 4.8, 5.5, 6.4, 5.3, 4.9]
    bw = cw / 14
    for i in range(1, 4):
        sc.line([(cx0, cy0 + ch * i / 4), (cx0 + cw, cy0 + ch * i / 4)], LINE, 1)
    for i, v in enumerate(exc):
        bh = ch * v / 5
        sc.rect(cx0 + i * bw + 7, cy0 + ch - bh, bw - 14, bh, SCRATCH, 5)
    for vals, col, mx in [(itch, '#E2574C', 10), (sleep, '#1F3A93', 9)]:
        pts = [(cx0 + i * bw + bw / 2, cy0 + ch - v / mx * ch) for i, v in enumerate(vals)]
        sc.line(pts, col, 2.6)
        for p in pts:
            sc.circle(*p, 4.5, '#FFFFFF', col, 2.2)
    for i, d in enumerate(['10/19', '10/22', '10/25', '10/28', '11/1']):
        sc.text(cx0 + [0, 3, 6, 9, 13][i] * bw + bw / 2, cy0 + ch + 22, d, 13, 'R', SUB, 'mm')
    ly = cy0 + ch + 60
    lx = cx0
    for kind, col, s in [('bar', SCRATCH, '긁은 흔적'), ('dot', '#E2574C', '밤 가려움'), ('dot', '#1F3A93', '수면 시간')]:
        if kind == 'bar':
            sc.rect(lx, ly - 7, 16, 14, col, 3)
        else:
            sc.circle(lx + 8, ly, 6, '#FFFFFF', col, 2.5)
        sc.text(lx + 24, ly, s, 14, 'R', '#3A3A3C', 'lm')
        lx += sc.tw(s, 14) + 60

    # 감염 체크
    y = 726
    sc.card(40, y, 700, 560)
    sc.rect(40, y, 700, 560, None, 24, outline=SCRATCH, width=2)
    sc.text(68, y + 34, '긁은 흔적이 늘었어요', 22, 'EB', INK)
    sc.text(68, y + 70, '감염 신호가 있는지 한 번 확인해 주세요', 16, 'R', SUB)
    checks = [('진물이 나요', True), ('노란 딱지가 생겼어요', False),
              ('만지면 뜨겁거나 붓고 아파요', False), ('열이 나거나 처져 있어요', False)]
    for i, (s, on) in enumerate(checks):
        ry = y + 120 + i * 64
        sc.rect(68, ry, 644, 52, '#FFF4E5' if on else BOX, 14)
        sc.checkbox(86, ry + 14, on, SCRATCH)
        sc.text(124, ry + 26, s, 17, 'B' if on else 'R', INK, 'lm')
    ry = y + 392
    sc.rect(68, ry, 644, 76, '#FDECEC', 14)
    sc.text(88, ry + 24, '하나라도 해당되면 진료를 권해요', 17, 'EB', '#C0392B', 'lm')
    sc.text(88, ry + 52, '긁은 상처로 세균 감염이 생기면 연고만으로 낫기 어려워요', 14, 'R', '#3A3A3C', 'lm')
    sc.button(68, y + 486, 400, 52, '가까운 피부과 찾기', size=17)
    sc.rect(480, y + 486, 232, 52, '#FFFFFF', 16, outline='#DADDE2', width=1.5)
    sc.text(596, y + 512, '사진 첨부해 기록', 16, 'B', INK, 'mm')

    # 취침 전 루틴
    y = 1316
    sc.card(40, y, 700, 330)
    sc.text(68, y + 30, '취침 전 루틴 알림', 21, 'EB', INK)
    sc.chip(68 + sc.tw('취침 전 루틴 알림', 21, 'EB') + 12, y + 26, '선택', BOX, SUB, 13, 'B', 26, pad=10)
    for i, (s, sub, on) in enumerate([('보습제 바르기', '매일 21:30', True),
                                      ('손톱 짧게 정리하기', '수·일 21:00', True),
                                      ('면장갑 끼고 자기', '매일 22:00', False)]):
        ry = y + 86 + i * 78
        if i:
            sc.line([(68, ry - 14), (712, ry - 14)], LINE, 1.5)
        sc.text(68, ry + 10, s, 18, 'B', INK, 'lm')
        sc.text(68, ry + 40, sub, 14, 'R', SUB, 'lm')
        sc.toggle(660, ry + 10, on)

    sc.note(40, 1676, '찰상 점수 ↔ 가려움(VAS) ↔ 수면을 같은 축에 겹쳐 "밤 긁기" 인사이트\n'
                      '찰상이 늘면 감염 체크 카드를 자동 노출, 체크 시 진료 권유\n'
                      '루틴 알림은 기본 꺼짐 → 사용자가 고르면 켜짐')
    return sc.save('05_scratch_pattern_infection.png')


# ════════════════════════════════════════════════════════════════════
# ⑥ 만성 흔적 → 장기 회복 트래커
# ════════════════════════════════════════════════════════════════════
def screen_chronic():
    sc = Screen(780, 1960)
    sc.header('⑥ 만성 흔적(태선화) — 장기 회복 트래커 (월 단위)')
    sc.nav('회복 트래커', sub='목 · 만성 흔적')

    sc.rect(40, 210, 700, 56, DISABLED, 28)
    for i, s in enumerate(['3개월', '6개월', '1년']):
        cx = 40 + 700 / 6 * (2 * i + 1)
        if i == 1:
            sc.rect(40 + 700 / 3 * i + 4, 214, 700 / 3 - 8, 48, '#FFFFFF', 24)
        sc.text(cx, 238, s, 19, 'EB' if i == 1 else 'R', INK if i == 1 else SUB, 'mm')

    y = 296
    sc.card(40, y, 700, 560)
    sc.text(68, y + 30, '두꺼워진 정도 · 월 평균', 21, 'EB', INK)
    sc.text(712, y + 34, '일 단위 그래프는 숨김', 14, 'R', SUB, 'ra')
    cx0, cy0, cw, ch = 110, y + 110, 580, 330
    months = ['6월', '7월', '8월', '9월', '10월', '11월']
    vals = [3.4, 3.3, 3.0, 2.7, 2.4, 2.25]
    lo = [3.4, 3.15, 2.85, 2.5, 2.15, 1.9]
    hi = [3.4, 3.35, 3.2, 2.95, 2.7, 2.5]
    mx = 4
    for i in range(5):
        yy = cy0 + ch - ch * i / 4
        sc.line([(cx0, yy), (cx0 + cw, yy)], LINE, 1)
    for i, lab in enumerate(['얇음', '', '보통', '', '두꺼움']):
        sc.text(cx0 - 14, cy0 + ch - ch * i / 4, lab, 13, 'R', SUB, 'rm')
    bw = cw / 6
    band = [(cx0 + i * bw + bw / 2, cy0 + ch - v / mx * ch) for i, v in enumerate(hi)] + \
           [(cx0 + i * bw + bw / 2, cy0 + ch - v / mx * ch) for i, v in reversed(list(enumerate(lo)))]
    layer = Image.new('RGBA', sc.im.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).polygon([(px * S, py * S) for px, py in band], fill=rgb('#5FC36A', 60))
    sc.im.alpha_composite(layer)
    pts = [(cx0 + i * bw + bw / 2, cy0 + ch - v / mx * ch) for i, v in enumerate(vals)]
    sc.line(pts[:5], CHRONIC, 4)
    sc.line(pts[4:], CHRONIC, 3, dash=6)
    for i, (px, py) in enumerate(pts):
        sc.circle(px, py, 9 if i == 5 else 8, '#FFFFFF' if i == 5 else CHRONIC, CHRONIC, 3)
        sc.text(px, py - 26, f'{vals[i]:.1f}', 14, 'B', INK if i == 5 else SUB, 'mm')
        sc.text(px, cy0 + ch + 26, months[i], 15, 'B' if i == 5 else 'R', INK if i == 5 else SUB, 'mm')
    sc.text(pts[5][0], pts[5][1] + 30, '진행 중', 12, 'B', SUB, 'mm')
    ly = cy0 + ch + 64
    sc.rect(cx0, ly - 8, 24, 16, '#D4EED6', 4)
    sc.text(cx0 + 32, ly, '보통 회복 속도 범위', 14, 'R', '#3A3A3C', 'lm')
    sc.circle(cx0 + 238, ly, 7, CHRONIC)
    sc.text(cx0 + 254, ly, '내 기록 (월 평균)', 14, 'R', '#3A3A3C', 'lm')

    y = 886
    sc.card(40, y, 700, 160, fill='#EFF5E4')
    sc.axis_icon(96, y + 62, 'chronic', 28)
    sc.text(144, y + 46, '잘 회복되고 있어요', 22, 'EB', GREEN_MUTED)
    sc.para(144, y + 86, '두꺼워진 피부는 회복에 시간이 걸려요.\n지금 속도라면 정상 범위입니다. (5개월 전보다 34% 얇아짐)',
            16, 'R', GREEN_MUTED)

    y = 1076
    sc.card(40, y, 700, 120)
    sc.text(68, y + 40, '매일 보면 변화가 작아 보여요', 18, 'B', INK)
    sc.text(68, y + 78, '한 달에 한 번, 같은 각도로 찍어 비교하면 더 잘 보여요', 15, 'R', SUB)
    sc.chevron(704, y + 60)

    y = 1226
    sc.text(44, y, '진료 때 상의할 항목', 20, 'EB', INK)
    sc.chip(44 + sc.tw('진료 때 상의할 항목', 20, 'EB') + 12, y - 4, '자동 저장', '#EEF3FD', GOOD, 13, 'B', 28, pad=10)
    sc.card(40, y + 40, 700, 300)
    for i, (part, s, sub) in enumerate([('목', '만성 흔적 10주째 지속', '9/1부터 · 같은 부위 반복'),
                                        ('왼팔 오금', '만성 흔적 8주째 지속', '9/8부터 · 긁은 흔적과 함께')]):
        ry = y + 70 + i * 96
        if i:
            sc.line([(68, ry - 18), (712, ry - 18)], LINE, 1.5)
        sc.checkbox(68, ry + 4, True, CHRONIC)
        sc.text(106, ry + 16, part, 18, 'EB', INK, 'lm')
        sc.text(106 + sc.tw(part, 18, 'EB') + 12, ry + 16, s, 17, 'R', INK, 'lm')
        sc.text(106, ry + 48, sub, 14, 'R', SUB, 'lm')
    sc.button(68, y + 262, 644, 54, '진료 노트로 보내기 (PDF · 사진 포함)', size=17)

    sc.note(40, 1620, '태선화는 주·월 단위로 변하므로 일 단위 그래프 대신 월 평균만 노출\n'
                      '"보통 회복 속도 범위" 밴드로 기대치를 관리 → 매일 실망하지 않게\n'
                      '같은 부위 6주 이상 지속 시 진료 상의 항목으로 자동 저장')
    return sc.save('06_chronic_recovery_tracker.png')



# ════════════════════════════════════════════════════════════════════
# 07 기록 탭 — 전신 결과 카드를 없앤 버전 (경과 관찰이 바디맵을 품는다)
# ════════════════════════════════════════════════════════════════════
def screen_records_tab():
    sc = Screen(780, 1460)
    sc.header('기록 탭 — 전신 결과 카드 삭제 (경과 관찰 안에 바디맵 통합)')
    sc.text(44, 126, '기록', 32, 'EB', INK, 'lm')
    sc.text(44, 162, '그동안의 기록을 달력으로 확인하세요', 15, 'R', SUB, 'lm')

    # 달력 카드
    sc.card(40, 196, 700, 250)
    sc.text(68, 244, '2026.11.1 - 7', 22, 'EB', INK, 'lm')
    for i, x in enumerate((540, 606, 672)):
        sc.rect(x, 218, 52, 52, BOX, 14)
    sc.rect(547, 232, 38, 26, None, 6, outline=INK, width=2.2)
    sc.text(566, 247, '11', 12, 'B', INK, 'mm')
    sc.line([(630, 236), (621, 244), (630, 252)], INK, 2.6)
    sc.line([(688, 236), (697, 244), (688, 252)], INK, 2.6)
    for i, w in enumerate('일월화수목금토'):
        sc.text(98 + i * 91, 310, w, 15, 'B', INK, 'mm')
    for i in range(7):
        cx = 98 + i * 91
        if i == 0:
            sc.rect(cx - 40, 332, 80, 84, GREEN, 18)
            sc.text(cx, 356, '1', 20, 'EB', GREEN_INK, 'mm')
            sc.rect(cx - 22, 380, 44, 24, '#7FC144', 12)
            sc.text(cx, 392, '4건', 13, 'EB', GREEN_INK, 'mm')
        else:
            sc.text(cx, 356, str(i + 1), 20, 'R', INK, 'mm')

    # 메뉴 카드 (초록 테두리)
    def menu(y, title, sub, icon):
        sc.card(40, y, 700, 120)
        sc.rect(40, y, 700, 120, None, 24, outline=GREEN, width=2.5)
        sc.rect(68, y + 24, 72, 72, GREEN, 18)
        icon(104, y + 60)
        sc.text(164, y + 44, title, 21, 'EB', INK, 'lm')
        sc.text(164, y + 80, sub, 15, 'R', SUB, 'lm')

    def ic_itch(cx, cy):
        sc.d.polygon([((cx - 18) * S, (cy + 6) * S), ((cx - 6) * S, (cy + 18) * S), ((cx + 18) * S, (cy - 6) * S),
                      ((cx + 6) * S, (cy - 18) * S)], fill=rgb(GREEN_INK))

    def ic_trend(cx, cy):
        sc.line([(cx - 20, cy + 8), (cx - 8, cy - 2), (cx + 2, cy + 6), (cx + 18, cy - 10)], GREEN_INK, 3.5)
        for px, py in [(-20, 8), (-8, -2), (2, 6), (18, -10)]:
            sc.circle(cx + px, cy + py, 4, GREEN_INK)

    menu(476, '오늘의 가려움 기록하기', '한 번 적으면 그날 촬영한 기록에 모두 적용돼요', ic_itch)
    sc.text(700, 536, '+', 36, 'R', SUB, 'mm')
    menu(616, '경과 관찰', '4곳을 지켜보고 있어요 · 바디맵으로 한눈에', ic_trend)
    sc.chevron(706, 676)

    # 날짜별 기록
    sc.text(44, 784, '2026.11.1 기록 · 4건', 19, 'EB', INK, 'lm')
    sc.text(736, 784, '모두 접기', 15, 'B', '#3A3A3C', 'rm')
    sc.card(40, 816, 700, 330)
    sc.text(68, 860, '몸통 아토피피부염', 21, 'EB', INK, 'lm')
    sc.text(68 + sc.tw('몸통 아토피피부염', 21, 'EB') + 14, 862, '상세 결과', 15, 'R', SUB, 'lm')
    tx = 68 + sc.tw('몸통 아토피피부염', 21, 'EB') + 14 + sc.tw('상세 결과', 15, 'R') + 10
    sc.chevron(tx, 862, SUB)
    sc.line([(692, 868), (702, 858), (712, 868)], INK, 2.6)
    sc.paste(cover(Image.open(os.path.join(ASSETS, 'dump_photos', 'torso', '01.jpg')).convert('RGB'), 136, 136, 16), 68, 896)
    for i, (lab, v) in enumerate([('피부 종합 상태', 75), ('가려움 안정도', 70), ('수면 점수', 76)]):
        cx = 300 + i * 150
        if i:
            sc.line([(cx - 76, 910), (cx - 76, 1020)], LINE, 1.5)
        sc.text(cx, 920, lab, 13, 'R', '#3A3A3C', 'mm')
        sc.text(cx, 966, str(v), 27, 'EB', INK, 'mm')
        sc.rect(cx - 28, 992, 56, 28, '#FFD966', 14)
        sc.text(cx, 1006, '주의', 13, 'EB', '#FFFFFF', 'mm')
    sc.line([(68, 1060), (712, 1060)], LINE, 1.5)
    sc.text(68, 1102, '메모', 17, 'EB', INK, 'lm')
    sc.text(130, 1102, '이 기록에 대해 남길 말 (긁은 정도, 바른 약 등)', 15, 'R', SUB, 'lm')
    sc.line([(694, 1097), (702, 1106), (710, 1097)], INK, 2.6)

    # 하단 탭
    sc.rect(0, 1340, 780, 120, '#FFFFFF', 0)
    sc.line([(0, 1340), (780, 1340)], LINE, 1.5)
    for i, (nm, on) in enumerate([('홈', False), ('피부 촬영', False), ('기록', True), ('루틴', False), ('내 정보', False)]):
        cx = 78 + i * 156
        sc.rect(cx - 22, 1366, 44, 44, GREEN if on else '#DADDE2', 12)
        sc.text(cx, 1436, nm, 14, 'EB' if on else 'R', GREEN_MUTED if on else SUB, 'mm')

    sc.note(40, 1190, '전신 결과 카드를 삭제 — 같은 정보는 "경과 관찰"을 열면 바디맵으로 보여줌\n'
                      '(진입 경로 하나로 통합: 기록 탭 → 경과 관찰 → 부위 → 부위 기록)')
    return sc.save('07_records_tab_no_whole_body.png')


# ════════════════════════════════════════════════════════════════════
# 00 콘셉트 — 4증상 → 3축 → 행동/기능
# ════════════════════════════════════════════════════════════════════
def concept():
    sc = Screen(1560, 900, '#FFFFFF')
    sc.text(60, 64, '핵심 콘셉트 — 의학 용어 4개를 사용자 언어 3축으로 번역', 32, 'EB', INK, 'lm')
    sc.text(60, 108, '메인 화면은 "의미"로, 의학 용어는 레이어 칩·상세·진료 노트에만', 18, 'R', SUB, 'lm')

    cols = [('AI가 찾는 증상 (의학 용어)', 60), ('사용자에게 보이는 3축', 430),
            ('사용자에게 주는 메시지', 820), ('이어지는 행동 · 특화 기능', 1180)]
    for s, x in cols:
        sc.text(x, 170, s, 17, 'B', SUB, 'lm')

    groups = [
        ('infl', '염증 반응', INFL, INFL_BG, [('홍반', L_ERY, '붉어짐'), ('구진', L_PAP, '오돌토돌한 돌기')],
         '"지금 피부가 예민하게\n 반응하고 있어요"', '트리거 관리 · 보습', '④ 트리거 탐정'),
        ('scratch', '긁은 흔적', SCRATCH, SCRATCH_BG, [('찰상', L_EXC, '긁힌 상처')],
         '"긁어서 피부가\n 손상됐어요"', '긁기 습관 · 감염 주의', '⑤ 긁기 패턴 리포트'),
        ('chronic', '만성 흔적', CHRONIC, CHRONIC_BG, [('태선화', L_LICH, '두꺼워진 피부')],
         '"이 부위는 오래 반복돼서\n 두꺼워졌어요"', '장기 치료 · 진료', '⑥ 장기 회복 트래커'),
    ]
    y = 210
    for k, label, col, bg, syms, msg, act, feat in groups:
        h = 200 if len(syms) == 2 else 150
        # 증상 칩
        for j, (nm, c, desc) in enumerate(syms):
            sy = y + (h - len(syms) * 70 + 10) / 2 + j * 70
            sc.rect(60, sy, 300, 60, '#FFFFFF', 14, outline='#DADDE2', width=1.5)
            sc.circle(88, sy + 30, 9, c)
            sc.text(108, sy + 30, nm, 20, 'EB', INK, 'lm')
            sc.text(108 + sc.tw(nm, 20, 'EB') + 12, sy + 30, desc, 15, 'R', SUB, 'lm')
            sc.line([(360, sy + 30), (430, y + h / 2)], '#B6BAC1', 2)
        # 축
        sc.rect(430, y + h / 2 - 50, 330, 100, bg, 22)
        sc.axis_icon(484, y + h / 2, k, 30)
        sc.text(530, y + h / 2, label, 26, 'EB', col, 'lm')
        sc.line([(760, y + h / 2), (820, y + h / 2)], '#B6BAC1', 2)
        # 메시지
        sc.para(820, y + h / 2 - 26, msg, 19, 'B', INK, 1.45)
        sc.line([(1130, y + h / 2), (1180, y + h / 2)], '#B6BAC1', 2)
        # 행동
        sc.text(1180, y + h / 2 - 20, act, 18, 'R', '#3A3A3C', 'lm')
        sc.chip(1180, y + h / 2 + 4, feat, col, '#FFFFFF', 16, 'B', 34)
        y += h + 30

    sc.line([(60, 800), (1500, 800)], LINE, 1.5)
    sc.text(60, 846, '화면 흐름:', 18, 'EB', INK, 'lm')
    flow = ['② 경과 관찰 (바디맵 첫 화면)', '부위 탭', '③ 부위 기록 · 전후 비교', '사진 탭', '① 결과 · 증상 레이어',
            '축 버튼', '④⑤⑥ 특화 기능']
    x = 180
    for i, s in enumerate(flow):
        if i % 2 == 0:
            x += sc.chip(x, 828, s, '#EFF5E4', GREEN_MUTED, 16, 'B', 36) + 10
        else:
            sc.text(x, 846, '→ ' + s + ' →', 14, 'R', SUB, 'lm')
            x += sc.tw('→ ' + s + ' →', 14) + 10
    return sc.save('00_concept_4to3.png')


def montage(imgs, name):
    pad = 24
    h = max(i.height for i in imgs)
    w = sum(i.width for i in imgs) + pad * (len(imgs) + 1)
    out = Image.new('RGB', (w, h + pad * 2), '#FFFFFF')
    x = pad
    for im in imgs:
        out.paste(im, (x, pad))
        x += im.width + pad
    out.save(os.path.join(HERE, name))


if __name__ == '__main__':
    concept()
    shots = [screen_result(), screen_bodymap(), screen_part(), screen_trigger(), screen_scratch(), screen_chronic()]
    screen_records_tab()
    montage(shots[:3], '10_overview_core_screens.png')
    montage(shots[3:], '11_overview_symptom_features.png')
    print('done')

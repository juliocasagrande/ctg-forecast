"""
gantt.py — Geração do PDF de Cronograma de Manutenções CTG Brasil
Lê dados da view dbo.vPLAN_MANUTENCAO_UGS no SQL Server.
Configuração via variáveis de ambiente para uso seguro no Gitea Actions.
"""

import os
import datetime
import pandas as pd
import pyodbc
import warnings
from collections import defaultdict
from reportlab.lib.pagesizes import A3, portrait
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import simpleSplit

warnings.filterwarnings("ignore")

# ─── CONFIGURAÇÃO VIA ENV ─────────────────────────────────────────────────────
OUTPUT_PATH = os.environ.get("OUTPUT_PATH", "output/cronograma_manutencoes.pdf")
YEAR        = int(os.environ.get("GANTT_YEAR", datetime.date.today().year))

DB_SERVER   = os.environ.get("DB_SERVER",   "10.108.1.36")
DB_DATABASE = os.environ.get("DB_DATABASE", "Engenharia")
DB_USER     = os.environ.get("DB_USER",     "eng")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "ctg@2023")
DB_VIEW     = os.environ.get("DB_VIEW",     "dbo.vPLAN_MANUTENCAO_UGS")

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

# ─── PÁGINA: A3 RETRATO ───────────────────────────────────────────────────────
PAGE_W, PAGE_H = portrait(A3)   # 841.89 x 1190.55 pts

# ─── MARGENS ─────────────────────────────────────────────────────────────────
M        = 4 * mm
CORNER_R = 2.5 * mm

# ─── CABEÇALHO ───────────────────────────────────────────────────────────────
HEADER_H = 20 * mm

# ─── FOOTER ──────────────────────────────────────────────────────────────────
FOOTER_H = 10 * mm

# ─── COLUNAS FIXAS (UHE | UG) ────────────────────────────────────────────────
UHE_COL_W = 7 * mm
UG_COL_W  = 9 * mm
LEFT_W    = UHE_COL_W + UG_COL_W

# ─── COLUNA DE FIM DE ANO ────────────────────────────────────────────────────
END_COL_W = 14 * mm

# ─── ÁREA DO GANTT ────────────────────────────────────────────────────────────
CONTENT_W = PAGE_W - 2 * M
CHART_X   = M + LEFT_W
CHART_W   = CONTENT_W - LEFT_W - END_COL_W

# ─── SUB-CABEÇALHO DE MESES ──────────────────────────────────────────────────
SUBHDR_H  = 6 * mm

# ─── BARRAS E LABELS ─────────────────────────────────────────────────────────
BAR_H     = 2.4 * mm          # altura da barra colorida
LBL_FONT  = 6.8               # fonte dos labels de manutenção
DOT_R     = 1.2 * mm          # raio do marcador circular
END_FONT  = 5.0               # fonte da coluna de parada de dezembro

# ─── FONTES ──────────────────────────────────────────────────────────────────
FB = "Helvetica-Bold"
FR = "Helvetica"

# ─── CORES ───────────────────────────────────────────────────────────────────
HDR_BG      = "#1b3a6b"
HDR_TITLE   = "#ffffff"
HDR_ACCENT  = "#4db8ff"
HDR_MUTED   = "#a0b8d8"
WHITE       = "#ffffff"
BODY_BG     = "#f5f7fb"
BORDER_CLR  = "#d0d8e8"
GRID_LINE   = "#e4e8f0"
TXT_DARK    = "#1b3a6b"
TXT_MUTED   = "#8898b0"
ROW_ODD     = "#ffffff"
ROW_EVEN    = "#eef2f8"
UHE_SIDE_BG = "#1b3a6b"
UHE_TXT     = "#ffffff"
UG_TXT      = "#2a4a7a"

# ─── CORES DE FUNDO POR UHE (sutis, para distinguir blocos) ──────────────────
# Cada UHE recebe uma tonalidade ligeiramente diferente nas linhas de UG.
# Formato: (cor_ímpar, cor_par)
UHE_ROW_COLORS = {
    # Página 1
    "ILS": ("#f0f4ff", "#e6ecfa"),   # azul muito claro
    "JUP": ("#f0fff4", "#e6faed"),   # verde muito claro
    "STO": ("#fffaf0", "#faf3e6"),   # amarelo muito claro
    # Página 2
    "CN1": ("#f5f0ff", "#ede6fa"),   # lilás muito claro
    "CN2": ("#fff0f5", "#fae6ed"),   # rosa muito claro
    "CHV": ("#f0faff", "#e6f5fa"),   # ciano muito claro
    "SAG": ("#fff5f0", "#faeee6"),   # laranja muito claro
    "JUR": ("#f0fff0", "#e6fae6"),   # verde menta muito claro
    "PLM": ("#fffff0", "#fafae6"),   # amarelo esverdeado
    "RET": ("#fff0ff", "#fae6fa"),   # roxo muito claro
    "CPV": ("#f0f8ff", "#e6f2fa"),   # azul céu muito claro
    "ROS": ("#fff8f0", "#faf2e6"),   # pêssego muito claro
    "TAQ": ("#f0fff8", "#e6faf2"),   # verde água muito claro
    "GAR": ("#fdf0ff", "#f5e6fa"),   # lavanda muito claro
}
UHE_ROW_DEFAULT = ("#f8f8f8", "#f0f0f0")

# ─── CORES DA COLUNA UHE (fundo + texto) ─────────────────────────────────────
# Versão mais saturada/escura da cor de cada UHE, para a coluna lateral esquerda.
# Formato: (bg_hex, txt_hex)
UHE_COL_COLORS = {
    "ILS":  ("#2a4f9e", "#e8f0ff"),   # azul médio   / texto azul muito claro
    "JUP":  ("#2e7d4f", "#e8fff2"),   # verde médio  / texto verde muito claro
    "STO":  ("#8a6a00", "#fff8e0"),   # dourado      / texto amarelo muito claro
    "CN1":  ("#5e3a9e", "#f0e8ff"),   # lilás médio  / texto lilás muito claro
    "CN2":  ("#9e2a5e", "#ffe8f2"),   # rosa médio   / texto rosa muito claro
    "CHV":  ("#1a7a8a", "#e0f8ff"),   # ciano médio  / texto ciano muito claro
    "SAG":  ("#8a4a1a", "#fff0e0"),   # laranja médio/ texto laranja muito claro
    "JUR":  ("#2a7a2a", "#e8ffe8"),   # verde médio  / texto verde muito claro
    "PLM":  ("#6a7a00", "#f8ffe0"),   # verde-amarelo/ texto amarelo muito claro
    "RET":  ("#7a2a8a", "#f8e0ff"),   # roxo médio   / texto roxo muito claro
    "CPV":  ("#1a5a8a", "#e0f0ff"),   # azul céu méd / texto azul muito claro
    "ROS":  ("#8a5a1a", "#fff2e0"),   # pêssego esc  / texto pêssego muito claro
    "TAQ":  ("#1a7a5a", "#e0fff2"),   # verde água   / texto verde muito claro
    "GAR":  ("#6a1a8a", "#f5e0ff"),   # lavanda esc  / texto lavanda muito claro
}
UHE_COL_DEFAULT = ("#2a4a6a", "#e8f0f8")

MONTHS_PT = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"]

# ─── ESTRUTURA DAS PÁGINAS ───────────────────────────────────────────────────
PAGE1_STRUCTURE = [
    ("ILS", [("ILS", [f"UG{i:02d}" for i in range(1, 21)])]),
    ("JUP", [
        ("JUP", [f"UG{i:02d}" for i in range(1, 15)] + ["UGA01", "UGA02"]),
        ("STO", ["UG01", "UG02"]),
    ]),
]

PAGE2_STRUCTURE = [
    ("CHV", [
        ("CN1", ["UG01", "UG02", "UG03"]),
        ("CN2", ["UG01", "UG02", "UG03"]),
        ("CHV", ["UG01", "UG02", "UG03", "UG04"]),
        ("SAG", ["UG01", "UG02", "UG03", "UG04"]),
        ("JUR", ["UG01", "UG02"]),
        ("PLM", ["UG01"]),
        ("RET", ["UG01"]),
    ]),
    ("CPV", [
        ("CPV", ["UG01", "UG02", "UG03", "UG04"]),
        ("ROS", ["UG01", "UG02", "UG03", "UG04"]),
        ("TAQ", ["UG01", "UG02", "UG03", "UG04", "UG05"]),
        ("GAR", ["UG01", "UG02", "UG03", "UG04/PCH"]),
    ]),
]

# ─── MAPEAMENTO DE TIPO ───────────────────────────────────────────────────────
TIPO_MAP = {
    "Corretiva":            "CORR",
    "Preditiva":            "PRED",
    "Corretiva Programada": "C. PROG",
    "Boletim de Servico":   "BS",
    "Consumo / Seguranca":  "CSEG",
    "Modernizacao":         "MOD",
    "MPAIE":                "MPAIE",
    "MPP0":                 "MPP0",
    "MPP1":                 "MPP1",
    "MPP2":                 "MPP2",
}

TIPO_LABEL = {
    "CORR":    "Corretiva",
    "PRED":    "Preditiva",
    "C. PROG": "Corretiva Programada",
    "BS":      "Boletim de Servico",
    "CSEG":    "Consumo / Seguranca",
    "MOD":     "Modernizacao",
    "MPAIE":   "MPAIE",
    "MPP0":    "MPP0",
    "MPP1":    "MPP1",
    "MPP2":    "MPP2",
}

TIPO_COLOR = {
    "CORR":    "#C0392B",
    "C. PROG": "#E67E22",
    "CSEG":    "#996600",
    "BS":      "#607080",
    "PRED":    "#607080",
    "MOD":     "#1a6af0",
    "MPAIE":   "#607080",
    "MPP0":    "#c8d400",
    "MPP1":    "#1a9af0",
    "MPP2":    "#8b0000",
}

# ─── UTILS ───────────────────────────────────────────────────────────────────
def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4))

def hcol(h):
    return colors.Color(*hex2rgb(h))

def rcol(h, alpha=1.0):
    r, g, b = hex2rgb(h)
    return colors.Color(r, g, b, alpha=alpha)

def fill(cv, x, y, w, h, c, alpha=1.0):
    cv.setFillColor(rcol(c, alpha))
    cv.rect(x, y, w, h, fill=1, stroke=0)

def hline(cv, x1, x2, y, c, lw=0.3):
    cv.saveState()
    cv.setStrokeColor(hcol(c))
    cv.setLineWidth(lw)
    cv.line(x1, y, x2, y)
    cv.restoreState()

def vline(cv, x, y1, y2, c, lw=0.3):
    cv.saveState()
    cv.setStrokeColor(hcol(c))
    cv.setLineWidth(lw)
    cv.line(x, y1, x, y2)
    cv.restoreState()

def fmt_date(d):
    months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"]
    return f"{d.day:02d}-{months[d.month-1]}"

def date_x(d, chart_x=None, chart_w=None):
    cx = chart_x if chart_x is not None else CHART_X
    cw = chart_w if chart_w is not None else CHART_W
    ys    = datetime.date(YEAR, 1, 1)
    total = (datetime.date(YEAR, 12, 31) - ys).days + 1
    frac  = max(0.0, min(1.0, (d - ys).days / total))
    return cx + frac * cw

def tipo_color(tipo):
    return TIPO_COLOR.get(tipo, "#607080")

# ─── LEITURA DO BANCO ────────────────────────────────────────────────────────
def load_tasks() -> list[dict]:
    import sys, os
    sys.path.insert(0, os.path.dirname(__file__))
    from db_utils import conectar

    print(f"  Conectando em {DB_SERVER}/{DB_DATABASE} -> {DB_VIEW} ...")
    try:
        conn = conectar(DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD, timeout=30)
        query = f"""
            SELECT POLO, UHE, UG, DESCRICAO, TIPO, STATUS, INICIO, TERMINO
            FROM {DB_VIEW}
            WHERE ANO = {YEAR}
              AND INICIO IS NOT NULL
              AND STATUS <> 'Cancelado'
        """
        df = pd.read_sql(query, conn)
    except Exception as e:
        raise RuntimeError(f"Falha ao consultar o banco: {e}") from e
    finally:
        try: conn.close()
        except: pass

    print(f"  {len(df)} registros retornados.")

    df["UG"]      = df["UG"].str.strip().str.replace(r"[-\s]", "", regex=True)
    df["INICIO"]  = pd.to_datetime(df["INICIO"],  errors="coerce").dt.date
    df["TERMINO"] = pd.to_datetime(df["TERMINO"], errors="coerce").dt.date
    df = df.dropna(subset=["INICIO"])
    df["TERMINO"] = df.apply(lambda r: r["INICIO"] if pd.isna(r["TERMINO"]) else r["TERMINO"], axis=1)

    year_start = datetime.date(YEAR, 1, 1)
    year_end   = datetime.date(YEAR, 12, 31)
    df = df[(df["INICIO"] <= year_end) & (df["TERMINO"] >= year_start)]

    df["TIPO_KEY"] = df["TIPO"].str.strip().map(TIPO_MAP).fillna("CORR")

    return [
        {
            "polo":    str(row["POLO"]).strip(),
            "uhe":     str(row["UHE"]).strip(),
            "ug":      str(row["UG"]).strip(),
            "desc":    str(row["DESCRICAO"]).strip() if pd.notna(row["DESCRICAO"]) else "",
            "tipo":    row["TIPO_KEY"],
            "inicio":  row["INICIO"],
            "termino": row["TERMINO"],
        }
        for _, row in df.iterrows()
    ]

# ─── DRAW: CABEÇALHO ─────────────────────────────────────────────────────────
def draw_header(cv, subtitle, update_date=None):
    hx = M
    hy = PAGE_H - M - HEADER_H
    hw = CONTENT_W

    # fundo
    cv.saveState()
    cv.setFillColor(hcol(HDR_BG))
    cv.roundRect(hx, hy, hw, HEADER_H, CORNER_R, fill=1, stroke=0)
    cv.restoreState()

    # Linha 1: "CTG Brasil" em azul claro + " — Manutenções Programadas 2026" em branco
    title_y = hy + HEADER_H - 8 * mm
    cv.setFont(FB, 11)
    cv.setFillColor(hcol(HDR_ACCENT))
    cv.drawString(hx + 4*mm, title_y, "CTG Brasil")

    ctg_w = cv.stringWidth("CTG Brasil", FB, 11)
    cv.setFont(FB, 11)
    cv.setFillColor(hcol(HDR_TITLE))
    title_str = f"\u2014  Manutencoes Programadas {YEAR}"
    cv.drawString(hx + 4*mm + ctg_w + 1.5*mm, title_y, title_str)

    # "Atualização: DD/MM/YYYY" à direita, mesma linha
    upd = update_date or datetime.date.today()
    upd_str = f"Atualizacao: {upd:%d/%m/%Y}"
    cv.setFont(FR, 7)
    cv.setFillColor(hcol(HDR_MUTED))
    upd_w = cv.stringWidth(upd_str, FR, 7)
    cv.drawString(hx + hw - 4*mm - upd_w, title_y, upd_str)

    # Linha 2: subtítulo (UHEs) logo abaixo
    subtitle_y = hy + HEADER_H - 14 * mm
    cv.setFont(FR, 7.5)
    cv.setFillColor(hcol(HDR_MUTED))
    cv.drawString(hx + 4*mm, subtitle_y, subtitle)

# ─── DRAW: SUB-CABEÇALHO DE MESES ────────────────────────────────────────────
def draw_month_subheader(cv, y, row_h):
    bot = y - SUBHDR_H

    fill(cv, M + LEFT_W, bot, CHART_W, SUBHDR_H, BODY_BG)
    fill(cv, M + LEFT_W + CHART_W, bot, END_COL_W, SUBHDR_H, BODY_BG)

    # cabeçalho UHE
    fill(cv, M, bot, UHE_COL_W, SUBHDR_H, HDR_BG)
    cv.setFillColor(hcol(UHE_TXT)); cv.setFont(FB, 5.5)
    cv.drawCentredString(M + UHE_COL_W/2, bot + SUBHDR_H*0.28, "UHE")

    # cabeçalho UG
    fill(cv, M + UHE_COL_W, bot, UG_COL_W, SUBHDR_H, BODY_BG)
    cv.setFillColor(hcol(TXT_DARK)); cv.setFont(FB, 5.5)
    cv.drawCentredString(M + UHE_COL_W + UG_COL_W/2, bot + SUBHDR_H*0.28, "UG")

    # cabeçalho DEZ (coluna end)
    fill(cv, M + LEFT_W + CHART_W, bot, END_COL_W, SUBHDR_H, BODY_BG)
    cv.setFillColor(hcol(TXT_DARK)); cv.setFont(FB, 6)
    cv.drawCentredString(M + LEFT_W + CHART_W + END_COL_W/2, bot + SUBHDR_H*0.28, "DEZ")

    # meses
    ys    = datetime.date(YEAR, 1, 1)
    total = (datetime.date(YEAR, 12, 31) - ys).days + 1
    for mo in range(1, 13):
        md  = datetime.date(YEAR, mo, 1)
        x   = CHART_X + ((md - ys).days / total) * CHART_W
        mid = x + (CHART_W / 24)
        vline(cv, x, bot, y, BORDER_CLR, 0.4)
        cv.setFillColor(hcol(TXT_DARK)); cv.setFont(FB, 6)
        cv.drawCentredString(mid, bot + SUBHDR_H * 0.28, MONTHS_PT[mo - 1])

    hline(cv, M, M + CONTENT_W, y,   BORDER_CLR, 0.5)
    hline(cv, M, M + CONTENT_W, bot, BORDER_CLR, 0.5)

# ─── DRAW: GRADE MENSAL ──────────────────────────────────────────────────────
def draw_month_grid(cv, row_bot, row_h):
    ys    = datetime.date(YEAR, 1, 1)
    total = (datetime.date(YEAR, 12, 31) - ys).days + 1
    today = datetime.date.today()
    if datetime.date(YEAR, 1, 1) <= today <= datetime.date(YEAR, 12, 31):
        tx = CHART_X + ((today - ys).days / total) * CHART_W
        cv.saveState()
        cv.setStrokeColor(rcol("#e05050", 0.35))
        cv.setLineWidth(0.4)
        cv.setDash([1.5, 2], 0)
        cv.line(tx, row_bot, tx, row_bot + row_h)
        cv.restoreState()
    for mo in range(1, 13):
        md = datetime.date(YEAR, mo, 1)
        x  = CHART_X + ((md - ys).days / total) * CHART_W
        vline(cv, x, row_bot, row_bot + row_h, GRID_LINE, 0.25)

# ─── POSICIONAMENTO DE BARRAS (anti-sobreposição melhorado) ──────────────────
def compute_bar_levels(tasks):
    """
    Retorna lista de (task, x1, x2, level).
    Usa tolerância maior para evitar sobreposição de labels.
    """
    placed = []
    for t in tasks:
        ini = max(t["inicio"],  datetime.date(YEAR, 1, 1))
        ter = min(t["termino"], datetime.date(YEAR, 12, 31))
        x1  = date_x(ini)
        x2  = date_x(ter)
        if x2 <= x1:
            x2 = x1 + 2.0 * mm

        # Estima largura do label para calcular sobreposição real
        desc      = t.get("desc") or ""
        ini_s     = fmt_date(t["inicio"])
        ter_s     = fmt_date(t["termino"])
        date_part = f"({ini_s})" if t["inicio"] == t["termino"] else f"({ini_s} a {ter_s})"
        full_lbl  = f"{desc} {date_part}".strip() if desc else date_part
        lbl_w     = len(full_lbl) * LBL_FONT * 0.353 * mm * 0.62  # estimativa conservadora

        # x2_lbl: até onde vai o label visualmente
        x2_lbl = max(x2, x1 + lbl_w)

        lv = 0
        while True:
            conflict = False
            for _, px1, px2_lbl, pl in placed:
                if pl == lv and x1 < px2_lbl + 1.5*mm and px1 < x2_lbl + 1.5*mm:
                    conflict = True
                    break
            if not conflict:
                break
            lv += 1

        placed.append((t, x1, x2_lbl, lv))

    # Retorna com x2 original (não x2_lbl) para desenho da barra
    result = []
    for i, (t, x1, x2_lbl, lv) in enumerate(placed):
        ini = max(t["inicio"], datetime.date(YEAR, 1, 1))
        ter = min(t["termino"], datetime.date(YEAR, 12, 31))
        rx2 = date_x(ter)
        if rx2 <= date_x(ini):
            rx2 = date_x(ini) + 2.0 * mm
        result.append((t, date_x(ini), rx2, lv))
    return result

# ─── SEPARAÇÃO: tarefas do Gantt vs coluna END ───────────────────────────────
DEC_CUTOFF_DAY = 20   # tarefas que INICIAM a partir de 20-dez vão para coluna end

def split_tasks(tasks):
    """
    Separa as tarefas em dois grupos:
    - gantt_tasks : aparecem na área do Gantt (início antes de 20-dez)
    - end_tasks   : aparecem apenas na coluna END (início a partir de 20-dez)
    """
    dec_cutoff = datetime.date(YEAR, 12, DEC_CUTOFF_DAY)
    gantt_tasks = [t for t in tasks if t["inicio"] < dec_cutoff]
    end_tasks   = [t for t in tasks if t["inicio"] >= dec_cutoff]
    return gantt_tasks, end_tasks


# ─── DRAW: BARRAS + LABELS DE UMA LINHA DE UG ───────────────────────────────
def draw_ug_row(cv, row_bot, row_h, tasks, tipos_usados):
    """Desenha as barras de manutenção na área do Gantt (exclui tarefas de fim de ano)."""
    gantt_tasks, _ = split_tasks(tasks)
    if not gantt_tasks:
        return

    placed = compute_bar_levels(gantt_tasks)

    bar_y      = row_bot + 1.8 * mm
    line_h     = LBL_FONT * 0.353 * mm
    lbl_gap    = 0.8 * mm
    level_step = line_h + 1.2 * mm

    for t, x1, x2, level in placed:
        bw   = max(x2 - x1, 2.0*mm)
        tipo = t.get("tipo") or "CORR"
        tipos_usados.add(tipo)
        c    = tipo_color(tipo)

        # ── Barra ────────────────────────────────────────────────────────────
        cv.saveState()
        cv.setFillColor(rcol(c, 0.90))
        cv.roundRect(x1, bar_y, bw, BAR_H, BAR_H/2, fill=1, stroke=0)
        cv.restoreState()

        # ── Marcador circular no fim da barra ────────────────────────────────
        cv.saveState()
        cv.setFillColor(rcol(c, 0.85))
        cv.circle(x2, bar_y + BAR_H/2, DOT_R, fill=1, stroke=0)
        cv.restoreState()

        # ── Label acima da barra ──────────────────────────────────────────────
        ini_s = fmt_date(t["inicio"])
        ter_s = fmt_date(t["termino"])
        date_part = f"({ini_s})" if t["inicio"] == t["termino"] else f"({ini_s} a {ter_s})"
        desc      = t.get("desc") or ""
        full_lbl  = f"{desc} {date_part}".strip() if desc else date_part

        _col_w    = CHART_W / 12
        max_lbl_w = min(_col_w * 2.2, CHART_X + CHART_W - x1 - 0.5*mm)
        max_lbl_w = max(max_lbl_w, 20*mm)

        lines = simpleSplit(full_lbl, FR, LBL_FONT, max_lbl_w)[:2]

        lbl_bot = bar_y + BAR_H + lbl_gap + level * level_step

        cv.saveState()
        cv.setFillColor(hcol(TXT_DARK))
        cv.setFont(FR, LBL_FONT)
        for i, line in enumerate(lines):
            ly = lbl_bot + i * line_h
            if ly > row_bot + row_h - 0.3*mm:
                break
            cv.drawString(x1 + 0.3*mm, ly, line)
        cv.restoreState()


# ─── DRAW: COLUNA DE FIM DE ANO ──────────────────────────────────────────────
def draw_end_col_row(cv, row_bot, row_h, tasks):
    """
    Coluna direita DEZ: exibe apenas tarefas que iniciam a partir de 20-dez.
    Formato do label: (DD-dez a DD-dez) — compacto para caber na coluna.
    Máximo de 2 tarefas por célula; se houver mais, empilha verticalmente
    sem sair dos limites da linha.
    """
    _, end_tasks = split_tasks(tasks)
    if not end_tasks:
        return

    ex = M + LEFT_W + CHART_W
    ew = END_COL_W
    bx = ex + 1.0 * mm
    bw = ew - 2.0 * mm

    n      = min(len(end_tasks), 2)
    slot_h = row_h / n           # divide a altura igualmente entre as tarefas

    for i, t in enumerate(end_tasks[:2]):
        tipo = t.get("tipo") or "CORR"
        c    = tipo_color(tipo)
        # tipo já contabilizado no draw_ug_row — aqui apenas desenhamos

        # Centro vertical do slot
        slot_top = row_bot + row_h - i * slot_h
        slot_bot = slot_top - slot_h
        cy       = (slot_top + slot_bot) / 2

        # Barra
        by = cy - BAR_H / 2
        cv.saveState()
        cv.setFillColor(rcol(c, 0.88))
        cv.roundRect(bx, by, bw, BAR_H, BAR_H / 2, fill=1, stroke=0)
        cv.restoreState()

        # Marcador no fim
        cv.saveState()
        cv.setFillColor(rcol(c, 0.85))
        cv.circle(bx + bw, by + BAR_H / 2, DOT_R * 0.75, fill=1, stroke=0)
        cv.restoreState()

        # Label compacto: usa apenas os dias (sem o nome do mês quando cabe)
        ini_d  = t["inicio"].day
        ter_d  = min(t["termino"], datetime.date(YEAR, 12, 31)).day
        ter_mo = min(t["termino"], datetime.date(YEAR, 12, 31)).month
        mo_str = ["jan","fev","mar","abr","mai","jun",
                  "jul","ago","set","out","nov","dez"][ter_mo - 1]

        if ini_d == ter_d and ter_mo == 12:
            lbl = f"({ini_d:02d}-dez)"
        elif ter_mo == 12:
            lbl = f"({ini_d:02d} a {ter_d:02d}-dez)"
        else:
            lbl = f"({ini_d:02d}-dez a {ter_d:02d}-{mo_str})"

        # Tenta encaixar o label acima da barra dentro do slot
        lbl_y = by + BAR_H + 0.4 * mm
        if lbl_y + END_FONT * 0.353 * mm < slot_top - 0.2 * mm:
            cv.saveState()
            cv.setFillColor(hcol(TXT_DARK))
            cv.setFont(FR, END_FONT)
            # Trunca se não cabe
            while cv.stringWidth(lbl, FR, END_FONT) > bw + 1*mm and len(lbl) > 6:
                lbl = lbl[:-2] + ")"
            cv.drawString(bx + 0.2 * mm, lbl_y, lbl)
            cv.restoreState()

# ─── DRAW: FOOTER ────────────────────────────────────────────────────────────
def draw_footer(cv, tipos_usados):
    fy  = 0
    fh  = FOOTER_H
    fill(cv, 0, fy, PAGE_W, fh, BODY_BG)
    hline(cv, M, PAGE_W - M, fy + fh, BORDER_CLR, 0.5)

    cv.setFont(FR, 6)
    cv.setFillColor(hcol(TXT_MUTED))
    cv.drawString(M, fy + 2.2*mm,
                  f"CTG Brasil \u00b7 Engenharia Eletromecânica \u00b7 Cronograma de Manutencoes {YEAR}")

    if not tipos_usados:
        return

    legend_x = M
    legend_y  = fy + fh - 5.5*mm

    cv.setFont(FB, 6)
    cv.setFillColor(hcol(TXT_DARK))
    cv.drawString(legend_x, legend_y, "Legenda de cores:")
    legend_x += cv.stringWidth("Legenda de cores:", FB, 6) + 3*mm

    box_sz = 2.2*mm
    gap    = 2.5*mm

    order = ["CSEG", "MPAIE", "MPP0", "MPP1", "MPP2", "MOD", "PRED", "CORR", "C. PROG", "BS"]
    items = [(tp, TIPO_LABEL.get(tp, tp)) for tp in order if tp in tipos_usados]
    for tp in sorted(tipos_usados):
        if tp not in order:
            items.append((tp, TIPO_LABEL.get(tp, tp)))

    cv.setFont(FR, 6)
    for tp, label in items:
        c = tipo_color(tp)
        cv.saveState()
        cv.setFillColor(rcol(c, 0.90))
        cv.roundRect(legend_x, legend_y, box_sz, box_sz, 0.6*mm, fill=1, stroke=0)
        cv.restoreState()
        cv.setFillColor(hcol(TXT_DARK))
        cv.drawString(legend_x + box_sz + 1*mm, legend_y + 0.1*mm, label)
        legend_x += box_sz + 1*mm + cv.stringWidth(label, FR, 6) + gap
        if legend_x > PAGE_W - M - 30*mm:
            legend_x  = M
            legend_y -= 4*mm

# ─── RENDER: PÁGINA COMPLETA ─────────────────────────────────────────────────
def render_page(cv, structure, task_idx, subtitle, page_num=1, total_pages=2):
    total_ug = sum(len(ugs) for _, uhes in structure for _, ugs in uhes)

    avail_h  = (PAGE_H - M
                - HEADER_H - 1.5*mm
                - SUBHDR_H
                - FOOTER_H - 1.5*mm)

    ug_rh = avail_h / max(total_ug, 1)

    fill(cv, 0, 0, PAGE_W, PAGE_H, WHITE)
    draw_header(cv, subtitle)

    subhdr_top = PAGE_H - M - HEADER_H - 1.5*mm
    draw_month_subheader(cv, subhdr_top, ug_rh)

    cursor_y     = subhdr_top - SUBHDR_H
    tipos_usados = set()
    content_bot  = cursor_y

    for polo_key, uhes in structure:
        for uhe_key, ugs in uhes:
            n_ugs     = len(ugs)
            block_h   = n_ugs * ug_rh
            block_bot = cursor_y - block_h

            # Cores de fundo desta UHE
            row_odd, row_even = UHE_ROW_COLORS.get(uhe_key, UHE_ROW_DEFAULT)

            # ── Coluna UHE (cor específica por usina, texto rotacionado) ────────
            uhe_bg, uhe_txt = UHE_COL_COLORS.get(uhe_key, UHE_COL_DEFAULT)
            cv.saveState()
            cv.setFillColor(hcol(uhe_bg))
            cv.rect(M, block_bot, UHE_COL_W, block_h, fill=1, stroke=0)
            cv.translate(M + UHE_COL_W/2, block_bot + block_h/2)
            cv.rotate(90)
            cv.setFillColor(hcol(uhe_txt))
            cv.setFont(FB, min(6.5, block_h * 0.35))
            cv.drawCentredString(0, -2.2, uhe_key)
            cv.restoreState()

            # ── Linhas individuais de UG ──────────────────────────────────────
            for ri, ug in enumerate(ugs):
                row_bot_r = cursor_y - ug_rh
                # Usa cor da UHE em vez de branco genérico
                bg = row_odd if ri % 2 == 0 else row_even

                # Fundo: coluna UG
                fill(cv, M + UHE_COL_W, row_bot_r, UG_COL_W, ug_rh, bg)
                # Fundo: área Gantt
                fill(cv, M + LEFT_W, row_bot_r, CHART_W, ug_rh, bg)
                # Fundo: coluna end
                fill(cv, M + LEFT_W + CHART_W, row_bot_r, END_COL_W, ug_rh, bg)

                # coluna UG: texto horizontal, centrado
                cv.setFont(FR, min(5.5, ug_rh * 0.38))
                cv.setFillColor(hcol(UG_TXT))
                cv.drawCentredString(
                    M + UHE_COL_W + UG_COL_W/2,
                    row_bot_r + ug_rh/2 - 2,
                    ug
                )

                # separadores verticais
                vline(cv, M + LEFT_W, row_bot_r, row_bot_r + ug_rh, BORDER_CLR, 0.4)
                vline(cv, M + LEFT_W + CHART_W, row_bot_r, row_bot_r + ug_rh, BORDER_CLR, 0.4)

                # grade de meses
                draw_month_grid(cv, row_bot_r, ug_rh)

                # linha divisória entre UGs
                hline(cv, M + UHE_COL_W, M + CONTENT_W, row_bot_r, GRID_LINE, 0.2)

                # barras de manutenção
                tasks_row = task_idx.get((polo_key, uhe_key, ug), [])
                draw_ug_row(cv, row_bot_r, ug_rh, tasks_row, tipos_usados)

                # registra tipos das tarefas end na legenda
                _, end_t = split_tasks(tasks_row)
                for t in end_t:
                    tipos_usados.add(t.get("tipo") or "CORR")

                # coluna end (paradas de fim de ano)
                draw_end_col_row(cv, row_bot_r, ug_rh, tasks_row)

                cursor_y = row_bot_r

            # borda inferior do bloco UHE
            hline(cv, M + UHE_COL_W, M + CONTENT_W, cursor_y, BORDER_CLR, 0.5)
            content_bot = min(content_bot, cursor_y)

    # ── Borda externa do conteúdo ─────────────────────────────────────────────
    content_top  = subhdr_top
    content_h_r  = content_top - content_bot
    cv.saveState()
    cv.setStrokeColor(hcol(BORDER_CLR))
    cv.setLineWidth(0.6)
    cv.roundRect(M, content_bot, CONTENT_W, content_h_r, CORNER_R, fill=0, stroke=1)
    cv.restoreState()

    draw_footer(cv, tipos_usados)


# ─── MAIN ────────────────────────────────────────────────────────────────────
def main():
    print(f"=== Lendo dados do banco ({YEAR}) ===")
    tasks = load_tasks()
    print(f"  {len(tasks)} manutencoes carregadas para {YEAR}.")

    idx = defaultdict(list)
    for t in tasks:
        idx[(t["polo"], t["uhe"], t["ug"])].append(t)

    cv = canvas.Canvas(OUTPUT_PATH, pagesize=portrait(A3))

    render_page(cv, PAGE1_STRUCTURE, idx,
                "Ilha Solteira (ILS) \u00b7 Jupia (JUP) \u00b7 Salto (STO)",
                page_num=1, total_pages=2)
    cv.showPage()

    render_page(cv, PAGE2_STRUCTURE, idx,
                "Chavantes (CN1 \u00b7 CN2 \u00b7 CHV \u00b7 SAG \u00b7 JUR \u00b7 PLM \u00b7 RET) \u00b7 Capivara (CPV \u00b7 ROS \u00b7 TAQ \u00b7 GAR)",
                page_num=2, total_pages=2)
    cv.save()
    print(f"  PDF salvo: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
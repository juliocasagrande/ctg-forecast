# -*- coding: utf-8 -*-
"""
Captura screenshots das telas do CTG.Engenharia para a apresentacao.
Requer backend (3005) e frontend (5173) rodando.

Uso: python scripts/capturar_telas.py
Saida: docs/screenshots/*.png
"""
import os, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
EMAIL = "admin@ctgbrasil.com"
PASSWORD = "ctg@2026"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "screenshots")
os.makedirs(OUT, exist_ok=True)

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

# (arquivo, rota, espera_extra_seg)
PAGES = [
    ("login",        "/login",                        1.5),
    ("inicio",       "/",                             3.0),
    ("iacs",         "/lists/iacs",                   3.5),
    ("acompanhamento","/lists/projects-tracking",     3.5),
    ("equipamentos", "/engineering/equipamentos",     3.0),
    ("documentos",   "/documents",                    3.0),
    ("cronograma",   "/lists/schedule-project",       3.0),
    ("metas",        "/metas",                        3.0),
    ("ferias",       "/vacations",                    3.5),
]


def shot(page, name, wait):
    page.wait_for_timeout(int(wait * 1000))
    # tenta fechar toasts/overlays
    path = os.path.join(OUT, name + ".png")
    page.screenshot(path=path)
    print("  ->", name, "OK")


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True,
                                args=["--disable-dev-shm-usage"])
    ctx = browser.new_context(viewport={"width": 1600, "height": 900},
                              device_scale_factor=2, ignore_https_errors=True)
    page = ctx.new_page()

    # ---- LOGIN screen (antes de logar) ----
    print("Capturando tela de login...")
    page.goto(BASE + "/login", wait_until="domcontentloaded")
    shot(page, "login", 1.5)

    # ---- efetua login (preenche apenas campos VISIVEIS) ----
    print("Efetuando login...")

    def fill_visible(selector, value):
        loc = page.locator(selector)
        for i in range(loc.count()):
            el = loc.nth(i)
            if el.is_visible():
                el.fill(value)
                return True
        return False

    fill_visible('input[type="email"]', EMAIL)
    fill_visible('input[type="password"]', PASSWORD)
    # clica no botao SUBMIT visivel (nao na aba "Entrar")
    subs = page.locator('button[type="submit"]')
    clicked = False
    for i in range(subs.count()):
        b = subs.nth(i)
        if b.is_visible():
            b.click()
            clicked = True
            break
    if not clicked:
        # fallback: pressiona Enter no campo de senha
        page.locator('input[type="password"]').last.press("Enter")
    try:
        page.wait_for_url(lambda u: "/login" not in u, timeout=15000)
    except Exception:
        page.wait_for_timeout(4000)
    page.wait_for_timeout(3000)
    print("Login OK, url =", page.url)

    # ---- demais telas ----
    for name, route, wait in PAGES[1:]:
        print("Capturando", name, route)
        try:
            page.goto(BASE + route, wait_until="networkidle", timeout=25000)
        except Exception as e:
            print("  (networkidle timeout, segue)", str(e)[:60])
        shot(page, name, wait)

    browser.close()

print("\nConcluido. Arquivos em:", OUT)

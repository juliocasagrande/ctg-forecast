# -*- coding: utf-8 -*-
"""Recaptura equipamentos (com usina selecionada) e cronograma (com dados)."""
import os
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
EMAIL = "admin@ctgbrasil.com"; PASSWORD = "ctg@2026"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "screenshots")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, headless=True)
    ctx = b.new_context(viewport={"width":1600,"height":900}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(BASE + "/login", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)

    def fill_visible(sel, val):
        loc = page.locator(sel)
        for i in range(loc.count()):
            if loc.nth(i).is_visible():
                loc.nth(i).fill(val); return
    fill_visible('input[type="email"]', EMAIL)
    fill_visible('input[type="password"]', PASSWORD)
    subs = page.locator('button[type="submit"]')
    for i in range(subs.count()):
        if subs.nth(i).is_visible():
            subs.nth(i).click(); break
    page.wait_for_timeout(4000)

    # ---- EQUIPAMENTOS: selecionar uma usina com dados ----
    print("equipamentos...")
    page.goto(BASE + "/engineering/equipamentos", wait_until="networkidle")
    page.wait_for_timeout(2500)
    for nome in ["UHE Salto", "UHE Ilha Solteira", "UHE Jupia"]:
        try:
            el = page.get_by_text(nome, exact=True).first
            if el.is_visible():
                el.click(); page.wait_for_timeout(2500); print("  clicou", nome); break
        except Exception:
            pass
    page.wait_for_timeout(1500)
    page.screenshot(path=os.path.join(OUT, "equipamentos.png"))
    print("  equipamentos OK")

    # ---- CRONOGRAMA: garantir dados ----
    print("cronograma...")
    page.goto(BASE + "/lists/schedule-project", wait_until="networkidle")
    page.wait_for_timeout(4000)
    # se area vazia, tenta criar um novo cronograma de exemplo
    body_txt = page.inner_text("body")
    if "Mobiliza" not in body_txt and "WBS" not in body_txt and "Prepara" not in body_txt:
        try:
            page.get_by_role("button", name="Novo Cronograma").first.click()
            page.wait_for_timeout(2500)
            # confirma eventual modal
            for lbl in ["Criar", "Salvar", "Confirmar", "OK"]:
                try:
                    btn = page.get_by_role("button", name=lbl).first
                    if btn.is_visible():
                        btn.click(); page.wait_for_timeout(2000); break
                except Exception:
                    pass
        except Exception as e:
            print("  novo cronograma falhou:", str(e)[:60])
    page.wait_for_timeout(2500)
    page.screenshot(path=os.path.join(OUT, "cronograma.png"))
    print("  cronograma OK")

    b.close()
print("done")

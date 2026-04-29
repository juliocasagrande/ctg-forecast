"""
mailer.py — Envio de e-mail via SMTP interno CTG Brasil
Lê configurações de variáveis de ambiente para uso seguro no GitHub Actions.
"""

import os
import smtplib
import json
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

# ─── CONFIG VIA ENV ───────────────────────────────────────────────────────────
SMTP_HOST  = os.environ.get("SMTP_HOST", "dtcvppostfix.ctgpar.ctgbr.com.br")
SMTP_PORT  = int(os.environ.get("SMTP_PORT", "25"))
REMETENTE  = os.environ.get("SMTP_FROM",  "cronograma_de_paradas@appmail.ctgbr.com.br")
SMTP_USER  = os.environ.get("SMTP_USER",  "")
SMTP_PASS  = os.environ.get("SMTP_PASS",  "")
USAR_TLS   = os.environ.get("SMTP_TLS",   "false").lower() == "true"

# Lista de destinatários: pode ser JSON inline ou caminho para arquivo .json
# Exemplo de JSON: [{"nome": "Fulano", "email": "fulano@ctgbr.com.br"}, ...]
_RECIPIENTS_ENV  = os.environ.get("RECIPIENTS", "")
_RECIPIENTS_FILE = os.environ.get("RECIPIENTS_FILE", "config/recipients.json")


def load_recipients() -> list[dict]:
    """Carrega a lista de destinatários do env ou do arquivo de config."""
    if _RECIPIENTS_ENV:
        try:
            return json.loads(_RECIPIENTS_ENV)
        except json.JSONDecodeError as e:
            raise ValueError(f"RECIPIENTS env inválido (JSON): {e}")
    if os.path.exists(_RECIPIENTS_FILE):
        with open(_RECIPIENTS_FILE, encoding="utf-8") as f:
            return json.load(f)
    raise FileNotFoundError(
        f"Nenhuma lista de destinatários encontrada. "
        f"Defina a env RECIPIENTS ou crie '{_RECIPIENTS_FILE}'."
    )


def enviar_email(
    destinatarios: list[str],
    assunto: str,
    mensagem: str,
    anexo_path: str | None = None,
    anexo_nome: str | None = None,
) -> None:
    """
    Envia e-mail HTML para uma lista de endereços.
    Opcionalmente anexa um arquivo (ex: o PDF do cronograma).
    """
    msg = MIMEMultipart()
    msg["From"]    = REMETENTE
    msg["To"]      = ", ".join(destinatarios)
    msg["Subject"] = assunto
    msg.attach(MIMEText(mensagem, "html"))

    # ── Anexo ──────────────────────────────────────────────────────────────
    if anexo_path and os.path.exists(anexo_path):
        with open(anexo_path, "rb") as f:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(f.read())
        encoders.encode_base64(part)
        nome = anexo_nome or os.path.basename(anexo_path)
        part.add_header("Content-Disposition", f'attachment; filename="{nome}"')
        msg.attach(part)
    elif anexo_path:
        raise FileNotFoundError(f"Anexo não encontrado: {anexo_path}")

    # ── Envio ───────────────────────────────────────────────────────────────
    try:
        servidor = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30)
        if USAR_TLS:
            servidor.starttls()
        if SMTP_USER and SMTP_PASS:
            servidor.login(SMTP_USER, SMTP_PASS)
        servidor.send_message(msg)
        servidor.quit()
        print(f"  E-mail enviado para: {', '.join(destinatarios)}")
    except Exception as e:
        raise RuntimeError(f"Falha no envio via SMTP ({SMTP_HOST}:{SMTP_PORT}): {e}") from e

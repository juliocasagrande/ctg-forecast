"""
run.py — Orquestra geração do PDF e envio por e-mail.
Chamado pelo GitHub Actions (ou localmente para teste).
"""

import os
import sys
import datetime

# Ajusta o PYTHONPATH para importar os módulos da pasta scripts/
sys.path.insert(0, os.path.dirname(__file__))

from gantt  import main as gerar_pdf, OUTPUT_PATH, YEAR
from mailer import load_recipients, enviar_email

# ─── CONFIG DO E-MAIL ─────────────────────────────────────────────────────────
ASSUNTO = os.environ.get(
    "EMAIL_SUBJECT",
    f"Cronograma de Manutenções CTG Brasil {YEAR} — {datetime.date.today():%d/%m/%Y}",
)

CORPO_HTML = f"""
<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
</head>
<body style="margin:0; padding:0; background-color:#f4f6f8; font-family: Arial, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;">
    <tr>
      <td align="center" style="padding:30px 10px;">

        <!-- CONTAINER -->
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border:1px solid #e2e8f0;">
          
          <!-- HEADER -->
          <tr>
            <td bgcolor="#1b3a6b" style="padding:20px 30px;">
              <h2 style="margin:0; color:#7ecfff; font-size:20px;">
                CTG Brasil · Engenharia Eletromecânica
              </h2>
              <p style="margin:6px 0 0; color:#ffffff; font-size:14px;">
                Cronograma de Manutenções {YEAR}
              </p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:24px 30px; color:#1b3a6b; font-size:14px; line-height:1.6;">
              <p style="margin-top:0;">Prezado(a),</p>

              <p>
                Segue em anexo o
                <strong>Cronograma de Manutenções e Modernizações {YEAR}</strong>
                das usinas CTG Brasil, gerado automaticamente em
                <strong>{datetime.date.today():%d/%m/%Y}</strong>.
              </p>

              <p>
                O documento apresenta o planejamento consolidado para todos os polos da
                <strong>CTG Brasil</strong>.
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td bgcolor="#f8fafc" style="padding:16px 30px; font-size:12px; color:#64748b;">
              Este e-mail foi gerado automaticamente.
              Em caso de dúvidas, entre em contato com a
              Engenharia Eletromecânica CTG Brasil.
            </td>
          </tr>

        </table>
        <!-- /CONTAINER -->

      </td>
    </tr>
  </table>

</body>
</html>
"""

def main():
    # 1. Gerar PDF
    print("=== Gerando PDF ===")
    gerar_pdf()

    # 2. Carregar destinatários
    print("\n=== Carregando destinatários ===")
    try:
        destinatarios = load_recipients()
    except (FileNotFoundError, ValueError) as e:
        print(f"ERRO: {e}", file=sys.stderr)
        sys.exit(1)

    emails = [d["email"] for d in destinatarios if d.get("email")]
    print(f"  {len(emails)} destinatário(s): {', '.join(emails)}")

    if not emails:
        print("ERRO: Lista de destinatários vazia.", file=sys.stderr)
        sys.exit(1)

    # 3. Enviar e-mail com o PDF em anexo
    print("\n=== Enviando e-mail ===")
    try:
        enviar_email(
            destinatarios=emails,
            assunto=ASSUNTO,
            mensagem=CORPO_HTML,
            anexo_path=OUTPUT_PATH,
            anexo_nome=f"cronograma_manutencoes_{YEAR}.pdf",
        )
    except (FileNotFoundError, RuntimeError) as e:
        print(f"ERRO: {e}", file=sys.stderr)
        sys.exit(1)

    print("\n=== Concluído com sucesso ===")

if __name__ == "__main__":
    main()

"""
validate_db.py — Valida conectividade TCP e acesso à view.
Credenciais via variável de ambiente (Actions) ou valores padrão (rede interna).
"""

import os, sys, socket

sys.path.insert(0, os.path.dirname(__file__))
from db_utils import conectar

SERVER   = os.environ.get("DB_SERVER",   "10.108.1.36")
DATABASE = os.environ.get("DB_DATABASE", "Engenharia")
USER     = os.environ.get("DB_USER",     "eng")
PASSWORD = os.environ.get("DB_PASSWORD", "ctg@2023")
VIEW     = os.environ.get("DB_VIEW",     "dbo.vPLAN_MANUTENCAO_UGS")

host = SERVER.split(",")[0].split("\\")[0]
port = int(SERVER.split(",")[1]) if "," in SERVER else 1433

print(f"Testando TCP {host}:{port} ...")
try:
    sock = socket.create_connection((host, port), timeout=5)
    sock.close()
    print(f"  OK — porta {port} acessivel.")
except Exception as e:
    print(f"::error::Falha TCP {host}:{port} — {e}")
    sys.exit(1)

print(f"Conectando via ODBC em {SERVER}/{DATABASE} ...")
try:
    conn = conectar(SERVER, DATABASE, USER, PASSWORD, timeout=10)
    conn.cursor().execute(f"SELECT TOP 1 * FROM {VIEW}").fetchone()
    conn.close()
    print(f"  OK — view [{VIEW}] acessivel.")
except Exception as e:
    print(f"::error::Falha na conexao ODBC: {e}")
    sys.exit(1)
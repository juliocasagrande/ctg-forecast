"""
db_utils.py — Utilitários de conexão SQL Server para o projeto Confiabilidade.
Detecta automaticamente o melhor driver ODBC disponível no sistema,
eliminando a dependência do ODBC Driver 17 for SQL Server.
"""

import pyodbc

# Ordem de preferência — do mais moderno ao mais antigo
_DRIVER_PREFERENCIA = [
    "ODBC Driver 18 for SQL Server",
    "ODBC Driver 17 for SQL Server",
    "ODBC Driver 13 for SQL Server",
    "ODBC Driver 11 for SQL Server",
    "SQL Server Native Client 11.0",
    "SQL Server Native Client 10.0",
    "SQL Server",
]


def detectar_driver() -> str:
    """Retorna o melhor driver ODBC disponível para SQL Server."""
    disponiveis = pyodbc.drivers()
    for driver in _DRIVER_PREFERENCIA:
        if driver in disponiveis:
            return driver
    raise RuntimeError(
        f"Nenhum driver ODBC para SQL Server encontrado.\n"
        f"Drivers instalados: {disponiveis}\n"
        f"Instale o ODBC Driver 17: https://aka.ms/odbc17"
    )


def build_conn_str(server: str, database: str, user: str, password: str) -> str:
    """Monta a connection string usando o melhor driver disponível."""
    driver = detectar_driver()
    print(f"  Driver ODBC selecionado: {driver}")
    return (
        f"DRIVER={{{driver}}};"
        f"SERVER={server};"
        f"DATABASE={database};"
        f"UID={user};"
        f"PWD={password};"
        "Encrypt=no;"
        "TrustServerCertificate=yes;"
    )


def conectar(server: str, database: str, user: str, password: str, timeout: int = 30):
    """Abre e retorna uma conexão pyodbc com o SQL Server."""
    conn_str = build_conn_str(server, database, user, password)
    return pyodbc.connect(conn_str, timeout=timeout)
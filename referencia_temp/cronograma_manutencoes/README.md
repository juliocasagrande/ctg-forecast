# gantt-mailer · CTG Brasil

Gera o PDF do Cronograma de Manutenções e envia por e-mail via GitHub Actions.

---

## Estrutura

```
gantt-mailer/
├── .github/
│   └── workflows/
│       └── gantt_mailer.yml    # Pipeline CI/CD
├── config/
│   └── recipients.json         # Lista de destinatários (dev/local)
├── data/
│   └── Manutenções_CTG_Brasil.xlsm   # ← você coloca aqui (ou usa LFS)
├── output/                     # PDF gerado (criado automaticamente)
├── scripts/
│   ├── gantt.py                # Geração do PDF
│   ├── mailer.py               # Envio via SMTP
│   └── run.py                  # Orquestrador
├── requirements.txt
└── README.md
```

---

## Configuração

### 1. Planilha Excel

Coloque a planilha `Manutenções_CTG_Brasil.xlsm` na pasta `data/`.
Se o arquivo for grande, use [Git LFS](https://git-lfs.github.com/):

```bash
git lfs track "data/*.xlsm"
git add .gitattributes data/Manutenções_CTG_Brasil.xlsm
```

### 2. Secrets no GitHub

Acesse **Settings → Secrets and variables → Actions** e crie os secrets abaixo:

| Secret        | Valor de exemplo                        | Obrigatório |
|---------------|-----------------------------------------|-------------|
| `SMTP_HOST`   | `spvpsmtp.ctgpar.ctgbr.com.br`         | ✅           |
| `SMTP_PORT`   | `25`                                    | ✅           |
| `SMTP_FROM`   | `smtp.services@ctgbr.com.br`           | ✅           |
| `SMTP_USER`   | *(deixe vazio se sem autenticação)*     | —           |
| `SMTP_PASS`   | *(deixe vazio se sem autenticação)*     | —           |
| `SMTP_TLS`    | `false`                                 | —           |
| `RECIPIENTS`  | JSON inline (ver abaixo)               | ✅           |

**Formato do secret `RECIPIENTS` (JSON inline):**
```json
[
  {"nome": "Engenharia Eletromecânica", "email": "eng.eletro@ctgbr.com.br"},
  {"nome": "Coordenação de Manutenção", "email": "coord.manutencao@ctgbr.com.br"}
]
```

> Alternativa: omita o secret `RECIPIENTS` e edite `config/recipients.json` diretamente no repositório.

---

## Execução

### Automática (todo Monday 06:00 BRT)
O workflow `gantt_mailer.yml` roda automaticamente via `cron`.

### Manual (GitHub UI)
1. Vá em **Actions → Gerar e Enviar Cronograma PDF → Run workflow**
2. Preencha os campos opcionais:
   - **year**: ano desejado (padrão: ano corrente)
   - **dry_run**: `true` para gerar o PDF sem enviar e-mail

### Local (desenvolvimento)
```bash
pip install -r requirements.txt

# Configura as variáveis de ambiente
export EXCEL_PATH="data/Manutenções_CTG_Brasil.xlsm"
export OUTPUT_PATH="output/cronograma_manutencoes.pdf"
export GANTT_YEAR=2026

# Somente gerar o PDF
python scripts/gantt.py

# Gerar + enviar
export SMTP_HOST="spvpsmtp.ctgpar.ctgbr.com.br"
export SMTP_PORT=25
export SMTP_FROM="smtp.services@ctgbr.com.br"
python scripts/run.py
```

---

## Variáveis de ambiente (referência completa)

| Variável          | Descrição                                   | Default                              |
|-------------------|---------------------------------------------|--------------------------------------|
| `EXCEL_PATH`      | Caminho para a planilha                     | `data/Manutenções_CTG_Brasil.xlsm`  |
| `OUTPUT_PATH`     | Caminho de saída do PDF                     | `output/cronograma_manutencoes.pdf` |
| `GANTT_YEAR`      | Ano do cronograma                           | Ano corrente                         |
| `SMTP_HOST`       | Host do servidor SMTP                       | `spvpsmtp.ctgpar.ctgbr.com.br`      |
| `SMTP_PORT`       | Porta SMTP                                  | `25`                                 |
| `SMTP_FROM`       | Endereço remetente                          | `smtp.services@ctgbr.com.br`        |
| `SMTP_USER`       | Usuário SMTP (opcional)                     | —                                    |
| `SMTP_PASS`       | Senha SMTP (opcional)                       | —                                    |
| `SMTP_TLS`        | Habilitar STARTTLS (`true`/`false`)         | `false`                              |
| `RECIPIENTS`      | Lista de destinatários em JSON              | lê `config/recipients.json`         |
| `EMAIL_SUBJECT`   | Assunto customizado do e-mail               | Gerado automaticamente               |

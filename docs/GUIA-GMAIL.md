# 📧 GUIA: Configurar Gmail para Envio de E-mails

## Passo 1: Preparar sua conta Gmail

1. **Acesse sua conta Google**: https://myaccount.google.com
2. No menu à esquerda, clique em **"Segurança"**
3. Role para baixo até **"Como você faz login no Google"**
4. Ative a **"Verificação em duas etapas"** (se ainda não tiver)

## Passo 2: Gerar Senha de App (App Password)

1. Acesse: https://myaccount.google.com/apppasswords
2. Faça login se solicitado
3. Em **"Selecionar app"**, escolha **"Outro (nome personalizado)"**
4. Digite: `CTG Engenharia Forecast`
5. Clique em **"Gerar"**
6. **Copie a senha de 16 letras** que aparece (ex: `abcd efgh ijkl mnop`)

⚠️ **Importante**: Esta senha tem 16 dígitos com espaços. Copie exatamente como aparece!

## Passo 3: Configurar o arquivo .env

Abra o arquivo `backend/.env` e:

1. **Comente** as linhas do SMTP interno (adicione `#` no início):
```
# SMTP_HOST=dtcvppostfix.ctgpar.ctgbr.com.br
# SMTP_PORT=25
# SMTP_USER=julio.casagrande@ctgbr.com.br
# SMTP_PASS=
# SMTP_TLS=false
```

2. **Descomente e preencha** as linhas do Gmail:
```
SMTP_GMAIL_USER=seu_email@gmail.com
SMTP_GMAIL_PASS=abcd efgh ijkl mnop
```

Exemplo completo:
```env
SMTP_GMAIL_USER=julio.casagrande@gmail.com
SMTP_GMAIL_PASS=abcd efgh ijkl mnop

# Mantenha as outras configurações...
FRONTEND_URL=http://localhost:5173
JWT_SECRET=ctg-forecast-secret-local
DATABASE_URL=sua_string_postgres
```

## Passo 4: Testar

Execute o teste:
```bash
cd backend
node test-email.js
```

✅ **Se funcionar**, você verá: `✅ E-mail enviado com sucesso!`
❌ **Se falhar**, verifique se:
- A senha de app foi copiada corretamente (16 dígitos)
- O Gmail está ativado com verificação em duas etapas
- O e-mail do Gmail está correto

## FAQ

**P: Posso usar meu e-mail corporativo CTG?**
R: Não diretamente. O servidor interno CTG bloqueia relay. Use Gmail para envios externos.

**P: A senha de app é segura?**
R: Sim! Ela só funciona para este app específico e pode ser revogada a qualquer momento em https://myaccount.google.com/apppasswords

**P: E se eu não quiser usar Gmail?**
R: Você precisará usar o servidor SMTP interno da CTG, mas precisará estar na rede interna/VPN e ter as permissões corretas de relay.

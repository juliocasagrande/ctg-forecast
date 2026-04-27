1. Rodando localmente
Você precisa de dois terminais abertos ao mesmo tempo.

Terminal 1 — Backend:


cd "c:\Users\jlcasagrande\OneDrive - CTG Brasil\CTG Br\02 - PYTHON\forecast\backend"
npm run dev
Vai rodar na porta 3001. O banco local já está configurado no backend/.env (Railway).

Terminal 2 — Frontend:


cd "c:\Users\jlcasagrande\OneDrive - CTG Brasil\CTG Br\02 - PYTHON\forecast\frontend"
npm run dev
Vai rodar em http://localhost:5173. Todas as chamadas /api são redirecionadas automaticamente para o backend na 3001.

2. Deploy para a Azure (passo a passo)
Passo 1 — Commitar e enviar ao GitHub:


git add .
git commit -m "descrição do que foi alterado"
git push origin main
Passo 2 — Acompanhar o build:

Acesse o repositório no GitHub → aba Actions
Aguarde o workflow terminar (ícone verde ✓) — leva ~3-5 minutos
Passo 3 — Atualizar e reiniciar o App Service (no Azure Cloud Shell ou terminal local com az login):


az webapp config container set --name ctg-engineering --resource-group ctg-engineering-group --container-registry-url https://ghcr.io --container-registry-user juliocasagrande --container-registry-password SEU_CR_PAT --container-image-name ghcr.io/juliocasagrande/ctg-engineering:latest

az webapp restart --name ctg-engineering --resource-group ctg-engineering-group
Substitua SEU_CR_PAT pelo token ghp_... que você criou. Guarde esse token em um lugar seguro — você vai usar sempre que fizer deploy.

Passo 4 — Aguardar ~1 minuto e acessar https://ctg-engineering.azurewebsites.net.
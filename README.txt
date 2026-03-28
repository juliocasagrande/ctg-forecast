# Instalar
cd backend; npm install; cd ..
cd frontend; npm install; cd ..

# Criar backend\.env
"DATABASE_URL=postgresql://postgres:sXoiWeAwxOsBPejFVezIVPbnZIaiHVBp@autorack.proxy.rlwy.net:31563/railway`nPORT=3001`nNODE_ENV=development`nJWT_SECRET=ctg-forecast-secret-local" | Out-File -FilePath backend\.env -Encoding utf8

# Criar frontend\.env
"VITE_API_URL=http://localhost:3001/api" | Out-File -FilePath frontend\.env -Encoding utf8

# Criar o primeiro admin
cd backend; node src/db/seed.js; cd ..

# Para rodar precisam de dois terminais
# Terminal 1
cd backend; npm run dev

# Terminal 2 
cd frontend; npm run dev

admin@ctgbrasil.com
ctg@2026
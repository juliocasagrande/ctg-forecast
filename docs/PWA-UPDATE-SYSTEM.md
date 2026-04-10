# Sistema de Atualização Automática - PWA & Web

## Visão Geral

O sistema de atualização automática foi implementado para garantir que os usuários sempre tenham acesso à versão mais recente da aplicação, tanto no modo web quanto no PWA instalado.

## Como Funciona

### Detecção de Atualização
- O service worker verifica automaticamente por novas versões a cada **60 segundos**
- Quando um novo build é detectado, o sistema notifica o usuário
- O countdown de **30 segundos** dá tempo para o usuário salvar seu trabalho

### Notificação Visual
Quando uma atualização está disponível:

1. **Card de Notificação** aparece na parte inferior da tela
   - Design consistente com o estilo CTG (navy, blue, accent)
   - Ícone animado com efeito pulse
   - Countdown regressivo visível
   - Botão "Atualizar agora" para atualização imediata
   - Botão "×" para adiar a atualização

2. **Toast de Confirmação** aparece brevemente no topo
   - Feedback visual de que a atualização está em progresso
   - Duração: ~800ms antes do reload

### Comportamentos

#### Se o usuário clicar em "Atualizar agora":
- Service worker é ativado imediatamente
- Página é recarregada com a nova versão
- Toast verde "Atualizando..." aparece

#### Se o countdown chegar a zero:
- Atualização automática é executada
- Página é recarregada

#### Se o usuário clicar em "×" (dispensar):
- Notificação é fechada
- Usuário continuará com a versão atual
- Será notificado novamente na próxima detecção

## Arquivos Envolvidos

### Frontend

| Arquivo | Função |
|---------|--------|
| `frontend/src/components/ui/PWAUpdatePrompt.jsx` | Componente principal de notificação |
| `frontend/src/main.jsx` | Renderiza o `PWAUpdatePrompt` |
| `frontend/src/index.css` | Animações CSS (`pwa-slide-up`, `pwa-slide-down`, `pwa-pulse`) |
| `frontend/vite.config.js` | Configuração do PWA (registerType, workbox) |

### Configuração do Vite PWA

```javascript
VitePWA({
  registerType: 'prompt',           // Permite controle manual do update
  workbox: {
    cleanupOutdatedCaches: true,    // Limpa caches antigos
    skipWaiting: false,             // Espera pelo reload do usuário
    clientsClaim: false,            // Não toma controle imediatamente
  }
})
```

## Testando Localmente

### 1. Build de Produção
```bash
cd frontend
npm run build
```

### 2. Copiar para Backend
```bash
cp -r frontend/dist backend/public
```

### 3. Iniciar Backend
```bash
cd backend
npm start
```

### 4. Simular Atualização
- Abra o app em `http://localhost:3001`
- Faça uma alteração no código frontend
- Execute `npm run build` novamente
- Copie o `dist/` para `backend/public`
- Recarregue a página (ou aguarde 60s)
- O card de atualização aparecerá

### 5. Testar no Modo PWA
- Chrome DevTools → Application → Manifest → Add to homescreen
- Ou: Chrome menu → "Instalar CTG.Engenharia"
- Abra o app instalado
- Siga os passos 4 para testar

## Verificando o Service Worker

### Chrome DevTools
1. Abra `F12` → **Application** tab
2. **Service Workers** section:
   - Status deve mostrar "Activated and is running"
   - Checkbox "Update on reload" para desenvolvimento
3. **Clear storage** → "Clear site data" para resetar caches

### Log de Atualização
O console do browser mostrará:
```
[Vite PWA] New content available, please reload.
```

## Animações CSS

### pwa-slide-up
- Card entra de baixo para cima
- Duração: 0.35s
- Easing: cubic-bezier(0.34,1.56,0.64,1) (bounce suave)

### pwa-slide-down
- Toast de sucesso desce do topo
- Duração: 0.3s
- Easing: ease

### pwa-pulse
- Ícone pulsa continuamente
- Scale: 1 → 1.08 → 1
- Duração: 2s infinite

## Responsividade

### Desktop (>768px)
- Largura mínima: 380px
- Largura máxima: 92vw
- Bottom: 24px

### Mobile (≤768px)
- Largura: calc(100vw - 24px)
- Bottom: 16px
- Ícones e textos reduzidos
- Touch targets mantidos acessíveis

## Customização

### Alterar Tempo de Countdown
No `PWAUpdatePrompt.jsx`:
```javascript
const [countdown, setCountdown] = useState(30); // <- mude aqui
const interval = setInterval(() => {
  // countdown logic
}, 1000);
```

### Alterar Intervalo de Verificação
No `PWAUpdatePrompt.jsx`:
```javascript
onRegistered(r) {
  if (r) setInterval(() => r.update(), 60_000); // <- 60 segundos
}
```

### Estilizar o Card
No `index.css`, adicione:
```css
.pwa-update-card {
  /* suas customizações */
}
```

## Troubleshooting

### Card não aparece
1. Verifique se `PWAUpdatePrompt` está montado em `main.jsx`
2. Verifique o console por erros do service worker
3. Certifique-se de que o build foi feito em modo produção

### Atualização automática não funciona
1. Verifique `registerType: 'prompt'` no vite.config.js
2. Verifique se `skipWaiting: false` está configurado
3. Limpe caches do service worker (DevTools → Application → Clear storage)

### App está usando versão antiga
1. Force reload: `Ctrl+Shift+R` (Windows) ou `Cmd+Shift+R` (Mac)
2. Limpe caches do service worker
3. Verifique se o `dist/` foi copiado corretamente para `backend/public`

## Versionamento

- **v2.0.0** - Implementação inicial do sistema de atualização
- Build date: 2026-04-01

## Referências

- [Vite PWA Plugin](https://vite-pwa-org.netlify.app/)
- [Workbox Documentation](https://developers.google.com/web/tools/workbox)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

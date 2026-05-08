import { PublicClientApplication } from '@azure/msal-browser';

const TENANT_ID = import.meta.env.VITE_AZURE_TENANT_ID || 'f21848f2-6893-4fa8-b96b-b23fb3ec84ee';
const CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID || 'dac17d08-dfdd-456a-8a85-bcb18d46be7b';

const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

export const loginRequest = {
  scopes: ['openid', 'profile', 'email'],
  redirectUri: `${window.location.origin}/blank.html`,
};

export const msalInstance = new PublicClientApplication(msalConfig);

// Initialize and clear any leftover interaction state from previous sessions
export const msalInitialized = msalInstance.initialize().then(() =>
  msalInstance.handleRedirectPromise()
);

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',

    // Carrega o .env.test em CADA worker antes dos testes
    setupFiles: ['./tests/setup/testSetup.js'],

    // Roda UMA VEZ antes de todos os workers: inicializa o banco de testes
    globalSetup: './tests/setup/globalSetup.js',

    // Executa tudo num único fork para compartilhar o pool do banco
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }
    },

    // Tempo limite generoso para queries de integração
    testTimeout:  30_000,
    hookTimeout:  30_000,

    // Não roda arquivos em paralelo (evita conflito no banco)
    sequence: { concurrent: false },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.js'],
      exclude: [
        'src/db/schema.js',
        'src/db/seed.js',
        'src/index.js',
        'src/app.js'
      ]
    }
  }
});

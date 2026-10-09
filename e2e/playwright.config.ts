import { defineConfig, devices } from '@playwright/test';

/**
 * Tests E2E du panneau HearMe déployé (GitHub Pages).
 * On teste le site EN LIGNE : pas de build local nécessaire.
 * Surchargeable via la variable d'env PANEL_URL.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PANEL_URL || 'https://gethearme.me/',
    headless: true,
    // Le panneau prend la langue du navigateur : les tests vérifient les textes français.
    locale: 'fr-FR',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], locale: 'fr-FR' } },
  ],
});

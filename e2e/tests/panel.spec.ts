import { test, expect } from '@playwright/test';

/**
 * Tests end-to-end du panneau d'urgence HearMe, contre le site déployé.
 * Ils rejouent exactement ce qui a été validé à la main :
 *   1. le portail se charge,
 *   2. un lien magique invalide affiche la bannière (RPC consume_access_token, SQL 06),
 *   3. une connexion PIN erronée affiche l'erreur (RPC panel_pin_login, SQL 07).
 *
 * Ces tests utilisent DES DONNÉES FICTIVES (jeton/PIN faux) : ils vérifient que le
 * serveur RÉPOND correctement (refus propre), sans jamais toucher à un vrai appareil.
 */

test('le portail d’accueil se charge', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle(/HearMe/i);
  // Les 3 onglets d'accès sont présents.
  await expect(page.getByRole('button', { name: 'Connexion' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Créer Compte/i })).toBeVisible();
});

test('magic link invalide → bannière + URL nettoyée', async ({ page }) => {
  await page.goto('./?access=faketoken_e2e_ci');
  // La fonction serveur consume_access_token répond "not_found" → bannière.
  await expect(page.getByText(/Lien d.?accès invalide/i)).toBeVisible();
  // Jeton à usage unique : le paramètre ?access doit disparaître de l'URL.
  await expect(page).not.toHaveURL(/access=/);
});

test('connexion PIN incorrecte → message d’erreur', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Connexion' }).click();
  await page.locator('input[type="email"]').fill('e2e-ci@hearme.test');
  await page.getByPlaceholder(/chiffres/i).fill('999999');
  await page.getByRole('button', { name: /Se connecter par PIN/i }).click();
  // La fonction serveur panel_pin_login refuse proprement.
  await expect(page.getByText('E-mail ou PIN incorrect.')).toBeVisible();
});

/**
 * ⚠️ LIMITE CONNUE DE CES TESTS — lire avant d'y ajouter quoi que ce soit.
 *
 * Le 29/08/2026, le magic link et le PIN maître étaient TOTALEMENT hors service
 * en production… et ces trois tests restaient au vert.
 *
 * Pourquoi : ils n'exercent que les chemins de REFUS (jeton bidon, e-mail
 * inconnu). Or panel_pin_login retourne « invalid » dès qu'aucune ligne ne
 * correspond à l'e-mail — AVANT d'appeler crypt(). Les seuls appels qui
 * touchent pgcrypto (gen_random_bytes, crypt, gen_salt) exigent un appareil
 * valide, donc un test en boîte noire ne peut pas les atteindre.
 *
 * Le chemin de SUCCÈS est couvert côté base, par une fonction qui crée un
 * appareil jetable puis le supprime :
 *
 *     select selftest_emergency_flow();     -- supabase/10_selftest.sql
 *
 * À lancer après chaque déploiement SQL. Si tu ajoutes un test ici, garde en
 * tête qu'un refus propre ne prouve pas que la fonctionnalité marche.
 */

test('le fond animé se dimensionne et couvre le portail', async ({ page }) => {
  await page.goto('./');
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeAttached();
  // Garde-fou : le canevas se dimensionnait à 0x0 quand on le mesurait via
  // clientWidth au montage (un <canvas> sans taille CSS effective retombe sur
  // son attribut width, qui restait donc bloqué à 0). Le fond était noir.
  const size = await canvas.evaluate((c: HTMLCanvasElement) => ({
    buffer: c.width * c.height,
    rect: Math.round(c.getBoundingClientRect().width),
  }));
  expect(size.buffer).toBeGreaterThan(0);
  expect(size.rect).toBeGreaterThan(300);
});

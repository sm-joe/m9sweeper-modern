const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

function stagingCredentials() {
  // GitHub Actions generates fresh, private credentials for its disposable
  // Compose stack; never commit secrets or print these values in test output.
  const file = path.resolve(__dirname, '../../../platform/docker-compose/.env');
  const content = fs.readFileSync(file, 'utf8');
  const values = Object.fromEntries(
    content.split(/\r?\n/).filter(s => /^[A-Z][A-Z0-9_]*=/.test(s))
      .map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; })
  );
  if (!values.SUPER_ADMIN_EMAIL || !values.SUPER_ADMIN_PASSWORD) {
    throw new Error('Ephemeral staging admin credentials unavailable');
  }
  return { email: values.SUPER_ADMIN_EMAIL, password: values.SUPER_ADMIN_PASSWORD };
}

test('public Angular application renders sign-in form', async ({ page }) => {
  await page.goto('/public/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
  await expect(page.locator('#submit')).toBeVisible();
});

test('unauthenticated visitors cannot view protected dashboard', async ({ page }) => {
  await page.goto('/private');
  await expect(page).toHaveURL(/\/public\/login/);
  await expect(page.locator('#submit')).toBeVisible();
});

test('real seeded admin signs in through Angular and sees the security dashboard', async ({ page }) => {
  const credentials = stagingCredentials();
  await page.goto('/public/login');
  await expect(page.locator('#email')).toBeVisible();
  await page.locator('#email').fill(credentials.email);
  await page.locator('#password').fill(credentials.password);
  await page.locator('#submit').click();
  await expect(page).toHaveURL(/\/private/);
  await expect(page.getByRole('heading', { name: 'Cluster security overview' })).toBeVisible();
  await expect(page.locator('app-scanner-connectivity')).toBeVisible();
});

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

function ephemeralAdmin() {
  // Use disposable Compose credentials; never commit or log secrets.
  const file = path.resolve(__dirname, '../../../platform/docker-compose/.env');
  const env = Object.fromEntries(
    fs.readFileSync(file, 'utf8').split(/\r?\n/)
      .filter(line => /^[A-Z][A-Z0-9_]*=/.test(line))
      .map(line => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD) {
    throw new Error('Disposable stack admin credentials are missing');
  }
  return { email: env.SUPER_ADMIN_EMAIL, password: env.SUPER_ADMIN_PASSWORD };
}

async function signIn(page) {
  const admin = ephemeralAdmin();
  await page.goto('/public/login');
  await page.locator('#email').fill(admin.email);
  await page.locator('#password').fill(admin.password);
  await page.locator('#submit').click();
  await expect(page).toHaveURL(/\/private(?:\/|$)/, { timeout: 20_000 });
}

test('authenticated admin can render the real policy inventory screen', async ({ page }) => {
  await signIn(page);
  await page.goto('/private/policies');

  // Works with an empty initial database; do not invent policies or modify data.
  await expect(page).toHaveURL(/\/private\/policies(?:[/?#]|$)/);
  await expect(page.locator('app-policy-list')).toHaveCount(1);
  await expect(page.locator('mat-table mat-header-cell').filter({ hasText: 'Name' }))
    .toHaveCount(1);
  await expect(page.locator('mat-table mat-header-cell').filter({ hasText: 'Description' }))
    .toHaveCount(1);
});

test('authenticated admin retains scanner overview after dashboard navigation', async ({ page }) => {
  await signIn(page);
  await page.goto('/private/dashboard');

  // First-run environments may have a cluster onboarding dialog; mounted
  // scanner status must not disappear behind it after framework migrations.
  await expect(page.locator('.revamp-dashboard-intro h1'))
    .toHaveText('Cluster security overview');
  await expect(page.locator('app-scanner-connectivity')).toHaveCount(1);
});

test('persisted authenticated Falco webhook event is visible in Angular cluster history', async ({ page }) => {
  const fixturePath = path.resolve(__dirname, '../.ci-cluster-id');
  const clusterId = fs.readFileSync(fixturePath, 'utf8').trim();
  if (!/^[1-9][0-9]*$/.test(clusterId)) {
    throw new Error('Disposable Falco integration cluster ID is missing or invalid');
  }
  await signIn(page);
  await page.goto(`/private/clusters/${clusterId}/falco`);
  await expect(page).toHaveURL(new RegExp(`/private/clusters/${clusterId}/falco(?:[/?#]|$)`));
  await expect(page.locator('app-falco-events-list')).toHaveCount(1);
  await expect(page.locator('.page-title').filter({ hasText: 'Project Falco' })).toHaveCount(1);
  await expect(page.locator('#related-events-table mat-row')
    .filter({ hasText: 'ci-generated integration event' })).toHaveCount(1, { timeout: 20_000 });
});

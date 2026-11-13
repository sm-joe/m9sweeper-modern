const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

// Uses ONLY the real persisted scan fixture from the disposable Trivy job.
// The fixture's cluster has no Kubernetes API access: this is a browser
// navigation/error-state smoke test, NOT a live Gatekeeper/Kubesec scan.
const root = path.resolve(__dirname, '../../..');
const fixtureFile = path.join(root, 'tools/browser-e2e/.ci-trivy-fixture.json');
const enabled = fs.existsSync(fixtureFile);
const fixture = enabled ? JSON.parse(fs.readFileSync(fixtureFile, 'utf8')) : {};
const envFile = path.join(root, 'platform/docker-compose/.env');
const adminEnv = enabled ? Object.fromEntries(fs.readFileSync(envFile, 'utf8')
  .split(/\r?\n/).filter(line => /^[A-Z][A-Z0-9_]*=/.test(line))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])) : {};

test.skip(!enabled, 'Requires actual queued Trivy scan fixture in disposable CI');

async function signIn(page) {
  if (!adminEnv.SUPER_ADMIN_EMAIL || !adminEnv.SUPER_ADMIN_PASSWORD) {
    throw new Error('Disposable admin credentials absent');
  }
  await page.goto('/public/login');
  await page.locator('#email').fill(adminEnv.SUPER_ADMIN_EMAIL);
  await page.locator('#password').fill(adminEnv.SUPER_ADMIN_PASSWORD);
  await page.locator('#submit').click();
  await expect(page).toHaveURL(/\/private(?:\/|$)/, {timeout: 20000});
}

test('real scanned image is listed and navigable on the Angular Images screen', async ({page}) => {
  await signIn(page);
  const url = `/private/clusters/${fixture.clusterId}/images`;
  await page.goto(url);
  await expect(page).toHaveURL(new RegExp(`/private/clusters/${fixture.clusterId}/images`));
  await expect(page.locator('app-image')).toHaveCount(1, {timeout: 20000});
  await expect(page.locator('#imagesTable')).toBeVisible();
  const imageRow = page.locator('#imagesTable mat-row')
    .filter({hasText: 'alpine:3.21'});
  await expect(imageRow).toHaveCount(1, {timeout: 20000});
  await imageRow.locator('a').first().click();
  await expect(page).toHaveURL(new RegExp(`/images/image-scan/${fixture.imageId}`));
  await expect(page.locator('#scanRunState'))
    .toContainText('Latest Trivy scan: completed', {timeout: 20000});
});

test('MVP optional Kubernetes screens mount without blank routes', async ({page}) => {
  await signIn(page);
  const base = `/private/clusters/${fixture.clusterId}`;

  await page.goto(base + '/kubesec');
  await expect(page.locator('app-kubesec')).toHaveCount(1, {timeout: 20000});
  await expect(page.locator('.page-title').filter({hasText: 'Kubesec'})).toBeVisible();
  // Pod-file mode remains available without a live API; selecting cluster pods
  // should correctly disclose failed API access rather than a blank page.
  await expect(page.locator('.file-radio-button')).toBeVisible();

  await page.goto(base + '/gatekeeper');
  await expect(page.locator('app-gate-keeper')).toHaveCount(1, {timeout: 20000});
  await expect(page.locator('app-sub-navigation')).toHaveCount(1);

  await page.goto(base + '/kubernetes-namespaces');
  await expect(page.locator('app-kubernetes-namespaces')).toHaveCount(1, {timeout: 20000});
  await expect(page.locator('.page-title').filter({hasText: 'Namespaces'})).toBeVisible();
});

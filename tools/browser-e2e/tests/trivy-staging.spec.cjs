const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

// Intentionally invoked only by the isolated real-Trivy staging workflow.
// No secrets are written to the fixture; credentials remain in the disposable
// Compose environment file used by other browser regression tests.
const root = path.resolve(__dirname, '../../..');
const fixturePath = path.join(root, 'tools/browser-e2e/.ci-trivy-fixture.json');
const available = fs.existsSync(fixturePath);
const fixture = available ? JSON.parse(fs.readFileSync(fixturePath, 'utf8')) : null;
const envPath = path.join(root, 'platform/docker-compose/.env');
const env = available ? Object.fromEntries(fs.readFileSync(envPath, 'utf8')
  .split(/\r?\n/).filter(x => /^[A-Z][A-Z0-9_]*=/.test(x)).map(x => {
    const index = x.indexOf('=');
    return [x.slice(0, index), x.slice(index + 1)];
  })) : {};
if (available && (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD)) {
  throw new Error('Disposable Trivy browser test requires seeded admin credentials in Compose .env');
}
test.skip(!available, 'Only run with a real disposable Trivy staging scan fixture');

test('real queued Trivy run persists and renders on Angular image-detail page', async ({page}) => {
  expect(Number.isSafeInteger(fixture.clusterId) && fixture.clusterId > 0).toBeTruthy();
  expect(Number.isSafeInteger(fixture.imageId) && fixture.imageId > 0).toBeTruthy();
  expect(fixture.runId).toMatch(/^[0-9a-f-]{36}$/i);
  await page.goto('/public/login');
  await page.locator('#email').fill(env.SUPER_ADMIN_EMAIL);
  await page.locator('#password').fill(env.SUPER_ADMIN_PASSWORD);
  await page.locator('#submit').click();
  await expect(page).toHaveURL(/\/private(?:\/|$)/, {timeout: 20_000});

  const location = `/private/clusters/${fixture.clusterId}/images/image-scan/${fixture.imageId}`;
  await page.goto(location);
  await expect(page).toHaveURL(new RegExp(`/private/clusters/${fixture.clusterId}/images/image-scan/${fixture.imageId}`));
  await expect(page.locator('#scanInformation #image-name')).toContainText('alpine:3.21');
  await expect(page.locator('#scanRunState')).toContainText('Latest Trivy scan: completed', {timeout: 20_000});
  await expect(page.locator('#scanRunState')).toContainText(
    fixture.compliant ? 'Result: Compliant' : 'Result: Non-compliant'
  );
  await expect(page.locator('#scannerComplianceList')).toBeVisible();
  await expect(page.locator('#scannerComplianceList mat-row').first()).toBeVisible();
  await expect(page.locator('#scannerError')).toHaveCount(0);
});

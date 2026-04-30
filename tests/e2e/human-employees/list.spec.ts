import { expect, test } from '../screenshot-fixture'

test('human employees page renders', async ({ page }) => {
  // Super-admin session is provisioned via projects[].use.storageState.
  await page.goto('/human-employees')
  await expect(page.locator('body')).toBeVisible()
})

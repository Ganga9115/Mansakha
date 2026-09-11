const { test, expect } = require('@playwright/test');

test.describe('Loading State Verification', () => {
  // Run this test 5 times per worker to simulate high load/concurrency
  // as per the 5x speed requirement.
  for (let i = 1; i <= 5; i++) {
    test(`Verify app does not get stuck in infinite loading (Session ${i})`, async ({ page }) => {
      // 1. Navigate to the app
      await page.goto('/');

      // 2. We should see the Login Screen.
      // Fill out the user login form
      await page.fill('input[placeholder="Docket ID"]', 'DUMMY-0001');
      await page.fill('input[placeholder="Full Name"]', 'Dummy User');
      await page.fill('input[placeholder="Mobile Number"]', '1234567890');
      await page.fill('input[placeholder="Password"]', 'User1234');

      // 3. Click Login
      // This triggers the API call which previously caused infinite loading if it failed
      await page.click('text="Sign in now"');

      // 4. Assert that the "Signing In..." spinner appears
      await expect(page.locator('text="Signing In..."')).toBeVisible({ timeout: 5000 });

      // 5. CRUCIAL ASSERTION: The loading state MUST disappear. 
      // It should not get stuck. If the network fails or succeeds, 
      // it must recover (either showing an error toast or transitioning to the Dashboard).
      await expect(page.locator('text="Signing In..."')).toBeHidden({ timeout: 15000 });

      // 6. Verify we are no longer stuck on a blank/loading screen
      // Either we see an error message toast (if dummy credentials failed), or we see the Dashboard.
      const isErrorVisible = await page.locator('text="No matching record found"').isVisible();
      const isDashboardVisible = await page.locator('text="Dashboard"').isVisible();
      const isPasswordResetVisible = await page.locator('text="Create New Password"').isVisible();

      expect(isErrorVisible || isDashboardVisible || isPasswordResetVisible).toBeTruthy();
    });
  }
});

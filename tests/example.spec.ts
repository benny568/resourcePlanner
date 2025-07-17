import { test, expect } from '@playwright/test'

test('homepage loads and displays title', async ({ page }) => {
  await page.goto('/')

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Resource Planner/)

  // Expect the main heading to be visible
  await expect(page.getByRole('heading', { name: 'Resource Planner' })).toBeVisible()
})

test('counter functionality works', async ({ page }) => {
  await page.goto('/')

  // Click the counter button
  const button = page.getByRole('button', { name: /count is 0/i })
  await button.click()

  // Expect the counter to increment
  await expect(page.getByRole('button', { name: /count is 1/i })).toBeVisible()
}) 
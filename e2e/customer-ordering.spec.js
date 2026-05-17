import { expect, test } from '@playwright/test';

const orderId = '11111111-1111-1111-1111-111111111111';
const paymentId = '22222222-2222-2222-2222-222222222222';

test('customer can place an order and receives a protected receipt link', async ({ page }) => {
  let submittedOrder = null;

  await mockCustomerApis(page, {
    onOrder: async (request) => {
      submittedOrder = await request.postDataJSON();
    },
  });

  await page.goto('/t/T01');

  await expect(page.getByText('Fish Amok')).toBeVisible();
  await page.getByRole('button', { name: /Customize Fish Amok/i }).click();
  await page.getByRole('button', { name: /Add to cart ·/i }).click();
  const placeOrderButton = page.getByRole('button', { name: /Place Order/i }).filter({ visible: true });
  if ((await placeOrderButton.count()) === 0) {
    await page.getByRole('button', { name: /1 item/i }).click();
  }
  await page.getByRole('button', { name: /Place Order/i }).filter({ visible: true }).click();

  await expect(page.getByText('PAY-9001', { exact: true })).toBeVisible();
  expect(submittedOrder).toMatchObject({
    tableNumber: 'T01',
    items: [{ menuItemId: '33333333-3333-3333-3333-333333333333', quantity: 1 }],
  });
});

test('customer can track an order and keep adding food after checkout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCustomerApis(page);

  await page.goto('/t/T01');

  await page.getByRole('button', { name: /Customize Fish Amok/i }).click();
  await page.getByRole('button', { name: /Add to cart ·/i }).click();
  await page.getByRole('button', { name: /1 items/i }).click();
  await page.getByRole('button', { name: /Place Order/i }).click();
  await expect(page.getByText('PAY-9001', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await expect(page.getByRole('button', { name: /Order status/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /View cart/i })).toBeVisible();

  await page.getByRole('button', { name: /Customize Fish Amok/i }).click();
  await page.getByRole('button', { name: /Add to cart ·/i }).click();

  await expect(page.getByRole('button', { name: /Order status/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /1 items/i })).toBeVisible();

  await page.getByRole('button', { name: /Order status/i }).click();
  await expect(page.getByText('HB-2001').last()).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: /1 items/i }).click();
  await expect(page.getByRole('heading', { name: /Your Order/i })).toBeVisible();
});

test('promo code applies on enter without an apply button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let promoRequestUrl = '';

  await mockCustomerApis(page, {
    onPromo: async (request) => {
      promoRequestUrl = request.url();
    },
  });

  await page.goto('/t/T01');

  await page.getByRole('button', { name: /Customize Fish Amok/i }).click();
  await page.getByRole('button', { name: /Add to cart ·/i }).click();
  await page.getByRole('button', { name: /1 items/i }).click();

  await expect(page.getByRole('button', { name: /^Apply$/i })).toHaveCount(0);
  const promoInput = page.getByPlaceholder('Promo code').last();
  await promoInput.fill('SAVE10');
  await promoInput.press('Enter');

  await expect(page.getByText('Promo code applied.').nth(1)).toBeVisible();
  expect(promoRequestUrl).toContain('/api/customer/promos/SAVE10/validate');
});

test('receipt page sends the customer access token to order and pdf APIs', async ({ page }) => {
  let orderRequestUrl = '';

  await page.route(`**/api/customer/orders/${orderId}?**`, async (route) => {
    orderRequestUrl = route.request().url();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: orderId,
        orderNumber: 'HB-2001',
        tableNumber: 'T01',
        status: 'PAID',
        paymentStatus: 'PAID',
        createdAt: '2026-05-15T08:00:00Z',
        paidAt: '2026-05-15T08:01:00Z',
        subtotalUsd: 7.5,
        discountUsd: 0,
        totalUsd: 7.5,
        totalKhr: 30750,
        customerAccessToken: 'receipt-secret',
        items: [],
      }),
    });
  });

  await page.goto(`/receipt/${orderId}?accessToken=receipt-secret`);

  await expect(page.getByRole('heading', { name: /Customer Receipt/i })).toBeVisible();
  expect(orderRequestUrl).toContain('accessToken=receipt-secret');
  await expect(page.getByRole('link', { name: /Export PDF/i })).toHaveAttribute(
    'href',
    new RegExp(`/api/receipts/orders/${orderId}\\.pdf\\?accessToken=receipt-secret`)
  );
});

async function mockCustomerApis(page, { onOrder, onPromo } = {}) {
  await page.route('**/api/customer/tables/T01', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'table-1',
        tableNumber: 'T01',
        label: 'Table 1',
        active: true,
      }),
    });
  });

  await page.route('**/api/customer/menu', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        exchangeRateKhrPerUsd: 4100,
        categories: [{ id: 'cat-1', name: 'Khmer Favorites', slug: 'khmer-favorites' }],
        items: [
          {
            id: '33333333-3333-3333-3333-333333333333',
            categoryId: 'cat-1',
            name: 'Fish Amok',
            description: 'Classic coconut curry.',
            priceUsd: 7.5,
            priceKhr: 30750,
            available: true,
            dietaryTags: 'local,mild',
          },
        ],
        addons: [],
        options: [],
        sizeLevels: [],
      }),
    });
  });

  await page.route('**/api/customer/orders', async (route) => {
    await onOrder?.(route.request());
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: orderId,
        orderNumber: 'HB-2001',
        tableNumber: 'T01',
        status: 'PENDING_PAYMENT',
        totalUsd: 7.5,
        totalKhr: 30750,
        customerAccessToken: 'customer-secret',
        items: [
          {
            id: 'item-1',
            itemName: 'Fish Amok',
            quantity: 1,
            unitPriceUsd: 7.5,
            subtotalUsd: 7.5,
            addons: [],
          },
        ],
      }),
    });
  });

  await page.route('**/api/customer/orders/statuses', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: orderId,
          orderNumber: 'HB-2001',
          tableNumber: 'T01',
          status: 'PENDING_PAYMENT',
          totalUsd: 7.5,
          totalKhr: 30750,
          customerAccessToken: 'customer-secret',
          items: [
            {
              id: 'item-1',
              itemName: 'Fish Amok',
              quantity: 1,
              unitPriceUsd: 7.5,
              subtotalUsd: 7.5,
              addons: [],
            },
          ],
        },
      ]),
    });
  });

  await page.route('**/api/customer/promos/*/validate?**', async (route) => {
    await onPromo?.(route.request());
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        valid: true,
        code: 'SAVE10',
        description: '10% off',
        discountType: 'PERCENT',
        discountValue: 10,
        maxDiscountUsd: null,
      }),
    });
  });

  await page.route(`**/api/payments/orders/${orderId}/khqr`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: paymentId,
        orderId,
        paymentNumber: 'PAY-9001',
        amountUsd: 7.5,
        amountKhr: 30750,
        status: 'PENDING',
        khqrString: '00020101021229370012happyboat.test52045812530384054047.505802KH5909HappyBoat6010PhnomPenh6304ABCD',
        expiredAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }),
    });
  });
}

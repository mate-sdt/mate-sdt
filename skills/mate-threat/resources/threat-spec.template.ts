import { test, expect } from '@playwright/test';

/**
 * M.A.T.E. Method — Pillar T (Threat & Trash) Boilerplate
 * Focuses on:
 * 1. High-concurrency race conditions (simultaneous requests in the exact same millisecond via Promise.all)
 * 2. Rapid double-submit / webhook idempotency verification
 * 3. BOLA / IDOR cross-tenant authorization probing
 * 4. Boundary payload fuzzing (SQLi, XSS, Unicode overflow, corrupted timestamps)
 */

test.describe('Pillar T: Threat, Concurrency & Adversarial Suite @threats @security', () => {
  test('THR-01: High-concurrency race condition on inventory/balance [THR-01]', async ({ request }) => {
    // Fire 5 identical purchase requests at the exact same millisecond
    const payload = { itemId: 'item-last-unit', quantity: 1 };
    const requests = Array.from({ length: 5 }, () =>
      request.post('/api/orders', {
        data: payload,
        headers: { 'X-Idempotency-Key': `race-${Date.now()}` },
      })
    );

    const responses = await Promise.all(requests);
    const statuses = responses.map((r) => r.status());

    // Invariant: Exactly 1 request succeeds (201/200), remaining 4 must fail with 409 Conflict or 422
    const successes = statuses.filter((s) => s === 201 || s === 200);
    const conflicts = statuses.filter((s) => s === 409 || s === 422);

    expect(successes.length, 'Only 1 concurrent order must succeed').toBe(1);
    expect(conflicts.length, 'Other 4 requests must fail with conflict/exhaustion').toBe(4);
  });

  test('THR-02: Sub-50ms rapid double-click idempotency [THR-02]', async ({ request }) => {
    const idempotencyKey = `double-click-${Date.now()}`;
    const payload = { amount: 100, currency: 'USD' };

    // Fire two requests with identical idempotency key simultaneously
    const [res1, res2] = await Promise.all([
      request.post('/api/payments', { data: payload, headers: { 'Idempotency-Key': idempotencyKey } }),
      request.post('/api/payments', { data: payload, headers: { 'Idempotency-Key': idempotencyKey } }),
    ]);

    expect(res1.status()).toBe(201);
    // Second request must either return 200 with same body or 409 Conflict, but never create a duplicate charge
    expect([200, 201, 409]).toContain(res2.status());
  });

  test('THR-03: Boundary & payload fuzzing rejection [THR-03]', async ({ request }) => {
    const maliciousPayloads = [
      { name: '<script>alert("xss")</script>', amount: 100 },
      { name: "'; DROP TABLE orders; --", amount: 100 },
      { name: 'Normal Name', amount: -50 }, // Negative boundary
      { name: 'A'.repeat(10000), amount: 100 }, // Buffer overflow attempt
      { name: '🔥👕🎉'.repeat(500), amount: 100 }, // Unicode stress
    ];

    for (const data of maliciousPayloads) {
      const response = await request.post('/api/orders', { data });
      // Invariant: System must reject with 400/422 and NEVER leak 500 or stack traces
      expect(
        [400, 422].includes(response.status()),
        `Expected 400/422 for payload ${JSON.stringify(data)} but got ${response.status()}`
      ).toBe(true);

      const bodyText = await response.text();
      expect(bodyText).not.toContain('node_modules');
      expect(bodyText).not.toContain('stack');
      expect(bodyText).not.toContain('Trace:');
    }
  });

  test('THR-04: BOLA / IDOR cross-tenant access probe [THR-04]', async ({ request }) => {
    // Tenant A resource accessed with Tenant B credentials
    const response = await request.get('/api/orders/tenant-a-order-999', {
      headers: {
        Authorization: 'Bearer tenant-b-token',
      },
    });

    // Invariant: Must return 403 Forbidden or 404 Not Found (never 200 or 500)
    expect([403, 404]).toContain(response.status());
  });
});

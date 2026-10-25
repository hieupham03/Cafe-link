import { expect } from '@playwright/test';

// Setup barrier, before warmup/measurement. Never retry or hide an operation error.
export async function waitForGuestReady(page) {
  const began=performance.now();
  await expect(page.getByRole('button',{name:'Thêm Cà phê sữa',exact:true})).toBeEnabled({timeout:15000});
  return performance.now()-began;
}

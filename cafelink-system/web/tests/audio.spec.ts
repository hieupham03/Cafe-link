import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function open(page: Page, mode: "pending" | "blocked") {
  await page.addInitScript((initial) => {
    const state = window as unknown as Window & { audioMode: string; audioClosed: number };
    state.audioMode = initial; state.audioClosed = 0;
    class ControlledAudio {
      state = "suspended";
      resume() {
        if (state.audioMode === "pending") return new Promise<void>(() => {});
        if (state.audioMode === "blocked") return Promise.reject(new Error("Audio permission denied"));
        this.state = "running"; return Promise.resolve();
      }
      close() { this.state = "closed"; state.audioClosed++; return Promise.resolve(); }
    }
    Object.defineProperty(window, "AudioContext", { configurable: true, value: ControlledAudio });
  }, mode);
  await page.goto("/admin");
  await page.getByLabel("Tài khoản", { exact: true }).fill("admin");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("CafeLink@123");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kích hoạt chuông quầy", exact: true })).toBeVisible();
}

test("bật âm bị treo có thời hạn, đóng context lỗi và vẫn đọc thông báo", async ({ page }) => {
  await open(page, "pending");
  await page.getByRole("button", { name: "Kích hoạt chuông quầy", exact: true }).click();
  const warning = page.getByRole("status", { name: "Cảnh báo âm thanh" });
  await expect(warning).toContainText("Thông báo chữ vẫn được cập nhật", { timeout: 4500 });
  await expect(page.getByRole("button", { name: "Kích hoạt chuông quầy", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as Window & { audioClosed: number }).audioClosed)).toBe(1);
  await page.getByRole("button", { name: /Thông báo,.*chưa đọc/ }).click();
  await expect(page.getByRole("dialog", { name: "Trung tâm thông báo" })).toBeVisible();
  await expect(warning).toBeVisible();
});

test("cảnh báo âm không bị polling xóa, thử lại được và đăng xuất đóng context", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await open(page, "blocked");
  await page.getByRole("button", { name: "Kích hoạt chuông quầy", exact: true }).click();
  const warning = page.getByRole("status", { name: "Cảnh báo âm thanh" });
  await expect(warning).toBeVisible();
  await page.waitForTimeout(3500);
  await expect(warning).toBeVisible();
  await page.evaluate(() => { (window as unknown as Window & { audioMode: string }).audioMode = "running"; });
  await page.getByRole("button", { name: "Kích hoạt chuông quầy", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tắt chuông quầy", exact: true })).toBeVisible();
  await expect(warning).toHaveCount(0);
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Đăng nhập quản lý" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as Window & { audioClosed: number }).audioClosed)).toBe(2);
  expect(errors).toEqual([]);
});

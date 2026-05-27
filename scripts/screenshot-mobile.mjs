import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';

const OUT = 'C:/Users/hp/Desktop/Voice-Ustad/screenshots';
mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: false });
  console.log('Saved:', name);
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  // Desktop view
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dp = await desk.newPage();
  await dp.goto('http://localhost:3001/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await dp.waitForTimeout(2000);
  await shot(dp, 'dash-desktop.png');
  await dp.evaluate(() => window.scrollTo(0, 500));
  await dp.waitForTimeout(300);
  await shot(dp, 'dash-desktop-tabs.png');
  await desk.close();

  // Mobile view
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mp = await mob.newPage();
  await mp.goto('http://localhost:3001/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await mp.waitForTimeout(2000);
  await shot(mp, 'dash-mobile.png');
  await mob.close();

  await browser.close();
  console.log('Done');
}
run().catch(e => { console.error(e); process.exit(1); });

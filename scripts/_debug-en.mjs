#!/usr/bin/env node
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const id = process.argv[2] || '0uCCBpmg6MrPb1KY2msceF';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setExtraHTTPHeaders({
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const res = await page.goto(`https://everynoise.com/artistprofile.cgi?id=${id}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
console.log('status:', res.status());
await page.waitForTimeout(2000);
const html = await page.content();
writeFileSync('debug-en.html', html);
console.log('length:', html.length);
console.log(html.slice(0, 3000));
await browser.close();

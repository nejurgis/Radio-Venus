#!/usr/bin/env node
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import https from 'node:https';

const id = process.argv[2] || '0uCCBpmg6MrPb1KY2msceF';

function plainGet(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

console.log('=== plain https.get, browser-like UA ===');
try {
  const r1 = await plainGet(`https://everynoise.com/artistprofile.cgi?id=${id}`, {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html',
  });
  console.log('status:', r1.status, 'length:', r1.body.length);
  console.log(r1.body.slice(0, 500));
} catch (e) { console.log('error:', e.message); }

console.log('\n=== plain https.get, RadioVenus UA (like en-discover.mjs uses for wikidata/etc) ===');
try {
  const r2 = await plainGet(`https://everynoise.com/artistprofile.cgi?id=${id}`, {
    'User-Agent': 'RadioVenus/1.0 (music discovery)',
  });
  console.log('status:', r2.status, 'length:', r2.body.length);
  console.log(r2.body.slice(0, 500));
} catch (e) { console.log('error:', e.message); }

console.log('\n=== playwright, homepage first then profile (warm session/cookies) ===');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setExtraHTTPHeaders({
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
try {
  const home = await page.goto('https://everynoise.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('homepage status:', home.status());
  await page.waitForTimeout(1500);
  const res = await page.goto(`https://everynoise.com/artistprofile.cgi?id=${id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('profile status (after homepage warm-up):', res.status());
  const html = await page.content();
  writeFileSync('debug-en.html', html);
  console.log('length:', html.length);
  console.log(html.slice(0, 1500));
} catch (e) { console.log('error:', e.message); }
await browser.close();

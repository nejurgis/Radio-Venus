#!/usr/bin/env node
import https from 'node:https';

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const id = '0uCCBpmg6MrPb1KY2msceF';

async function probe(label, url, headers) {
  try {
    const r = await get(url, headers);
    console.log(`\n--- ${label} ---`);
    console.log('status:', r.status);
    console.log('server:', r.headers['server'], '| cf-ray:', r.headers['cf-ray'], '| via:', r.headers['via']);
    console.log('body[0:200]:', r.body.slice(0, 200).replace(/\n/g, ' '));
  } catch (e) {
    console.log(`\n--- ${label} ---\nerror:`, e.message);
  }
}

await probe('robots.txt', 'https://everynoise.com/robots.txt', { 'User-Agent': UA });
await probe('homepage', 'https://everynoise.com/', { 'User-Agent': UA });
await probe('artistprofile.cgi', `https://everynoise.com/artistprofile.cgi?id=${id}`, { 'User-Agent': UA });
await probe('research.cgi (name search)', `https://everynoise.com/research.cgi?name=Burial&mode=artist`, { 'User-Agent': UA });
await probe('everynoise1d.cgi (main genre chart)', 'https://everynoise.com/everynoise1d.cgi?scope=all', { 'User-Agent': UA });
await probe('artistprofile.cgi, Googlebot UA', `https://everynoise.com/artistprofile.cgi?id=${id}`, {
  'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
});
await probe('artistprofile.cgi, no UA at all', `https://everynoise.com/artistprofile.cgi?id=${id}`, {});
await probe('artistprofile.cgi, trailing slash variant', `https://everynoise.com/artistprofile.cgi/?id=${id}`, { 'User-Agent': UA });

// Vercel Serverless Function — Redash Proxy
// Forwards requests to Redash and adds the API key server-side
// Deployed at: /api/redash

const https = require('https');
const http  = require('http');

const API_KEY    = 'yxqnSo7sT97kxbSPTFKDI0OvjRnMGroE1NGyySTc';
const REDASH_HOST = 'redashv3.getpowerplay.in';
const QUERY_ID    = '1468';

module.exports = async (req, res) => {
  // CORS — allow all origins so the browser can call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Build query string — pass through any parameters from the request
  const qs = new URLSearchParams(req.query || {});
  qs.set('api_key', API_KEY);

  const redashPath = `/api/queries/${QUERY_ID}/results.json?${qs.toString()}`;

  try {
    const data = await fetchRedash(REDASH_HOST, redashPath);
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};

function fetchRedash(host, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      path: path,
      method: 'GET',
      headers: { 'User-Agent': 'TrainerDrillDownDashboard/1.0' }
    };

    const lib = host.startsWith('https') ? https : https; // always https
    const req = https.request(options, (resp) => {
      let body = '';
      resp.on('data', chunk => body += chunk);
      resp.on('end', () => resolve(body));
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Redash timeout')); });
    req.end();
  });
}

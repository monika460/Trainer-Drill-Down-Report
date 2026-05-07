// Vercel Serverless Function — Redash Proxy
// Forwards browser requests to Redash, adds API key server-side
// Endpoint: GET /api/redash?p_renewal_start=...&p_renewal_end=...

const https = require('https');

const API_KEY     = 'yxqnSo7sT97kxbSPTFKDI0OvjRnMGroE1NGyySTc';
const REDASH_HOST = 'redashv3.getpowerplay.in';
const QUERY_ID    = '1468';

module.exports = async (req, res) => {
  // CORS headers — allow any origin so browser can call this from Vercel domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Pass through any query params the browser sent (e.g. p_renewal_start, p_renewal_end)
  const qs = new URLSearchParams(req.query || {});
  qs.set('api_key', API_KEY);

  const redashPath = `/api/queries/${QUERY_ID}/results.json?${qs.toString()}`;

  try {
    const body = await fetchFromRedash(REDASH_HOST, redashPath);
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(body);
  } catch (err) {
    console.error('Redash proxy error:', err.message);
    res.status(502).json({ error: err.message });
  }
};

function fetchFromRedash(host, path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: host, path, method: 'GET', headers: { 'User-Agent': 'TrainerDrillDown/1.0' } },
      (resp) => {
        const chunks = [];
        resp.on('data', c => chunks.push(c));
        resp.on('end', () => resolve(Buffer.concat(chunks).toString()));
        resp.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Redash request timed out')); });
    req.end();
  });
}

// Vercel Serverless Function — Redash Proxy
// Uses api_key as query param (standard Redash auth)
// Handles job polling when Redash returns a pending job

const https = require('https');

const API_KEY     = process.env.REDASH_API_KEY || 'yxqnSo7sT97kxbSPTFKDI0OvjRnMGroE1NGyySTc';
const REDASH_HOST = process.env.REDASH_HOST    || 'redashv3.getpowerplay.in';
const QUERY_ID    = '1468';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    // Build GET params — api_key plus any renewal date params from browser
    const qs = new URLSearchParams();
    qs.set('api_key', API_KEY);
    const extraParams = req.query || {};
    for (const [k, v] of Object.entries(extraParams)) {
      if (k !== 'api_key') qs.set(k, v);
    }
    // Defaults if browser didn't send them
    if (!qs.has('p_renewal_start')) qs.set('p_renewal_start', '2026-04-01');
    if (!qs.has('p_renewal_end'))   qs.set('p_renewal_end',   '2030-04-30');

    // Step 1: GET cached results
    const getPath = `/api/queries/${QUERY_ID}/results.json?${qs.toString()}`;
    const rawGet  = await httpsGet(REDASH_HOST, getPath);
    const getJson = JSON.parse(rawGet);

    // Got results directly (cached hit)
    if (getJson.query_result && getJson.query_result.data) {
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json(getJson);
      return;
    }

    // Got a job — need to poll
    if (getJson.job) {
      const jobId = getJson.job.id;
      const result = await pollJob(jobId, qs);
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json({ query_result: result });
      return;
    }

    // Unexpected shape — return raw for debugging
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(rawGet);

  } catch (err) {
    console.error('[redash-proxy] error:', err.message);
    res.status(502).json({
      error: err.message,
      hint: 'Check that redashv3.getpowerplay.in is publicly accessible from Vercel cloud.'
    });
  }
};

// Poll /api/jobs/{id} until done, then fetch results
async function pollJob(jobId, qs, maxAttempts = 20, intervalMs = 2500) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(i === 0 ? 800 : intervalMs);

    const raw  = await httpsGet(REDASH_HOST, `/api/jobs/${jobId}?api_key=${qs.get('api_key')}`);
    const json = JSON.parse(raw);
    const job  = json.job;

    if (!job) throw new Error('Unexpected job response: ' + raw.slice(0, 300));

    // 1=pending 2=started 3=success 4=failure 5=cancelled
    if (job.status === 3) {
      const qrId = job.query_result_id;
      if (!qrId) throw new Error('Job done but no query_result_id');
      const qrRaw  = await httpsGet(REDASH_HOST, `/api/query_results/${qrId}?api_key=${qs.get('api_key')}`);
      const qrJson = JSON.parse(qrRaw);
      return qrJson.query_result;
    }
    if (job.status === 4) throw new Error('Redash query failed: ' + (job.error || 'unknown'));
    if (job.status === 5) throw new Error('Redash query was cancelled');
    // else still running — keep polling
  }
  throw new Error('Redash query timed out after polling');
}

function httpsGet(host, path) {
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
    req.setTimeout(20000, () => { req.destroy(); reject(new Error(`HTTPS timeout connecting to ${host}`)); });
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Vercel Serverless Function — Redash Proxy
// Redash has no cached result, so we POST to trigger a fresh run,
// then poll the job until complete and return the data.

const https = require('https');

const API_KEY     = process.env.REDASH_API_KEY || 'yxqnSo7sT97kxbSPTFKDI0OvjRnMGroE1NGyySTc';
const REDASH_HOST = process.env.REDASH_HOST    || 'redashv3.getpowerplay.in';
const QUERY_ID    = '1468';

// Query parameters (match what you use in Redash UI)
const DEFAULT_PARAMS = {
  renewal_start: '2026-04-01',
  renewal_end:   '2030-04-30'
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    // Step 1: POST to /api/queries/{id}/results to trigger a fresh execution
    // Redash expects parameters WITHOUT the "p_" prefix in the POST body
    const postBody = JSON.stringify({
      parameters: DEFAULT_PARAMS,
      max_age: 1800  // use cached result if less than 30 min old, else re-run
    });

    const postRaw  = await redashRequest('POST', `/api/queries/${QUERY_ID}/results`, postBody);
    const postJson = JSON.parse(postRaw);

    // Case A: Got results immediately (from cache)
    if (postJson.query_result && postJson.query_result.data) {
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json(postJson);
      return;
    }

    // Case B: Got a job — poll until done
    if (postJson.job) {
      const result = await pollJob(postJson.job.id);
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json({ query_result: result });
      return;
    }

    // Unexpected — return raw so dashboard can show it
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(postRaw);

  } catch (err) {
    console.error('[redash-proxy]', err.message);
    res.status(502).json({ error: err.message });
  }
};

// Poll /api/jobs/{id} every 3s until status=3 (done)
async function pollJob(jobId, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(i === 0 ? 1500 : 3000);

    const raw  = await redashRequest('GET', `/api/jobs/${jobId}`);
    const json = JSON.parse(raw);
    const job  = json.job;

    if (!job) throw new Error('Unexpected job response: ' + raw.slice(0, 300));

    // 1=pending 2=started 3=success 4=failure 5=cancelled
    if (job.status === 3) {
      const qrId = job.query_result_id;
      if (!qrId) throw new Error('Job succeeded but no query_result_id');
      const qrRaw  = await redashRequest('GET', `/api/query_results/${qrId}`);
      const qrJson = JSON.parse(qrRaw);
      if (!qrJson.query_result) throw new Error('query_results response missing query_result: ' + qrRaw.slice(0,300));
      return qrJson.query_result;
    }
    if (job.status === 4) throw new Error('Redash query failed: ' + (job.error || 'unknown'));
    if (job.status === 5) throw new Error('Redash query cancelled');
    // 1 or 2: still running — keep polling
  }
  throw new Error('Query timed out after polling');
}

// Generic HTTPS helper — always sends api_key as query param
function redashRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    // Append api_key to every request
    const sep  = path.includes('?') ? '&' : '?';
    const fullPath = path + sep + 'api_key=' + encodeURIComponent(API_KEY);

    const headers = { 'User-Agent': 'TrainerDrillDown/1.0' };
    let bodyBuf;
    if (body) {
      bodyBuf = Buffer.from(body, 'utf8');
      headers['Content-Type']   = 'application/json';
      headers['Content-Length'] = bodyBuf.length;
    }

    const req = https.request(
      { hostname: REDASH_HOST, path: fullPath, method, headers },
      (resp) => {
        const chunks = [];
        resp.on('data', c => chunks.push(c));
        resp.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        resp.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(25000, () => { req.destroy(); reject(new Error('Request timeout to ' + REDASH_HOST)); });
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

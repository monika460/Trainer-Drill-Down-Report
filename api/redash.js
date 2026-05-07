// Vercel Serverless Function — Redash Proxy with Job Polling
// Redash often returns a {"job": {...}} on first call instead of results.
// This proxy handles that by polling until the job completes.

const https = require('https');

const API_KEY     = 'yxqnSo7sT97kxbSPTFKDI0OvjRnMGroE1NGyySTc';
const REDASH_HOST = 'redashv3.getpowerplay.in';
const QUERY_ID    = '1468';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    // Pass through any params the browser sent (p_renewal_start, p_renewal_end, etc.)
    const extraParams = req.query || {};

    // Step 1: POST to trigger a fresh query execution with parameters
    const postBody = JSON.stringify({
      parameters: buildParameters(extraParams),
      max_age: 0  // 0 = always run fresh; set to 3600 to use 1-hour cache
    });

    const postResp = await request('POST', `/api/queries/${QUERY_ID}/results`, postBody);
    const postJson = JSON.parse(postResp);

    // Step 2: If we got a job, poll until done
    if (postJson.job) {
      const jobId = postJson.job.id;
      const result = await pollJob(jobId);
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json({ query_result: result });
      return;
    }

    // Step 3: Got results directly (cached)
    if (postJson.query_result) {
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json(postJson);
      return;
    }

    // Fallback: return whatever we got
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(postResp);

  } catch (err) {
    console.error('Redash proxy error:', err.message);
    res.status(502).json({ error: err.message });
  }
};

// Poll /api/jobs/{id} until status is done (3) or failed (4)
async function pollJob(jobId, maxAttempts = 30, intervalMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(i === 0 ? 1000 : intervalMs); // shorter wait on first try

    const body = await request('GET', `/api/jobs/${jobId}`);
    const json = JSON.parse(body);
    const job  = json.job;

    if (!job) throw new Error('Unexpected job response: ' + body.slice(0, 200));

    // status: 1=pending, 2=started, 3=success, 4=failure, 5=cancelled
    if (job.status === 3) {
      // Job done — fetch the query result
      const qrId = job.query_result_id;
      if (!qrId) throw new Error('Job succeeded but no query_result_id returned');
      const qrBody = await request('GET', `/api/query_results/${qrId}`);
      const qrJson = JSON.parse(qrBody);
      return qrJson.query_result;
    }

    if (job.status === 4) throw new Error('Redash query failed: ' + (job.error || 'unknown error'));
    if (job.status === 5) throw new Error('Redash query was cancelled');
    // status 1 or 2: still running, keep polling
  }
  throw new Error('Redash query timed out after polling');
}

// Build the parameters object Redash expects for POST body
function buildParameters(queryParams) {
  const params = {};
  for (const [key, val] of Object.entries(queryParams)) {
    // Strip leading "p_" if browser sent it that way, or use as-is
    const name = key.startsWith('p_') ? key.slice(2) : key;
    params[name] = val;
  }
  // Defaults if not provided
  if (!params.renewal_start) params.renewal_start = '2026-04-01';
  if (!params.renewal_end)   params.renewal_end   = '2030-04-30';
  return params;
}

// Generic HTTPS request helper
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent'  : 'TrainerDrillDown/1.0',
      'Authorization': `Key ${API_KEY}`,
    };
    if (body) {
      headers['Content-Type']   = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(
      { hostname: REDASH_HOST, path, method, headers },
      (resp) => {
        const chunks = [];
        resp.on('data', c => chunks.push(c));
        resp.on('end', () => resolve(Buffer.concat(chunks).toString()));
        resp.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(25000, () => { req.destroy(); reject(new Error('Request timed out')); });
    if (body) req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

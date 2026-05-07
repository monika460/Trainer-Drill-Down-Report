// Debug endpoint — returns the raw Redash response so we can see the structure
// Visit: https://your-vercel-url.vercel.app/api/debug

const https = require('https');

const API_KEY     = process.env.REDASH_API_KEY || 'yxqnSo7sT97kxbSPTFKDI0OvjRnMGroE1NGyySTc';
const REDASH_HOST = process.env.REDASH_HOST    || 'redashv3.getpowerplay.in';
const QUERY_ID    = '1468';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const path = `/api/queries/${QUERY_ID}/results.json?api_key=${API_KEY}&p_renewal_start=2026-04-01&p_renewal_end=2030-04-30`;
    const raw  = await httpsGet(REDASH_HOST, path);

    let parsed;
    try { parsed = JSON.parse(raw); } catch(e) { parsed = { raw_string: raw.slice(0, 2000) }; }

    // Show structure summary + first row sample
    const summary = {
      top_level_keys: Object.keys(parsed),
      has_query_result: !!parsed.query_result,
      has_job: !!parsed.job,
      job_status: parsed.job?.status,
      job_id: parsed.job?.id,
      data_keys: parsed.query_result ? Object.keys(parsed.query_result.data || {}) : null,
      columns_count: parsed.query_result?.data?.columns?.length,
      rows_count: parsed.query_result?.data?.rows?.length,
      first_column_names: parsed.query_result?.data?.columns?.slice(0,10).map(c=>c.name),
      first_row_sample: parsed.query_result?.data?.rows?.[0],
      raw_preview: raw.slice(0, 1000),
    };

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(summary);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

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
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

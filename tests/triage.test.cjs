const assert = require('node:assert/strict');
const {test}=require('node:test');
const handler=require('../api/triage.js');
const labels=(overrides={})=>({gate:'OUTAGE',specialist:'Engineer',why:'Invoices are halted.',nextStep:'You assign an engineer.',confidence:95,scores:{F:4,U:5,I:5,R:4,S:2,G:1},...overrides});
const body={client:'Synthetic test account',acv:85,message:'Invoices are frozen and suppliers remain unpaid.'};
test('server input, provider failures, strict output validation, and safe responses', async t => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const fakeKey = 'synthetic-test-credential';
  process.env.GEMINI_API_KEY = fakeKey;
  async function request(requestBody = body, method = 'POST') {
    const res = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await handler({ method, body: requestBody }, res);
    return res;
  }
  try {
    await t.test('rejects unsupported methods before a model call', async () => {
      global.fetch = () => { throw new Error('Unexpected model call'); };
      const res = await request(body, 'GET');
      assert.equal(res.statusCode, 405);
      assert.equal(res.headers.Allow, 'POST');
    });
    await t.test('rejects malformed and out-of-range requests', async () => {
      let calls = 0;
      global.fetch = () => { calls++; throw new Error('Unexpected model call'); };
      for (const invalid of ['{', null, [], { ...body, message: '' }, { ...body, message: 'x'.repeat(3001) }, { ...body, acv: -1 }, { ...body, acv: '85' }, { ...body, client: 'x'.repeat(121) }]) {
        assert.equal((await request(invalid)).statusCode, 400);
      }
      assert.equal(calls, 0);
    });
    await t.test('reports missing server configuration without revealing a key', async () => {
      delete process.env.GEMINI_API_KEY;
      assert.equal((await request()).statusCode, 503);
      process.env.GEMINI_API_KEY = fakeKey;
    });
    await t.test('sends credentials only in the upstream header and strips extra model properties', async () => {
      global.fetch = async (url, options) => {
        assert.ok(!url.includes(fakeKey));
        assert.equal(options.headers['x-goog-api-key'], fakeKey);
        const upstream = JSON.parse(options.body);
        assert.equal(upstream.generationConfig.responseMimeType, 'application/json');
        assert.ok(upstream.systemInstruction.parts[0].text.includes('untrusted'));
        return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(labels({ engHours: 900, source: 'forged' })) }] } }] }) };
      };
      const res = await request(JSON.stringify(body));
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['Cache-Control'], 'no-store');
      assert.equal(res.body.source, 'vercel-gemini-2.5-flash');
      assert.equal(res.body.engHours, undefined);
      assert.equal(res.body.scores.U, 5);
    });
    await t.test('rejects invalid JSON, scores and missing candidates from the provider', async () => {
      for (const text of ['not JSON', JSON.stringify(labels({ confidence: -1 })), JSON.stringify(labels({ scores: { F: 100 } }))]) {
        global.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
        const res = await request();
        assert.equal(res.statusCode, 502);
        assert.equal(res.body.code, 'INVALID_MODEL_RESPONSE');
      }
      global.fetch = async () => ({ ok: true, json: async () => ({ candidates: [] }) });
      assert.equal((await request()).statusCode, 502);
    });
    await t.test('does not forward provider errors or exception details', async () => {
      global.fetch = async () => ({ ok: false, status: 429, text: async () => fakeKey });
      const rejected = await request();
      assert.equal(rejected.statusCode, 502);
      assert.ok(!JSON.stringify(rejected.body).includes(fakeKey));
      global.fetch = async () => { throw new Error(fakeKey); };
      const failed = await request();
      assert.equal(failed.statusCode, 502);
      assert.ok(!JSON.stringify(failed.body).includes(fakeKey));
    });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});

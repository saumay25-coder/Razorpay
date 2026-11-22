const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const handler = require('../api/triage.js');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
function frontend() {
  const context = vm.createContext({});
  vm.runInContext(script.slice(0, script.indexOf('// ==================== EVENTS')) + '\nglobalThis.app = {state, SCENARIOS, FACTORS, INITIAL_TASKS, MESSAGES, scoreTask, getNormalizedWeights, formatPlainMath, validateClassification, buildAnalyzedTask, localAnalyze, buildCardHTML, escapeHtml, getPriorityGroups, getPortfolioTotals, getCapacitySummary, setAllocation, signalFingerprint, commitParsedTask, balanceWeights, describeScenarioChange, canCopyDraft, getExportPlan};', context);
  return context.app;
}
const labels = (overrides = {}) => ({
  gate: 'OUTAGE', specialist: 'Engineer', why: 'Invoice processing is currently halted.',
  nextStep: 'You assign a Technical Engineer to inspect invoice logs.', confidence: 95,
  scores: { F: 4, U: 5, I: 5, R: 4, S: 2, G: 1 }, ...overrides
});
const body = { client: 'Test Account', acv: 85, message: 'Invoice processing has frozen; suppliers remain unpaid.' };

test('all scenarios keep both emergencies separate and preserve the baseline specialist budgets', () => {
  const app = frontend();
  assert.equal(app.INITIAL_TASKS.length, 7);
  assert.equal(app.INITIAL_TASKS.reduce((sum, task) => sum + task.deal, 0), 380);
  assert.equal(app.INITIAL_TASKS.reduce((sum, task) => sum + task.upside, 0), 60);
  assert.equal(app.state.tasks.reduce((sum, task) => sum + task.engHours, 0), 8);
  assert.equal(app.state.tasks.reduce((sum, task) => sum + task.demoHours, 0), 1);
  for (const scenario of Object.values(app.SCENARIOS)) {
    app.state.weights = { ...scenario.weights };
    assert.ok(Math.abs(Object.values(app.getNormalizedWeights()).reduce((sum, weight) => sum + weight, 0) - 100) < 1e-10);
    assert.equal(app.state.tasks.filter(task => ['OUTAGE', 'PR'].includes(task.gate)).length, 2);
    assert.ok(app.state.tasks.every(task => app.scoreTask(task) >= 1 && app.scoreTask(task) <= 5));
  }
});

test('zero custom weights still produce a valid normalized score', () => {
  const app = frontend();
  app.state.weights = Object.fromEntries(app.FACTORS.map(factor => [factor.key, 0]));
  assert.ok(Math.abs(Object.values(app.getNormalizedWeights()).reduce((sum, value) => sum + value, 0) - 100) < 1e-10);
  assert.ok(app.scoreTask(app.state.tasks[0]) >= 1);
  assert.match(app.formatPlainMath(app.state.tasks[0]), /full-precision/);
});

test('live outage classification reserves engineer hours even when simulator keywords miss it', () => {
  const app = frontend();
  const message = 'Invoice processing has frozen; payments cannot proceed.';
  assert.equal(app.localAnalyze('Test', 85, message).gate, 'NONE');
  const parsed = app.buildAnalyzedTask('Test', 85, message, app.validateClassification(labels()), true);
  assert.equal(parsed.gate, 'OUTAGE');
  assert.equal(parsed.engHours, 2);
  assert.equal(parsed.demoHours, 0);
  assert.equal(app.state.tasks.reduce((sum, task) => sum + task.engHours, 0) + parsed.engHours, 10);
  assert.equal(parsed.confidence, 95);
});

test('public complaints reserve zero engineer hours and demos use the separate demo pool', () => {
  const app = frontend();
  const complaint = app.buildAnalyzedTask('Kabir', 5, 'LinkedIn complaint', labels({ gate: 'PR' }), true);
  assert.equal(complaint.engHours, 0);
  assert.equal(complaint.demoHours, 0);
  assert.match(complaint.owner, /Tier-2 Support/);
  const demo = app.buildAnalyzedTask('Test', 50, 'Please demo the module.', labels({ gate: 'NONE', specialist: 'Demo Specialist' }), true);
  assert.equal(demo.demoHours, 1);
  assert.equal(demo.engHours, 0);
  assert.equal(demo.upside, 0, 'Do not invent a 45 lakh expansion for every demo');
  assert.equal(app.state.tasks.reduce((sum, task) => sum + task.demoHours, 0) + demo.demoHours, 2);
});

test('invalid model labels cannot enter the plan, and model-owned hours are ignored', () => {
  const app = frontend();
  for (const bad of [labels({ gate: 'URGENT' }), labels({ confidence: 101 }), labels({ scores: { F: 6 } }), labels({ scores: { F: '5', U: 5, I: 5, R: 5, S: 5, G: 5 } }), labels({ specialist: 'Any' }), labels({ why: '' })]) {
    assert.throws(() => app.validateClassification(bad));
  }
  const validated = app.validateClassification(labels({ engHours: 500, id: 1, source: 'forged', scores: { ...labels().scores, injected: 99 } }));
  assert.equal(validated.engHours, undefined);
  assert.equal(validated.id, undefined);
  assert.equal(validated.source, undefined);
  assert.equal(validated.scores.injected, undefined);
});

test('explicit expansion affects value labels and known upside without guessing', () => {
  const app = frontend();
  const message = 'Please demo the module. Potential ₹45L expansion if we pilot this month.';
  const classification = app.localAnalyze('Test', 50, message);
  assert.equal(classification.scores.F, 4);
  const task = app.buildAnalyzedTask('Test', 50, message, classification, false);
  assert.equal(task.upside, 45);
  assert.match(task.dealText, /45L stated expansion/);
});

test('older live responses remain compatible without trusting simulator allocation', () => {
  const app = frontend();
  const old = labels();
  delete old.specialist;
  assert.equal(app.validateClassification(old).specialist, 'Engineer');
});

test('private ignored tickets do not become public emergencies and simulator confidence is not fabricated', () => {
  const app = frontend();
  const classification = app.localAnalyze('Small Account', 5, 'My private support ticket has been ignored for 10 days.');
  assert.equal(classification.gate, 'NONE');
  assert.equal(classification.scores.F, 1);
  const task = app.buildAnalyzedTask('Small Account', 5, body.message, classification, false);
  assert.equal(task.confidence, null);
  assert.match(task.evidence, /No model confidence/);
});

test('untrusted model and client text is displayed as text in plan cards', () => {
  const app = frontend();
  const attack = '<img src=x onerror="alert(1)">';
  const task = app.buildAnalyzedTask(attack, 85, attack, labels({ why: attack, nextStep: attack }), true);
  const rendered = app.buildCardHTML({ ...task, score: 4 }, 1, true);
  assert.ok(!rendered.includes('<img'));
  assert.ok(rendered.includes('&lt;img'));
});

test('deal-value comparison preserves the emergency lane and changes only ranked work', () => {
  const app = frontend();
  assert.deepEqual(Array.from(app.getPriorityGroups('smart').ranked, task => task.id), [3, 5, 6, 2, 7]);
  assert.deepEqual(Array.from(app.getPriorityGroups('naive').emergencies, task => task.id), [1, 4]);
  assert.deepEqual(Array.from(app.getPriorityGroups('naive').ranked, task => task.id), [2, 6, 3, 5, 7]);
});

test('executive scenario explains real movements while keeping hours unchanged', () => {
  const app = frontend();
  const previous = Array.from(app.getPriorityGroups().ranked, task => task.id);
  const weights = { ...app.state.weights };
  app.state.weights = { ...app.SCENARIOS.exec.weights };
  assert.deepEqual(Array.from(app.getPriorityGroups().ranked, task => task.id), [6, 3, 5, 2, 7]);
  const change = app.describeScenarioChange(previous, weights);
  assert.match(change, /Orbit Electronics: #3 to #1/);
  assert.match(change, /Executive Importance increased to 15%/);
  assert.equal(app.getCapacitySummary().engineer.used, 8);
});

test('editable allocations affect only the correct specialist and retain unallocated work', () => {
  const app = frontend();
  app.state.triageReviewed = true;
  assert.equal(app.setAllocation(1, 'engineer', 5), true);
  assert.equal(app.state.triageReviewed, false, 'Changed capacity requires a new triage review');
  assert.equal(app.getCapacitySummary().engineer.used, 9);
  assert.equal(app.getCapacitySummary().engineer.overbooked, true);
  assert.equal(app.getCapacitySummary().demo.used, 1);
  assert.equal(app.setAllocation(4, 'engineer', 2), false, 'Support-only task cannot consume engineer hours');
  assert.equal(app.setAllocation(2, 'engineer', 1), false, 'Demo cannot borrow engineer capacity');
  assert.equal(app.setAllocation(6, 'engineer', 0), true);
  assert.ok(app.getCapacitySummary().unallocated.some(task => task.id === 6));
  assert.ok(app.state.tasks.some(task => task.id === 6));
  assert.equal(app.setAllocation(1, 'engineer', -1), false);
  assert.equal(app.setAllocation(1, 'engineer', 1.1), false);
});

test('new triage work requires human approval and cannot be added twice', () => {
  const app = frontend();
  const task = app.buildAnalyzedTask('Test', 85, body.message, labels(), true);
  task.fingerprint = app.signalFingerprint('Test', 85, body.message);
  app.state.parsedTask = task;
  assert.equal(app.commitParsedTask(), false);
  assert.equal(app.state.tasks.length, 7);
  app.state.triageReviewed = true;
  assert.equal(app.commitParsedTask(), true);
  assert.equal(app.state.tasks.length, 8);
  assert.equal(app.getCapacitySummary().engineer.used, 10);
  app.state.parsedTask = { ...task };
  app.state.triageReviewed = true;
  assert.equal(app.commitParsedTask(), false);
  assert.equal(app.state.tasks.length, 8);
  assert.equal(app.signalFingerprint(' Test ', 85, ' Hello   World '), app.signalFingerprint('test', 85, 'hello world'));
});

test('portfolio totals distinguish contract value and expansion without double-counting account messages', () => {
  const app = frontend();
  const totals = app.getPortfolioTotals();
  assert.equal(totals.clients, 12);
  assert.equal(totals.active, 6);
  assert.equal(totals.internal, 1);
  assert.equal(totals.acv, 380);
  assert.equal(totals.upside, 60);
  app.state.tasks.push(app.buildAnalyzedTask('Annam Foods', 120, body.message, labels(), true));
  assert.equal(app.getPortfolioTotals().acv, 380);
  assert.equal(app.getPortfolioTotals().clients, 12);
});

test('balancing all-zero and uneven weights always produces exactly 100 percent', () => {
  const app = frontend();
  for (const values of [[0, 0, 0, 0, 0, 0], [100, 0, 0, 0, 0, 0], [35, 45, 10, 25, 20, 5]]) {
    app.state.weights = Object.fromEntries(app.FACTORS.map((factor, index) => [factor.key, values[index]]));
    app.balanceWeights();
    assert.equal(Object.values(app.state.weights).reduce((sum, value) => sum + value, 0), 100);
    assert.ok(Object.values(app.state.weights).every(value => value >= 0 && value <= 100 && value % 5 === 0));
  }
});

test('draft verification requires all checks and resolved placeholders', () => {
  const app = frontend();
  app.state.msgChecked.sushma = [true, true, true];
  assert.equal(app.canCopyDraft('sushma'), false);
  app.MESSAGES.sushma.text = app.MESSAGES.sushma.text.replace('[VERIFY CALLBACK TIME]', '11:00 AM');
  assert.equal(app.canCopyDraft('sushma'), true);
  app.state.msgChecked.sushma[0] = false;
  assert.equal(app.canCopyDraft('sushma'), false);
});

test('export contains auditable weights, priority groups and separate resource budgets', () => {
  const app = frontend();
  app.setAllocation(1, 'engineer', 5);
  const exported = app.getExportPlan();
  assert.equal(exported.items.length, 7);
  assert.equal(exported.items[0].lane, 'Immediate Emergency');
  assert.equal(exported.items[1].lane, 'Immediate Emergency');
  assert.equal(exported.capacity.engineer.allocated, 9);
  assert.equal(exported.capacity.engineer.overbooked, true);
  assert.equal(exported.capacity.demo.allocated, 1);
  assert.equal(Object.values(exported.normalizedWeights).reduce((sum, weight) => sum + weight, 0), 100);
  assert.equal(exported.externalActionsExecuted, false);
});

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

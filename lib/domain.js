(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Tarang = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 2;
  const FACTORS = [
    { key: 'F', label: 'Deal Value', help: 'Contracted annual value only: 5 = ₹100L+, 4 = ₹70–99L, 3 = ₹40–69L, 2 = above ₹10L and below ₹40L, 1 = ≤₹10L. Unknown values require review.' },
    { key: 'U', label: 'Deadline Urgency', help: '5 immediate; 4 within 72 hours or renewal in under 10 days; 3 this week; 2 routine Friday work; 1 no known deadline.' },
    { key: 'I', label: 'Harm if Delayed', help: '5 external financial or public harm; 4 substantial customer impact; 3 limited disruption; 2 reversible inconvenience; 1 internal administration.' },
    { key: 'R', label: 'Churn Risk', help: '5 active anger or silent near renewal; 4 repeated failure; 3 warning signs; 2 ordinary request; 1 routine administration.' },
    { key: 'S', label: 'Recurring Technical Issue', help: '5 repeated failure; 4 outage prevention; 3 possible systemic debt; 2 one-off issue; 1 no technical recurrence.' },
    { key: 'G', label: 'Growth / Executive Importance', help: '5 explicit expansion or an executive visit next week; 4 strategic signal; 3 retention; 2 limited upside; 1 none. Expansion is counted here, never in Deal Value.' }
  ];
  const SCENARIOS = {
    crisis: { name: 'Crisis Monday', weights: { F: 20, U: 25, I: 25, R: 15, S: 10, G: 5 } },
    renewal: { name: 'Quarter-End Crunch', weights: { F: 30, U: 20, I: 15, R: 20, S: 5, G: 10 } },
    exec: { name: 'Executive Visit Week', weights: { F: 20, U: 15, I: 15, R: 20, S: 15, G: 15 } },
    growth: { name: 'Calm Growth Week', weights: { F: 20, U: 10, I: 10, R: 15, S: 20, G: 25 } }
  };
  const RESOURCES = { technical: { label: 'Technical Account Manager', budget: 8 }, demo: { label: 'Solution Consultant', budget: 1 } };
  const CATEGORIES = ['invoice_outage', 'public_complaint', 'renewal', 'order_updates', 'executive_review', 'expansion', 'technical', 'routine', 'internal'];
  const TERMINAL = ['Closed', 'Cancelled'];
  const STAGES = ['containment', 'rootCause', 'correction', 'recovery', 'monitoring', 'verification'];
  const INVESTIGATION = [
    'What failed immediately before order updates stopped?', 'Are API calls or background jobs failing?',
    'Are events stuck in a queue?', 'Were changes deployed before the incidents?',
    'Are authentication or connection errors present?', 'Are messages being lost or duplicated?',
    'Can missing updates be safely replayed?', 'Is retry handling reliable?',
    'What monitoring would detect recurrence?', 'What evidence proves a permanent fix?'
  ];
  const clone = value => JSON.parse(JSON.stringify(value));
  const clean = (value, max = 3000) => String(value ?? '').trim().slice(0, max);
  const normalized = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const now = () => new Date().toISOString();
  function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
  function requireText(value, label, max = 3000) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail(label + ' is required (maximum ' + max + ' characters).');
    return value.trim();
  }
  function number(value, label, max = 10000) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) fail(label + ' is invalid.');
    return value;
  }
  function id(state, prefix) { state.sequence++; return prefix + '-' + state.sequence; }
  function byId(list, value, label = 'Record') { const item = list.find(row => row.id === value); if (!item) fail(label + ' not found.', 404); return item; }
  function hash(value) { let result = 2166136261; for (const ch of String(value)) result = Math.imul(result ^ ch.charCodeAt(0), 16777619); return (result >>> 0).toString(16); }
  function valueRating(acv) { return acv == null ? 1 : acv >= 100 ? 5 : acv >= 70 ? 4 : acv >= 40 ? 3 : acv > 10 ? 2 : 1; }
  function weights(state) {
    const raw = state.scenarioSettings.weights;
    const sum = FACTORS.reduce((total, factor) => total + raw[factor.key], 0);
    return Object.fromEntries(FACTORS.map(factor => [factor.key, sum ? raw[factor.key] / sum * 100 : 100 / 6]));
  }
  function score(state, issue) {
    const w = weights(state);
    return Number(FACTORS.reduce((total, factor) => total + issue.ratings[factor.key] * w[factor.key] / 100, 0).toFixed(2));
  }
  const emergency = issue => ['OUTAGE', 'PR'].includes(issue.emergencyType) && !TERMINAL.includes(issue.status);
  function priorities(state, mode = state.scenarioSettings.comparison) {
    const open = state.issues.filter(issue => !TERMINAL.includes(issue.status));
    return {
      emergencies: open.filter(emergency).sort((a, b) => (a.id === 'case-1' ? -1 : b.id === 'case-1' ? 1 : a.id.localeCompare(b.id))),
      ranked: open.filter(issue => !emergency(issue)).sort((a, b) => {
        if (mode === 'value') return (state.clients.find(c => c.id === b.clientId)?.acvLakh || 0) - (state.clients.find(c => c.id === a.clientId)?.acvLakh || 0) || a.id.localeCompare(b.id);
        return score(state, b) - score(state, a) || a.id.localeCompare(b.id);
      })
    };
  }
  function capacity(state) {
    return Object.fromEntries(Object.entries(RESOURCES).map(([resource, spec]) => {
      const tasks = state.tasks.filter(task => task.resource === resource);
      const total = { ...spec, proposed: 0, approved: 0, assigned: 0, consumed: 0, confirmed: 0, actual: 0, planned: 0, unreportedActual: 0, tasks: tasks.map(t => t.id) };
      for (const task of tasks) {
        if (task.actualHours != null) total.actual += task.actualHours;
        else if (task.assigneeId) total.unreportedActual++;
        if (TERMINAL.includes(task.status)) {
          const charge=task.status==='Cancelled'?(task.actualHours||0):(task.actualHours??task.plannedHours);
          total.confirmed+=charge;total.consumed+=charge;total.planned+=charge;continue;
        }
        total.planned += Math.max(task.plannedHours,task.actualHours||0);
        if (task.status === 'Proposed') total.proposed += task.plannedHours;
        else if (task.status === 'Approved') total.approved += task.plannedHours;
        else { total.confirmed += Math.max(task.plannedHours, task.actualHours || 0); total.assigned += Math.max(task.plannedHours,task.actualHours||0); }
      }
      for (const key of ['proposed', 'approved', 'assigned', 'consumed', 'confirmed', 'actual', 'planned']) total[key] = Number(total[key].toFixed(2));
      total.planConflict = total.planned > total.budget;
      total.assignmentConflict = total.confirmed > total.budget;
      total.remaining = Number((total.budget - total.confirmed).toFixed(2));
      return [resource, total];
    }));
  }
  function record(state, actor, type, details, refs = {}) {
    state.activity.push({ id: id(state, 'activity'), at: now(), actorId: actor.employeeId, actorRole: actor.role, mode: actor.mode, type, details: clean(details, 5000), ...refs });
    if (refs.issueId) { const issue = state.issues.find(i => i.id === refs.issueId); if (issue) issue.lastUpdate = now(); }
    if (refs.clientId) { const client = state.clients.find(c => c.id === refs.clientId); if (client) client.lastActivity = now(); }
  }
  function manager(actor) { if (actor.role !== 'manager') fail('Manager approval is required.', 403); }
  function owner(actor, task) { if (task.assigneeId !== actor.employeeId) fail('Only the active assignee can update this task.', 403); }
  function seed() {
    const timestamp = now();
    const clients = [
      { id: 'annam', name: 'Annam Foods', acvLakh: 120, placeholder: false, aliases: ['annam', 'sushma'], products: ['Supplier invoices'], stakeholder: 'Sushma', stakeholderRole: null },
      { id: 'demo', name: 'Scheduling demo account', acvLakh: 40, placeholder: true, aliases: ['wednesday demo', 'delivery-partner scheduling', 'demo account'], expansionLakh: 60 },
      { id: 'renewal', name: 'Silent renewal account', acvLakh: 70, placeholder: true, aliases: ['silent renewal', 'renewal account'], renewalInDays: 9 },
      { id: 'kabir', name: 'Toy brand · Kabir', acvLakh: 5, placeholder: true, industry: 'Toys', stakeholder: 'Kabir', stakeholderRole: 'Founder', aliases: ['kabir', 'toy brand'] },
      { id: 'orders', name: 'Order-update account', acvLakh: 55, placeholder: true, aliases: ['order-update', 'order update account', 'order bug'] },
      { id: 'orbit', name: 'Orbit Electronics', acvLakh: 90, placeholder: false, aliases: ['orbit'] },
      ...Array.from({ length: 6 }, (_, index) => ({ id: 'quiet-' + (index + 7), name: 'Quiet account ' + (index + 7), placeholder: true, acvLakh: null, aliases: ['quiet ' + (index + 7), 'quiet account ' + (index + 7)] }))
    ].map(client => ({ industry: null, renewalDate: null, ownerId: 'emp-manager', stakeholder: null, stakeholderRole: null, products: [], expansionLakh: null, health: 'Not assessed', risks: '', lastActivity: null, provenance: 'Provided case', ...client }));
    const definitions = [
      ['case-1', 'annam', 'Supplier invoices blocked', 'invoice_outage', 'OUTAGE', [5,5,5,5,4,4], '40 farmers and suppliers unpaid since Saturday.', 'Acknowledge personally; investigate invoice logs and provide a verified progress update.', 'technical', 4],
      ['case-2', 'demo', 'Wednesday scheduling demo', 'expansion', 'NONE', [3,4,2,2,2,5], 'Delivery-partner scheduling demo requested for Wednesday; ₹60L potential expansion.', 'Confirm scope and request the one-hour Wednesday demo slot.', 'demo', 1],
      ['case-3', 'renewal', 'Silent renewal in 9 days', 'renewal', 'NONE', [4,4,4,5,2,3], 'No response to revised contract terms; renewal is in 9 days.', 'Call the buyer and message Priya about any commercial blocker.', null, 0],
      ['case-4', 'kabir', 'Public LinkedIn complaint', 'public_complaint', 'PR', [1,5,5,5,3,1], 'Support ticket ignored for 10 days; a public complaint is active.', 'Review a public acknowledgment and delegate the ticket to the Support Lead.', null, 0],
      ['case-5', 'orders', 'Recurring order-update failure', 'order_updates', 'NONE', [3,4,4,4,5,2], 'Third failure this quarter; the prior two responses were server restarts.', 'Investigate root cause, correct the condition, recover missing updates and verify monitoring.', 'technical', 2.5],
      ['case-6', 'orbit', 'Executive visit with unresolved issues', 'executive_review', 'NONE', [4,3,3,4,4,5], 'Vice President visits next week; three issues remain from last quarter. Individual technical details are not provided.', 'Audit all three issues and prepare a factual leadership briefing.', 'technical', 1.5],
      ['case-7', null, 'Internal client-record audit', 'internal', 'NONE', [1,2,1,1,3,1], 'Client notes and pipeline records must be updated by Friday.', 'Review and approve account notes and pipeline updates by Friday.', null, 0]
    ];
    const issues = definitions.map(([issueId, clientId, title, category, emergencyType, ratings, evidence, nextAction, resource, effort]) => ({
      id: issueId, clientId, title, category, emergencyType, ratings: Object.fromEntries(FACTORS.map((f, index) => [f.key, ratings[index]])),
      evidence: [evidence], missingInformation: ['Technical root cause, exact dates and individual history are unknown unless supplied.'],
      impact: evidence, nextAction, resource, estimatedHours: effort, status: 'Open', reportedAt: null, deadline: ({'case-2':'Wednesday in the case week','case-3':'Renewal in 9 days from case Monday','case-6':'Executive visit next week','case-7':'Friday in the case week'})[issueId] || null,
      lastUpdate: null, source: 'Provided case', simulated: false, confidence: null, recurrence: issueId === 'case-5' ? 3 : null,
      incidentRef: issueId, dedupeKeys: [clientId + '|' + category + '|' + issueId], investigation: {}, technicalNotes: '', verifiedFacts: []
    }));
    const tasks = issues.map((issue, index) => ({
      id: 'task-' + (index + 1), issueId: issue.id, clientId: issue.clientId, title: issue.nextAction, description: issue.nextAction,
      status: 'Proposed', resource: issue.resource, plannedHours: issue.estimatedHours, actualHours: null, assigneeId: null,
      dueDate: null, deliverable: '', instructions: '', escalationContact: 'Manager Priya (message only)', evidence: '', resolutionNotes: '',
      delivery: 'Not assigned', createdAt: timestamp, updatedAt: timestamp, verifiedBy: null
    }));
    const milestoneNames = [
      ['Day 1–5', 'Stakeholder discovery'], ['Day 1–10', 'Recover existing service issues'],
      ['Day 7–12', 'Needs assessment'], ['Day 12–18', 'Demonstration / expansion discussion after service readiness'],
      ['Day 18–25', 'Commercial qualification'], ['Day 30', 'Review evidence and agree a next step']
    ];
    const state = {
      schemaVersion: VERSION, revision: 0, sequence: 100, createdAt: timestamp, clients,
      stakeholders: clients.filter(c => c.stakeholder).map(c => ({ id: 'stakeholder-' + c.id, clientId: c.id, name: c.stakeholder, role: c.stakeholderRole })),
      issues, tasks, signals: [], issueSources: [], batches: [], analyses: [], aiPlans: [], reviews: [], feedback: [], assignments: [], allocations: [], activity: [],
      employees: [
        { id: 'emp-manager', name: 'Associate Manager', role: 'Associate Manager', capabilities: ['account', 'support'], appRole: 'manager', email: null },
        { id: 'emp-technical', name: 'Technical Account Manager', role: 'Technical Account Manager', capabilities: ['technical'], appRole: 'assignee', email: null },
        { id: 'emp-demo', name: 'Solution Consultant', role: 'Solution Consultant', capabilities: ['demo'], appRole: 'assignee', email: null },
        { id: 'emp-support', name: 'Support Lead', role: 'Support Lead', capabilities: ['support'], appRole: 'assignee', email: null },
        { id: 'emp-priya', name: 'Priya', role: 'Manager · travelling; message only', capabilities: ['account'], appRole: 'manager', email: null }
      ],
      communications: [
        { id: 'draft-sushma', issueId: 'case-1', clientId: 'annam', title: 'Sushma crisis response', status: 'Needs review', checks: [false,false,false], source: 'Prepared template',
          text: 'Sushma, I own this response and am arranging technical investigation of the invoices affecting 40 farmers and suppliers.\nI will call at [VERIFIED CALLBACK TIME] with confirmed progress and next steps. I will share a clearance time only after engineering verifies it.',
          checkLabels: ['Verified the current engineering assignment and progress.', 'Confirmed the callback time and replaced placeholders.', 'Checked recipient, tone and every factual or commercial claim.'] },
        { id: 'draft-kabir', issueId: 'case-4', clientId: 'kabir', title: 'Kabir public reply', status: 'Needs review', checks: [false,false,false], source: 'Prepared template',
          text: 'Hi Kabir, waiting 10 days is unacceptable, and I am sorry. I am taking ownership of your support escalation and will contact you privately to agree the next update.',
          checkLabels: ['Verified the ticket owner and current status.', 'Prepared a private contact route without posting sensitive details.', 'Checked the public tone and avoided an unverified fix deadline.'] },
        { id: 'draft-orbit', issueId: 'case-6', clientId: 'orbit', title: 'Orbit leadership brief', status: 'Needs review', checks: [false,false,false], source: 'Prepared template',
          text: 'Before next week’s Orbit Electronics visit: the ₹90L account has three unresolved issues from last quarter. Their individual technical details are not supplied in the case.\n[ADD VERIFIED AUDIT FINDINGS, OWNERS AND NEXT UPDATE DATES]\nOpen the meeting by acknowledging the unresolved items and explaining the verified recovery plan.',
          checkLabels: ['Reviewed the three actual issue records; no details were invented.', 'Verified owners, current status and any dates added.', 'Checked recipient and shared the briefing with Priya by message.'] }
      ],
      opportunities: [
        { id: 'opp-demo', clientId: 'demo', name: 'Delivery-partner scheduling expansion', upsideLakh: 60, kind: 'Case opportunity', readiness: 'Discovery / demo requested', risk: 'Specialist slot and scope need confirmation.', nextAction: 'Qualify requirements and request the Wednesday demo.', ownerId: 'emp-manager', targetDate: null, milestones: milestoneNames.map(([target, title]) => ({ target, title, status: 'Proposed' })) },
        { id: 'opp-orbit', clientId: 'orbit', name: 'Post-recovery growth discovery', upsideLakh: null, kind: 'Discovery hypothesis · not a case fact', readiness: 'Service recovery first', risk: 'Three unresolved issues; no expansion amount is known.', nextAction: 'Resolve service debt, then ask about unmet needs; do not forecast revenue.', ownerId: 'emp-manager', targetDate: null, milestones: milestoneNames.map(([target, title]) => ({ target, title, status: 'Proposed' })) }
      ],
      scenarioSettings: { preset: 'crisis', weights: clone(SCENARIOS.crisis.weights), comparison: 'weighted', lastChange: '' },
      assumptions: ['The single 8-hour technical day is treated as a total budget for this case week, spread across Monday and Tuesday if needed. This is a planning assumption, not two days of capacity.', 'No account with no reported issue has been verified healthy.']
    };
    record(state, { employeeId: 'system', role: 'system', mode: 'demo' }, 'Case loaded', 'Loaded the seven supplied case items and exactly twelve baseline accounts. No work is assigned or completed.');
    return state;
  }
  function identifyClient(state, record) {
    const direct = state.clients.find(c => c.id === record.clientId || normalized(c.name) === normalized(record.clientId));
    if (direct) return direct.id;
    const text = normalized([record.clientId, record.subject, record.content, record.sender].join(' '));
    const matches = state.clients.filter(client => [client.name, ...(client.aliases || [])].some(alias => text.includes(normalized(alias))));
    return matches.length === 1 ? matches[0].id : null;
  }
  function classify(state, record) {
    const text = normalized(record.subject + ' ' + record.content);
    const clientId = identifyClient(state, record);
    let category = 'technical', gate = 'NONE', resource = 'technical', actionable = true;
    if (/\b(thanks|thank you|received|newsletter|meeting confirmed|no action required)\b/.test(text) && !/\b(unpaid|outage|urgent|ignored|failed)\b/.test(text)) { category = 'routine'; resource = null; actionable = false; }
    else if (/(linkedin|public post|social media)/.test(text) && /(complaint|ignored|support ticket|backlash)/.test(text) && !/(resolved|withdrawn)/.test(text)) { category = 'public_complaint'; gate = 'PR'; resource = null; }
    else if (/(invoice|supplier|farmer|payout|billing|dispatch)/.test(text) && /(stuck|blocked|unpaid|halt|outage|cannot|stopped|frozen)/.test(text) && !/(resolved|restored|no outage)/.test(text)) { category = 'invoice_outage'; gate = 'OUTAGE'; }
    else if (/(order.update|order sync|automatic order)/.test(text)) category = 'order_updates';
    else if (/(renewal|renew|revised terms|zero logins)/.test(text)) { category = 'renewal'; resource = null; }
    else if (/(demo|expansion|walkthrough|scheduling module)/.test(text)) { category = 'expansion'; resource = 'demo'; }
    else if (/(vice president|executive visit|leadership visit)/.test(text)) { category = 'executive_review'; resource = 'technical'; }
    const client = state.clients.find(c => c.id === clientId);
    const ratings = { F: valueRating(client?.acvLakh), U: gate !== 'NONE' ? 5 : category === 'renewal' || category === 'order_updates' ? 4 : actionable ? 3 : 1, I: gate !== 'NONE' ? 5 : category === 'order_updates' ? 4 : actionable ? 3 : 1, R: gate !== 'NONE' || category === 'renewal' ? 5 : category === 'order_updates' ? 4 : actionable ? 3 : 1, S: category === 'order_updates' ? 5 : resource === 'technical' ? 3 : 1, G: ['expansion','executive_review'].includes(category) ? 5 : 2 };
    const names = { invoice_outage: 'Financial / fulfillment halt', public_complaint: 'Public support escalation', order_updates: 'Order-update failure', renewal: 'Renewal / usage risk', expansion: 'Expansion / product demo', executive_review: 'Executive visit preparation', routine: 'Routine communication', technical: 'Technical complaint' };
    return {
      client_id: clientId, issue_summary: names[category], issue_category: category, business_impact: clean(record.content, 500),
      urgency: gate !== 'NONE' ? 'Immediate acknowledgment and escalation' : 'Review the supplied deadline', deadline: null, financial_exposure: null,
      recurrence: category === 'order_updates' ? 'Possible recurrence; verify incident history' : null, relationship_risk: category === 'renewal' ? 'Potential churn; verify' : null,
      growth_signal: category === 'expansion' ? 'Discovery required; amount unknown unless explicitly supplied' : null,
      emergency_type: gate, confidence: null, confidence_indicator: 'Rule-based estimate · human review required',
      supporting_evidence: [clean(record.content, 500)], missing_information: [...(!clientId ? ['Client identity requires mapping.'] : []), ...(client?.acvLakh==null?['Contracted annual value is unknown; Deal Value uses a provisional rating of 1.']:[]), 'Root cause and completion status are unverified.', 'Exact deadline and commercial exposure may be unknown.'],
      recommended_action: gate !== 'NONE' ? 'Acknowledge personally, verify the impact and escalate to the appropriate owner; do not promise a fix time.' : resource === 'demo' ? 'Qualify requirements and request a Solution Consultant slot.' : category === 'routine' ? 'No task proposed; retain the communication as evidence.' : 'Review the issue evidence and agree an owner and next update.',
      suggested_assignee_role: gate === 'PR' ? 'Support Lead' : resource === 'technical' ? 'Technical Account Manager' : resource === 'demo' ? 'Solution Consultant' : 'Associate Manager',
      ratings, actionable, resource, engine: 'Offline simulator'
    };
  }
  function validateAnalysis(value, state) {
    if (!value || typeof value !== 'object' || !CATEGORIES.includes(value.issue_category) || !['OUTAGE','PR','NONE'].includes(value.emergency_type)) fail('Invalid AI classification.');
    for (const key of ['issue_summary','business_impact','urgency','recommended_action','suggested_assignee_role']) requireText(value[key], key, key === 'business_impact' ? 3000 : 1000);
    if (value.client_id !== null && !state.clients.some(c => c.id === value.client_id)) fail('AI returned an unknown client identifier.');
    if(value.existing_issue_id!=null&&!state.issues.some(i=>i.id===value.existing_issue_id&&i.clientId===value.client_id))fail('AI returned an invalid existing-issue match.');
    if (!Number.isInteger(value.confidence) || value.confidence < 0 || value.confidence > 100) fail('Invalid model confidence.');
    if (!FACTORS.every(f => Number.isInteger(value.ratings?.[f.key]) && value.ratings[f.key] >= 1 && value.ratings[f.key] <= 5)) fail('Invalid AI factor ratings.');
    for (const key of ['supporting_evidence','missing_information']) if (!Array.isArray(value[key]) || value[key].length > 20 || !value[key].every(v => typeof v === 'string' && v.length <= 2000)) fail('Invalid AI evidence.');
    for (const key of ['deadline','financial_exposure','recurrence','relationship_risk','growth_signal']) if (value[key] !== null && (typeof value[key] !== 'string' || value[key].length > 1000)) fail('Unknown facts must be null or bounded strings.');
    if (typeof value.actionable !== 'boolean') fail('Invalid actionable flag.');
    const roleResources = { 'Technical Account Manager': 'technical', 'Solution Consultant': 'demo', 'Support Lead': null, 'Associate Manager': null };
    if (!(value.suggested_assignee_role in roleResources)) fail('Invalid assignee role.');
    const output = {};
    ['client_id','issue_summary','issue_category','business_impact','urgency','deadline','financial_exposure','recurrence','relationship_risk','growth_signal','emergency_type','confidence','supporting_evidence','missing_information','recommended_action','suggested_assignee_role','actionable'].forEach(key => { output[key] = clone(value[key]); });
    output.ratings = Object.fromEntries(FACTORS.map(f => [f.key, value.ratings[f.key]]));
    output.existing_issue_id=value.existing_issue_id||null;
    // Monetary facts and numerical math remain authoritative in the shared domain.
    output.ratings.F = valueRating(state.clients.find(c => c.id === output.client_id)?.acvLakh);
    output.resource = output.emergency_type === 'PR' ? null : output.emergency_type === 'OUTAGE' ? 'technical' : roleResources[output.suggested_assignee_role];
    output.engine = 'Live Gemini'; output.confidence_indicator = 'Model-reported; not calibrated';
    return output;
  }
  function parseCSV(text) {
    text = String(text).replace(/^\uFEFF/, '');
    const rows = []; let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else if (!quoted && field) fail('Invalid CSV quote near row ' + (rows.length + 1));
        else quoted = !quoted;
      } else if (ch === ',' && !quoted) { row.push(field); field = ''; }
      else if ((ch === '\n' || ch === '\r') && !quoted) {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); if (row.some(v => v.trim())) rows.push(row); row = []; field = '';
      } else field += ch;
    }
    if (quoted) fail('CSV contains an unclosed quoted field.');
    if (field || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows.shift().map(h => h.trim());
    if (new Set(headers).size !== headers.length || headers.some(h => !h)) fail('CSV headers must be nonempty and unique.');
    return rows.map((values, index) => {
      if (values.length !== headers.length) return { _importError: 'Row ' + (index + 2) + ' has the wrong number of columns.' };
      return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
    });
  }
  function parseImport(text, filename) {
    const rows = /\.csv$/i.test(filename) ? parseCSV(text) : JSON.parse(text);
    const records = Array.isArray(rows) ? rows : rows?.records;
    if (!Array.isArray(records) || records.length > 2000 || !records.length) fail('Import 1–2000 records as a JSON array, {records: []}, or CSV.');
    return records;
  }
  function mapRecord(raw, mapping = {}, defaultSource = 'email') {
    const pick = (key, aliases) => {
      if (mapping[key]) return raw[mapping[key]];
      return aliases.map(alias => raw[alias]).find(value => value != null && value !== '');
    };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { _importError: 'Record must be an object.' };
    return {
      externalId: pick('externalId', ['externalId','message_id','messageId','ticket_id','ticketId','id']),
      source: pick('source', ['source','type']) || defaultSource,
      clientId: pick('clientId', ['clientId','client_id','client','account']),
      subject: pick('subject', ['subject','title']) || '',
      content: pick('content', ['content','body','description','complaint','note','text']),
      sender: pick('sender', ['sender','from']) || '',
      timestamp: pick('timestamp', ['timestamp','created_at','creation_date','date']) || null,
      threadId: pick('threadId', ['threadId','thread_id']) || null,
      incidentRef: pick('incidentRef', ['incidentRef','incident_id','issue_id']) || null,
      sourceStatus: pick('sourceStatus', ['sourceStatus','status','current_status']) || null,
      sourcePriority: pick('sourcePriority', ['sourcePriority','priority']) || null,
      sourceAssignee: pick('sourceAssignee', ['sourceAssignee','assigned_person','assignee']) || null,
      simulated: raw.simulated === true || normalized(raw.simulated) === 'true', _importError: raw._importError
    };
  }
  function normalizeRecords(state, rows, mapping = {}, defaultSource = 'email') {
    const seen = new Map(state.signals.map(record => [record.id, record]));
    return rows.map((raw, index) => {
      const value = mapRecord(raw, mapping, defaultSource), errors = [];
      if (value._importError) errors.push(value._importError);
      const aliases = { emails: 'email', tickets: 'ticket', crm_note: 'crm', social_mention: 'social' };
      value.source = aliases[normalized(value.source)] || normalized(value.source);
      if (!['email','ticket','crm','social'].includes(value.source)) errors.push('Source must be email, ticket, crm or social.');
      if (typeof value.content !== 'string' || !value.content.trim() || value.content.length > 10000) errors.push('Message body must contain 1–10000 characters.');
      if (value.externalId != null && String(value.externalId).length > 200) errors.push('Source identifier is too long.');
      if (value.timestamp && Number.isNaN(Date.parse(value.timestamp))) errors.push('Timestamp is invalid; leave unknown dates blank.');
      for (const key of ['clientId','subject','sender','threadId','incidentRef','sourceStatus','sourcePriority','sourceAssignee']) value[key] = value[key] == null ? null : clean(value[key], key === 'subject' ? 500 : 250);
      value.content = clean(value.content, 10000); value.sourceRow = index + 1;
      value.externalId = clean(value.externalId, 200) || 'content-' + hash([value.source,value.sender,value.subject,value.content,value.timestamp].join('|'));
      // Preserve the source ID itself: no hash collision can merge unrelated imported IDs.
      value.id = value.source + ':' + encodeURIComponent(value.externalId);
      value.clientHint = value.clientId;
      value.clientId = identifyClient(state, value);
      value.fingerprint = hash(JSON.stringify([value.subject,value.content,value.clientId,value.timestamp,value.threadId,value.incidentRef,value.sourceStatus,value.sourcePriority,value.sourceAssignee]));
      const existing = seen.get(value.id);
      if (existing && existing.fingerprint !== value.fingerprint) errors.push('Source ID already exists with different content. Use a versioned source ID.');
      value.duplicateSource = Boolean(existing && !errors.length);
      value.errors = errors;
      if (!errors.length && !existing) seen.set(value.id, value);
      return value;
    });
  }
  function groupSignals(state, rows) {
    const groups = new Map();
    for (const record of rows.filter(r => !r.errors.length && !r.duplicateSource)) {
      const analysis = classify(state, record);
      // Explicit incident references keep different incidents on one account separate.
      const reference = record.incidentRef || (analysis.issue_category === 'technical' ? normalized(record.subject).replace(/^(re|fw|fwd):\s*/g, '').replace(/\b(reminder|follow.up)\b/g, '').trim() || 'technical-review' : 'current-' + analysis.issue_category);
      const key = [analysis.client_id || 'unmatched', analysis.issue_category, reference].join('|');
      if (!groups.has(key)) {
        let existing = state.issues.find(issue => issue.dedupeKeys.includes(key));
        if (!existing && record.incidentRef) existing = state.issues.find(issue => issue.id === record.incidentRef && issue.clientId === analysis.client_id);
        if (!existing && !record.incidentRef && analysis.issue_category !== 'technical') existing = state.issues.find(issue => issue.clientId === analysis.client_id && issue.category === analysis.issue_category && !TERMINAL.includes(issue.status));
        groups.set(key, { id: 'group-' + hash(key), key, clientId: analysis.client_id, records: [], analysis, candidateIssueId: existing?.id || null, status: 'Pending analysis' });
      }
      groups.get(key).records.push(record);
    }
    return [...groups.values()];
  }
  function sampleMonday() {
    const scenarios = [
      ['annam', 'case-1', 10, 3, 'Invoices remain blocked. Forty farmers and suppliers are unpaid since Saturday.', 'Invoice outage'],
      ['annam', 'sample-annam-stock', 6, 2, 'Inventory export API returns a validation error for a separate warehouse report.', 'Inventory export error'],
      ['demo', 'case-2', 12, 1, 'Please confirm Wednesday’s delivery-partner scheduling module demo. Potential ₹60L expansion is under discussion.', 'Scheduling demo'],
      ['renewal', 'case-3', 12, 2, 'Renewal in 9 days. No reply to revised terms; request a buyer conversation.', 'Silent renewal'],
      ['kabir', 'case-4', 8, 4, 'Kabir posted a public LinkedIn complaint: the support ticket has been ignored for 10 days.', 'Public complaint'],
      ['orders', 'case-5', 14, 10, 'Automatic order updates failed for the third time. Previous server restarts did not prevent recurrence.', 'Recurring order updates'],
      ['orbit', 'case-6', 10, 5, 'Vice President visit next week. Three issues are unresolved; technical details are unknown.', 'Executive visit'],
      ['quiet-7', 'sample-quiet-7', 8, 5, 'Our reporting API fails. Please investigate authentication and capture evidence; root cause is not confirmed.', 'Reporting API complaint'],
      ['quiet-8', 'sample-quiet-8', 8, 2, 'Simulated renewal check: usage dropped; exact contract date and value are unknown.', 'Usage and renewal check'],
      ['quiet-9', 'sample-quiet-9', 8, 1, 'Please arrange a product demo for possible expansion. No amount or buying commitment is known.', 'Discovery demo'],
      ['quiet-10', 'sample-routine-10', 8, 2, 'Thank you, the meeting is confirmed. No action required.', 'Meeting confirmed'],
      ['quiet-11', 'sample-routine-11', 8, 2, 'Received the newsletter. No action required.', 'Newsletter received'],
      ['quiet-12', 'sample-routine-12', 8, 1, 'Thanks for the update. No action required.', 'Routine acknowledgment']
    ];
    const result = []; let email = 0, ticket = 0;
    for (const [clientId, incidentRef, emails, tickets, content, subject] of scenarios) {
      for (const [source, count] of [['email',emails],['ticket',tickets]]) {
        for (let index = 0; index < count; index++) {
          const externalId = source === 'email' ? 'MONDAY-E-' + String(++email).padStart(3,'0') : 'MONDAY-T-' + String(++ticket).padStart(3,'0');
          result.push({ source, externalId, clientId, incidentRef, subject, content, sender: 'simulation@example.test', timestamp: '2026-11-23T08:' + String(index % 60).padStart(2,'0') + ':00+05:30', threadId: incidentRef, simulated: true, status: 'Simulated incoming' });
        }
      }
    }
    return result;
  }
  function sampleSupplement() {
    return [
      { externalId: 'SAMPLE-CRM-1', source: 'crm', clientId: 'renewal', incidentRef: 'case-3', content: 'Simulated CRM note: no buyer response to revised renewal terms.', simulated: true },
      { externalId: 'SAMPLE-SOCIAL-1', source: 'social', clientId: 'kabir', incidentRef: 'case-4', content: 'Simulated public LinkedIn complaint: support ticket ignored for 10 days.', simulated: true }
    ];
  }
  function validateState(state) {
    if (!state || state.schemaVersion !== VERSION || !Number.isInteger(state.revision)) fail('Unsupported or damaged workspace. Export the saved data before recovery.');
    if(state.aiPlans===undefined)state.aiPlans=[]; // Additive schema-2 migration; no records are reset.
    for (const entity of ['clients','issues','tasks','signals','batches','employees','activity','analyses','aiPlans','reviews','assignments','feedback','communications','opportunities','issueSources','allocations','stakeholders']) {
      if (!Array.isArray(state[entity])) fail('Workspace entity missing: ' + entity);
      if (new Set(state[entity].map(row => row.id)).size !== state[entity].length) fail('Duplicate identifiers in ' + entity);
    }
    const clients=new Set(state.clients.map(c=>c.id)),issues=new Set(state.issues.map(i=>i.id)),tasks=new Set(state.tasks.map(t=>t.id)),employees=new Set(state.employees.map(e=>e.id)),signals=new Set(state.signals.map(s=>s.id));
    if(state.issues.some(i=>i.clientId!==null&&!clients.has(i.clientId))||state.tasks.some(t=>!issues.has(t.issueId)||(t.clientId!==null&&!clients.has(t.clientId))||(t.assigneeId&&!employees.has(t.assigneeId)))||state.issueSources.some(l=>!issues.has(l.issueId)||!signals.has(l.signalId))||state.assignments.some(a=>!tasks.has(a.taskId)||!employees.has(a.employeeId))||state.analyses.some(a=>a.signalIds.some(id=>!signals.has(id))))fail('Workspace contains a broken entity relationship. No data has been reset.');
    return state;
  }
  function applyAction(input, action, actor, context = {}) {
    validateState(input);
    if (!actor || !['manager','assignee'].includes(actor.role) || !input.employees.some(e => e.id === actor.employeeId)) fail('A valid workspace identity is required.', 403);
    const state = clone(input), payload = action.payload || {}, type = action.type;
    const task = payload.taskId ? byId(state.tasks, payload.taskId, 'Task') : null;
    const issue = payload.issueId ? byId(state.issues, payload.issueId, 'Issue') : task ? byId(state.issues, task.issueId, 'Issue') : null;
    const refs = issue ? { issueId: issue.id, clientId: issue.clientId, ...(task ? { taskId: task.id } : {}) } : {};
    const managerial = ['client.edit','employee.edit','scenario.change','weights.change','comparison.change','rating.correct','batch.save','group.review','group.correct','plan.save','task.create','task.approve','task.assign','task.reassign','task.verify','task.close','task.cancel','task.reopen','allocation.edit','draft.edit','draft.check','draft.copy','opportunity.edit','issue.note'];
    if (managerial.includes(type)) manager(actor);
    if (type === 'client.edit') {
      const client = byId(state.clients, payload.clientId, 'Client'), reason = requireText(payload.reason, 'Change reason', 1000), changes = payload.changes || {};
      const allowed = ['name','industry','acvLakh','renewalDate','stakeholder','stakeholderRole','products','health','risks','expansionLakh','ownerId'];
      const before = clone(client);
      for (const key of Object.keys(changes)) {
        if (!allowed.includes(key)) fail('Unsupported client field.');
        const value = changes[key];
        if (['acvLakh','expansionLakh'].includes(key)) client[key] = value === null ? null : number(value, key, 50000);
        else if (key === 'products') { if (!Array.isArray(value) || !value.every(v => typeof v === 'string' && v.length < 150)) fail('Invalid products.'); client[key] = value.slice(0,20); }
        else if (key === 'ownerId') client[key] = byId(state.employees, value, 'Employee').id;
        else if (key === 'name') client[key] = requireText(value, 'Client name', 150);
        else client[key] = value == null || value === '' ? null : clean(value, 1500);
      }
      if (client.renewalDate && Number.isNaN(Date.parse(client.renewalDate))) fail('Invalid renewal date.');
      client.provenance = 'User-edited; original facts retained in audit history';
      const stakeholder=state.stakeholders.find(s=>s.clientId===client.id);
      if(client.stakeholder){
        if(stakeholder){stakeholder.name=client.stakeholder;stakeholder.role=client.stakeholderRole;}
        else state.stakeholders.push({id:id(state,'stakeholder'),clientId:client.id,name:client.stakeholder,role:client.stakeholderRole});
      }else state.stakeholders=state.stakeholders.filter(s=>s.clientId!==client.id);
      if(Object.hasOwn(changes,'expansionLakh')){
        const opportunity=state.opportunities.find(o=>o.clientId===client.id);
        if(opportunity){opportunity.upsideLakh=client.expansionLakh;opportunity.kind='User-entered opportunity · original case facts retained in audit history';}
      }
      state.issues.filter(i => i.clientId === client.id).forEach(i => { i.ratings.F = valueRating(client.acvLakh); });
      record(state, actor, 'Account updated', JSON.stringify({ reason, before, after: client }), { clientId: client.id });
    } else if (type === 'employee.edit') {
      const employee = byId(state.employees, payload.employeeId, 'Employee');
      requireText(payload.reason, 'Change reason', 1000);
      employee.name = requireText(payload.name, 'Display name', 150); employee.role = requireText(payload.role, 'Role', 150);
      if (!Array.isArray(payload.capabilities) || !payload.capabilities.every(c => ['technical','demo','support','account'].includes(c))) fail('Invalid capabilities.');
      employee.capabilities = [...new Set(payload.capabilities)]; employee.email = clean(payload.email, 250) || null;
      if (employee.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(employee.email)) fail('Invalid email.');
      // Editing job labels never grants management authority or increases resource budgets.
      record(state, actor, 'Team directory updated', employee.id + ': ' + payload.reason);
    } else if (['scenario.change','weights.change'].includes(type)) {
      const previous = priorities(state, 'weighted').ranked.map(i => i.id), oldWeights = clone(state.scenarioSettings.weights);
      if (type === 'scenario.change') {
        if (!SCENARIOS[payload.preset]) fail('Unknown scenario.');
        state.scenarioSettings.preset = payload.preset; state.scenarioSettings.weights = clone(SCENARIOS[payload.preset].weights);
      } else {
        if (!FACTORS.every(f => typeof payload.weights?.[f.key] === 'number' && Number.isFinite(payload.weights[f.key]) && payload.weights[f.key] >= 0 && payload.weights[f.key] <= 100)) fail('Invalid weights.');
        state.scenarioSettings.weights = Object.fromEntries(FACTORS.map(f => [f.key,payload.weights[f.key]])); state.scenarioSettings.preset = 'custom';
      }
      state.scenarioSettings.comparison = 'weighted';
      const movements = priorities(state).ranked.map((i, index) => previous.indexOf(i.id) === index ? null : i.title + ': #' + (previous.indexOf(i.id) + 1) + ' to #' + (index + 1)).filter(Boolean);
      const increases = FACTORS.filter(f => state.scenarioSettings.weights[f.key] > oldWeights[f.key]).map(f => f.label + ' increased');
      state.scenarioSettings.lastChange = (movements.join(' · ') || 'Scores updated; order unchanged.') + (increases.length ? '. ' + increases.join(', ') + '.' : '') + ' Emergencies remain pinned. Account facts and allocations are unchanged.';
      record(state, actor, 'Priority scenario changed', state.scenarioSettings.lastChange);
    } else if (type === 'comparison.change') {
      if (!['value','weighted'].includes(payload.mode)) fail('Invalid comparison.');
      state.scenarioSettings.comparison = payload.mode;
      record(state, actor, 'Comparison changed', payload.mode + '; emergency escalation preserved.');
    } else if (type === 'rating.correct') {
      const reason = requireText(payload.reason, 'Correction reason', 2000);
      if (!FACTORS.every(f => Number.isInteger(payload.ratings?.[f.key]) && payload.ratings[f.key] >= 1 && payload.ratings[f.key] <= 5)) fail('Ratings must be integers from 1 to 5.');
      if (!['NONE','OUTAGE','PR'].includes(payload.emergencyType)) fail('Invalid emergency correction.');
      const expectedF = valueRating(state.clients.find(c => c.id === issue.clientId)?.acvLakh);
      if (payload.ratings.F !== expectedF) fail('Correct the contracted value in the account first; Deal Value must follow the common rubric.');
      const before = { ratings: clone(issue.ratings), emergencyType: issue.emergencyType };
      issue.ratings = clone(payload.ratings); issue.emergencyType = payload.emergencyType;
      state.feedback.push({ id: id(state,'feedback'), issueId: issue.id, category: issue.category, before, after: { ratings: clone(issue.ratings), emergencyType: issue.emergencyType }, reason, actorId: actor.employeeId, at: now() });
      record(state, actor, 'Human rating correction', reason, refs);
    } else if (type === 'batch.save') {
      const batch = payload.batch;
      if (!batch || !Array.isArray(batch.records) || batch.records.length > 2000 || !Array.isArray(batch.groups)) fail('Invalid batch.');
      // Revalidate imported rows on the authoritative side, rather than trusting client validation flags.
      const rows = normalizeRecords(state, batch.records);
      const fresh = rows.filter(r => !r.errors.length && !r.duplicateSource);
      const ids = new Set(fresh.map(r => r.id));
      const groups = batch.groups.map(group => {
        if (!group || !Array.isArray(group.signalIds) || !group.signalIds.length || group.signalIds.some(signalId => !ids.has(signalId))) fail('Invalid batch evidence relationship.');
        const evidence = fresh.filter(r => group.signalIds.includes(r.id));
        const fallback = classify(state, evidence[0]);
        const analysis = group.analysis?.engine === 'Live Gemini' ? validateAnalysis(group.analysis, state) : fallback;
        return { id: id(state,'analysis'), batchId: null, key: clean(group.key,1000), signalIds: [...new Set(group.signalIds)], candidateIssueId: state.issues.some(i => i.id === group.candidateIssueId && i.clientId === analysis.client_id) ? group.candidateIssueId : null, clientId: analysis.client_id, analysis, status: analysis.actionable ? 'Needs review' : 'Non-actionable', failure: clean(group.failure,500) || null, simulated: evidence.some(r => r.simulated), at: now() };
      });
      const assignedIds = groups.flatMap(group => group.signalIds);
      if (new Set(assignedIds).size !== fresh.length || assignedIds.length !== fresh.length) fail('Every new valid signal must be accounted for exactly once.');
      const batchId = id(state,'batch');
      groups.forEach(group => { group.batchId = batchId; state.analyses.push(group); });
      fresh.forEach(row => { state.signals.push({ ...row, batchId, importedAt: now() }); });
      groups.forEach(group => record(state, actor, 'AI classification proposed', group.analysis.engine + ': ' + group.analysis.issue_summary + '. No issue changes applied before review.', { clientId: group.clientId, issueId: group.candidateIssueId }));
      const saved = {
        id: batchId, name: clean(batch.name,150) || 'Manual import', at: now(), actorId: actor.employeeId,
        received: rows.length, processed: rows.filter(r => !r.errors.length).length, invalid: rows.filter(r => r.errors.length).length,
        duplicateSources: rows.filter(r => r.duplicateSource).length, repeatedSignals: groups.reduce((n,g) => n + Math.max(0,g.signalIds.length - 1),0),
        uniqueIssues: groups.filter(g => g.analysis.actionable).length, critical: groups.filter(g => g.analysis.emergency_type !== 'NONE').length,
        review: groups.filter(g => g.status === 'Needs review').length, fallbackGroups: groups.filter(g => g.analysis.engine !== 'Live Gemini').length,
        failedAI: groups.filter(g => g.failure).length, simulated: rows.some(r => r.simulated), analysisIds: groups.map(g => g.id),
        rows: rows.map(r => ({ signalId: r.id, row: r.sourceRow, status: r.errors.length ? 'Invalid' : r.duplicateSource ? 'Duplicate source' : 'Processed', errors: r.errors }))
      };
      state.batches.push(saved);
      record(state, actor, 'Information batch processed', saved.name + ': ' + saved.received + ' received; ' + saved.processed + ' processed; ' + saved.invalid + ' invalid; ' + saved.duplicateSources + ' repeated source IDs. Issue changes await review.');
    } else if (type === 'group.correct') {
      const group=byId(state.analyses,payload.analysisId,'Analysis'),a=group.analysis;
      if(!['Needs review','Non-actionable'].includes(group.status))fail('Correct the linked issue after an approved review.');
      const reason=requireText(payload.reason,'Correction reason',2000);
      if(!CATEGORIES.includes(payload.category)||!['NONE','OUTAGE','PR'].includes(payload.emergencyType)||typeof payload.actionable!=='boolean')fail('Invalid classification correction.');
      const before={category:a.issue_category,emergencyType:a.emergency_type,actionable:a.actionable,clientId:a.client_id,ratings:clone(a.ratings)};
      if(payload.ratings){
        if(!FACTORS.every(f=>Number.isInteger(payload.ratings[f.key])&&payload.ratings[f.key]>=1&&payload.ratings[f.key]<=5))fail('Correction ratings must be integers from 1 to 5.');
        a.ratings=clone(payload.ratings);
      }
      a.issue_category=payload.category;a.emergency_type=payload.emergencyType;a.actionable=payload.actionable;
      a.client_id=payload.clientId?byId(state.clients,payload.clientId,'Client').id:null;group.clientId=a.client_id;
      a.ratings.F=valueRating(state.clients.find(c=>c.id===a.client_id)?.acvLakh);
      a.resource=a.emergency_type==='PR'||a.issue_category==='public_complaint'?null:a.emergency_type==='OUTAGE'?'technical':a.issue_category==='expansion'?'demo':['renewal','routine','internal'].includes(a.issue_category)?null:'technical';
      a.suggested_assignee_role=a.issue_category==='public_complaint'||a.emergency_type==='PR'?'Support Lead':a.resource==='technical'?'Technical Account Manager':a.resource==='demo'?'Solution Consultant':'Associate Manager';
      a.humanCorrected=true;group.status=a.actionable?'Needs review':'Non-actionable';
      state.feedback.push({id:id(state,'feedback'),analysisId:group.id,category:a.issue_category,before,after:{category:a.issue_category,emergencyType:a.emergency_type,actionable:a.actionable,clientId:a.client_id,ratings:clone(a.ratings)},reason,actorId:actor.employeeId,at:now()});
      record(state,actor,'Human classification correction',reason,{clientId:a.client_id});
    } else if (type === 'plan.save') {
      const plan=payload.plan;
      if(!plan||!['Technical Account Manager','Solution Consultant','Support Lead','Associate Manager'].includes(plan.suggested_assignee_role)||!Array.isArray(plan.missing_information)||!plan.missing_information.every(v=>typeof v==='string'&&v.length<=1000))fail('Invalid action plan.');
      state.aiPlans.push({id:id(state,'plan'),issueId:issue.id,clientId:issue.clientId,source:'Live Gemini',at:now(),recommendedAction:requireText(plan.recommended_action,'Action',1500),suggestedRole:plan.suggested_assignee_role,capacityNote:requireText(plan.capacity_note,'Capacity note',1500),missing:plan.missing_information,status:'Proposed; not executed'});
      record(state,actor,'AI action plan prepared','Proposed next action saved for human review; no work assigned.',refs);
    } else if (type === 'group.review') {
      const group = byId(state.analyses, payload.analysisId, 'Analysis');
      if (group.status !== 'Needs review') fail('This proposal has already been reviewed.');
      const reason = requireText(payload.reason, 'Review note', 2000);
      if (payload.reject) { group.status = 'Rejected'; record(state,actor,'Proposal rejected',reason); }
      else {
        const clientId = payload.clientId || group.clientId;
        byId(state.clients, clientId, 'Client');
        let target = payload.targetIssueId ? byId(state.issues,payload.targetIssueId,'Issue') : state.issues.find(i => i.dedupeKeys.includes(group.key));
        if (target && target.clientId !== clientId) fail('Evidence cannot be linked to a different client.');
        const a = group.analysis;
        if (!target) {
          const resource = a.emergency_type === 'PR' ? null : a.resource;
          target = { id: id(state,'issue'), clientId, title: a.issue_summary, category: a.issue_category, emergencyType: a.emergency_type, ratings: { ...a.ratings, F: valueRating(byId(state.clients,clientId).acvLakh) }, evidence: [], missingInformation: a.missing_information, impact: a.business_impact, nextAction: a.recommended_action, resource, estimatedHours: resource === 'technical' ? 2 : resource === 'demo' ? 1 : 0, status: 'Open', reportedAt: now(), deadline: a.deadline, lastUpdate: now(), source: a.engine, simulated: group.simulated, confidence: a.confidence, recurrence: null, incidentRef: null, dedupeKeys: [], investigation: {}, verifiedFacts: [] };
          state.issues.push(target);
        } else if (TERMINAL.includes(target.status)) {
          target.status = 'Reopened'; target.recurrence = (target.recurrence || 1) + 1;
          record(state,actor,'Issue reopened','New reviewed evidence was linked; historical resolutions are retained.',{clientId,issueId:target.id});
        }
        target.dedupeKeys = [...new Set([...target.dedupeKeys,group.key])];
        target.containsSimulatedEvidence=Boolean(target.containsSimulatedEvidence||group.simulated);
        for (const signalId of group.signalIds) if (!state.issueSources.some(link => link.issueId === target.id && link.signalId === signalId)) state.issueSources.push({ id: id(state,'link'), issueId: target.id, signalId, reviewedBy: actor.employeeId, at: now() });
        target.evidence = [...new Set([...target.evidence,...a.supporting_evidence])].slice(-30);
        group.status = 'Approved'; group.issueId = target.id;
        state.reviews.push({ id: id(state,'review'), analysisId: group.id, issueId: target.id, actorId: actor.employeeId, note: reason, at: now() });
        record(state,actor,'Signal intelligence approved',group.signalIds.length + ' source records linked. ' + reason,{clientId,issueId:target.id});
      }
    } else if (type === 'task.create') {
      if (TERMINAL.includes(issue.status)) fail('Reopen the issue before proposing additional work.');
      const resource = payload.resource || null;
      if (resource !== null && !RESOURCES[resource]) fail('Invalid specialist pool.');
      if (issue.category === 'public_complaint' && resource !== null) fail('Public complaint containment uses Support, not scarce specialist capacity.');
      const effort = number(payload.plannedHours ?? 0, 'Planned hours',24);
      if (!resource && effort !== 0) fail('Account/support tasks consume zero scarce specialist hours.');
      const created = { id: id(state,'task'), issueId: issue.id, clientId: issue.clientId, title: requireText(payload.description,'Task description',2000), description: payload.description, resource, plannedHours: effort, actualHours: null, status: 'Proposed', assigneeId: null, dueDate: null, deliverable: '', instructions: '', escalationContact: 'Manager Priya (message)', evidence: '', resolutionNotes: '', createdAt: now(), updatedAt: now(), delivery: 'Not assigned', verifiedBy: null };
      state.tasks.push(created); record(state,actor,'Task proposed',created.title,{...refs,taskId:created.id});
    } else if (type === 'allocation.edit') {
      if (!['Proposed','Approved'].includes(task.status)) fail('Reassign an active task to change a confirmed allocation.');
      const effort = number(payload.plannedHours,'Planned hours',24);
      if (effort * 4 % 1 !== 0 || (!task.resource && effort)) fail('Use quarter-hour steps; support/account tasks use zero specialist hours.');
      task.plannedHours = effort; record(state,actor,'Planning allocation updated',effort + 'h, not a confirmed assignment.',refs);
    } else if (type === 'task.approve') {
      if (task.status !== 'Proposed') fail('Only a proposed task can be approved.');
      requireText(payload.note,'Approval note',2000); task.status = 'Approved'; record(state,actor,'Task approved',payload.note,refs);
    } else if (['task.assign','task.reassign'].includes(type)) {
      if (type === 'task.assign' && task.status !== 'Approved') fail('Approve the task before assignment.');
      if (type === 'task.reassign' && !['Assigned','Acknowledged','In Progress','Blocked','Reassigned','Reopened'].includes(task.status)) fail('This task cannot be reassigned.');
      const employee = byId(state.employees,payload.employeeId,'Employee');
      if (!employee.capabilities.includes(task.resource || (issue.category === 'public_complaint' ? 'support' : 'account'))) fail('The assignee lacks the required capability.');
      const effort = number(payload.plannedHours ?? task.plannedHours,'Planned hours',24);
      if (effort * 4 % 1 !== 0 || (!task.resource && effort)) fail('Invalid specialist effort.');
      if (task.resource && effort === 0) fail('Assign positive planning hours for specialist work; leave zero-hour work unassigned.');
      if (actor.mode === 'connected' && !context.deliverableEmployeeIds?.includes(employee.id)) fail('No authenticated user is mapped to this employee. Assignment was not delivered.',409);
      if (payload.dueDate && Number.isNaN(Date.parse(payload.dueDate))) fail('Invalid due date.');
      task.deliverable = requireText(payload.deliverable,'Expected deliverable',2000);
      if (payload.description != null) { task.description = requireText(payload.description,'Task description',2000); task.title = task.description; }
      if (payload.priority != null && !['Follow issue','Urgent','High','Normal','Low'].includes(payload.priority)) fail('Invalid operational priority.');
      task.priority = payload.priority || 'Follow issue';
      task.instructions = clean(payload.instructions,3000); task.dueDate = payload.dueDate || null;
      task.escalationContact = requireText(payload.escalationContact || 'Manager Priya (message)','Escalation contact',300);
      const beforeCapacity = capacity(state), oldCharge = task.assigneeId && task.resource ? (TERMINAL.includes(task.status) ? task.actualHours || 0 : Math.max(task.plannedHours,task.actualHours || 0)) : 0;
      if (task.resource && beforeCapacity[task.resource].confirmed - oldCharge + Math.max(effort,task.actualHours || 0) > RESOURCES[task.resource].budget && (!payload.acceptConflict || !clean(payload.conflictReason))) fail('Assignment exceeds capacity. Reallocate, defer, or explicitly record the unresolved conflict.');
      state.assignments.filter(a => a.taskId === task.id && a.active).forEach(a => { a.active = false; a.endedAt = now(); });
      task.plannedHours = effort; task.assigneeId = employee.id; task.status = type === 'task.reassign' ? 'Reassigned' : 'Assigned';
      task.delivery = actor.mode === 'connected' ? 'Available in authenticated task inbox' : 'Simulated role inbox · not cross-user delivery';
      state.assignments.push({ id: id(state,'assignment'), taskId: task.id, employeeId: employee.id, assignedBy: actor.employeeId, at: now(), active: true, delivery: task.delivery });
      state.allocations.push({ id: id(state,'allocation'), taskId: task.id, resource: task.resource, hours: effort, stage: 'Confirmed assignment', at: now() });
      record(state,actor,type === 'task.reassign' ? 'Task reassigned' : 'Task assigned',employee.name + '. ' + task.delivery + (payload.acceptConflict ? '. Capacity conflict remains: ' + clean(payload.conflictReason) : ''),refs);
    } else if (['task.acknowledge','task.start','task.block','task.progress','task.resolve','investigation.update'].includes(type)) {
      owner(actor, task);
      if (TERMINAL.includes(task.status)) fail('This task is not active.');
      if (type === 'task.acknowledge') {
        if (!['Assigned','Reassigned','Reopened'].includes(task.status)) fail('Only a new assignment can be acknowledged.');
        task.status = 'Acknowledged'; record(state,actor,'Assignment acknowledged','The assignee acknowledged receipt. Work has not yet started.',refs);
      } else if (type === 'task.start') {
        if (!['Acknowledged','Blocked'].includes(task.status)) fail('Acknowledge the assignment before starting.');
        task.status = 'In Progress'; issue.status = 'In Progress'; record(state,actor,'Work started',clean(payload.note) || 'Assignee explicitly started work.',refs);
      } else if (type === 'task.progress' || type === 'task.block') {
        if (!['In Progress','Blocked','Acknowledged'].includes(task.status)) fail('Acknowledge the assignment before progress updates.');
        const note = requireText(payload.note,type === 'task.block' ? 'Blocker' : 'Progress note',3000);
        if (payload.actualHours != null) {
          const actual = number(payload.actualHours,'Actual hours',200);
          if (actual < (task.actualHours || 0)) fail('Cumulative actual hours cannot decrease.');
          task.actualHours = actual;
        }
        if (type === 'task.block') { task.status = 'Blocked'; issue.status = 'Blocked'; }
        record(state,actor,type === 'task.block' ? 'Work blocked' : 'Progress update',note + (payload.evidence ? ' Evidence: ' + clean(payload.evidence,2000) : ''),refs);
      } else if (type === 'investigation.update') {
        if (!['In Progress','Blocked'].includes(task.status) || !STAGES.includes(payload.stage) || payload.stage === 'verification') fail('Only active investigation stages can be updated by the assignee.');
        issue.investigation[payload.stage] = { note: requireText(payload.note,'Investigation evidence',3000), by: actor.employeeId, at: now() };
        record(state,actor,'Investigation: ' + payload.stage,payload.note,refs);
      } else {
        if (!['In Progress','Blocked'].includes(task.status)) fail('Work must start before resolution can be reported.');
        const evidence = requireText(payload.evidence,'Resolution evidence',3000), note = requireText(payload.note,'Resolution note',3000);
        if (issue.category === 'order_updates') {
          if (!['rootCause','correction','recovery','monitoring'].every(stage => issue.investigation[stage]?.note?.length >= 12)) fail('Permanent correction requires root-cause, correction, transaction recovery and monitoring evidence. A restart alone is containment.');
          if (/^(?:we\s+)?(?:only\s+)?(?:restarted|restart|rebooted)\s+(?:the\s+)?server[.! ]*$/i.test(note)) fail('A server restart alone is not a permanent resolution.');
        }
        if (payload.actualHours != null) {
          const actual = number(payload.actualHours,'Actual hours',200);
          if (actual < (task.actualHours || 0)) fail('Actual hours cannot decrease.');
          task.actualHours = actual;
        }
        task.evidence = evidence; task.resolutionNotes = note; task.status = 'Resolved';
        issue.status = 'Awaiting verification'; record(state,actor,'Resolution reported',note + ' Evidence: ' + evidence + '. Manager verification is still required.',refs);
      }
    } else if (type === 'task.verify') {
      if (task.status !== 'Resolved') fail('The assignee must report resolution first.');
      const note = requireText(payload.note,'Verification evidence',3000);
      if (issue.category === 'order_updates' && payload.permanentFixVerified !== true) fail('Confirm permanent correction and recovery after inspecting the evidence.');
      task.status = 'Verified'; task.verifiedBy = actor.employeeId; task.verifiedAt = now();
      issue.status = 'Verified';
      issue.investigation.verification = { note, by: actor.employeeId, at: now() };
      record(state,actor,'Outcome verified',note,refs);
    } else if (type === 'task.close') {
      if (task.status !== 'Verified') fail('Verify the outcome before closing.');
      task.status = 'Closed'; task.closedAt = now();
      state.assignments.filter(a => a.taskId === task.id && a.active).forEach(a => { a.active = false; a.endedAt = now(); });
      const related = state.tasks.filter(t => t.issueId === issue.id);
      if (related.every(t => TERMINAL.includes(t.status))) { issue.status = 'Closed'; issue.resolvedAt = now(); issue.verificationStatus = 'Manager verified'; }
      record(state,actor,'Task closed',issue.status === 'Closed' ? 'All linked tasks are closed or cancelled; the verified issue remains in client history.' : 'Other linked tasks remain active; the issue stays open.',refs);
    } else if (type === 'task.reopen') {
      if (!['Resolved','Verified','Closed'].includes(task.status)) fail('Only a resolved or closed task can be reopened.');
      task.status = 'Reopened'; task.verifiedBy = null; issue.status = 'Reopened'; issue.recurrence = (issue.recurrence || 1) + 1;
      record(state,actor,'Issue reopened',requireText(payload.note,'Reopening reason',2000),refs);
    } else if (type === 'task.cancel') {
      if (TERMINAL.includes(task.status)) fail('Task is already closed or cancelled.');
      task.status = 'Cancelled'; state.assignments.filter(a => a.taskId === task.id && a.active).forEach(a => { a.active = false; a.endedAt = now(); });
      if (!state.tasks.some(t => t.issueId === issue.id && !TERMINAL.includes(t.status))) issue.status = 'Open';
      record(state,actor,'Task cancelled',requireText(payload.note,'Cancellation reason',2000) + '. Cancellation does not declare the issue resolved.',refs);
    } else if (type === 'issue.note') {
      const note = requireText(payload.note,'Verified note',3000);
      issue.verifiedFacts.push({ text: note, actorId: actor.employeeId, at: now() });
      record(state,actor,'Verified issue fact recorded',note,refs);
    } else if (type.startsWith('draft.')) {
      const draft = byId(state.communications,payload.draftId,'Draft');
      if (type === 'draft.edit') {
        draft.text = requireText(payload.text,'Draft',6000); draft.checks = draft.checks.map(() => false); draft.status = 'Needs review'; draft.source = payload.source === 'Live Gemini' ? 'Live Gemini · unverified draft' : 'Human-edited draft';
      } else if (type === 'draft.check') {
        if (!Number.isInteger(payload.index) || payload.index < 0 || payload.index >= draft.checks.length || typeof payload.checked !== 'boolean') fail('Invalid verification checkbox.');
        draft.checks[payload.index] = payload.checked;
        draft.status = draft.checks.every(Boolean) && !/\[[^\]]+\]/.test(draft.text) ? 'Ready to copy' : 'Needs review';
      } else if (type === 'draft.copy') {
        if (draft.status !== 'Ready to copy' || !draft.checks.every(Boolean) || /\[[^\]]+\]/.test(draft.text)) fail('Complete verification and replace every placeholder before copying.');
        record(state,actor,'Verified draft copied','Copied for manual sending; no message was sent.',{clientId:draft.clientId,issueId:draft.issueId});
      } else fail('Unknown draft action.');
      if (type !== 'draft.copy') record(state,actor,type === 'draft.edit' ? 'Draft edited; approval reset' : 'Draft verification updated',draft.title,{clientId:draft.clientId,issueId:draft.issueId});
    } else if (type === 'opportunity.edit') {
      const opportunity = byId(state.opportunities,payload.opportunityId,'Opportunity');
      if (payload.milestoneIndex != null) {
        const milestone = opportunity.milestones[payload.milestoneIndex];
        if (!milestone || !['Proposed','In Progress','Done'].includes(payload.status)) fail('Invalid milestone.');
        milestone.status = payload.status;
      } else {
        opportunity.readiness = requireText(payload.readiness,'Readiness',500);
        opportunity.nextAction = requireText(payload.nextAction,'Next action',2000);
        opportunity.targetDate = payload.targetDate || null;
        if (opportunity.targetDate && Number.isNaN(Date.parse(opportunity.targetDate))) fail('Invalid target date.');
      }
      record(state,actor,'Opportunity plan updated',requireText(payload.note,'Update note',1000),{clientId:opportunity.clientId});
    } else fail('Unsupported workspace action.');
    if (task) task.updatedAt = now();
    state.revision++; state.updatedAt = now();
    return validateState(state);
  }
  function viewFor(state, actor) {
    if (actor.role === 'manager') return clone(state);
    const taskIds = new Set(state.tasks.filter(t => t.assigneeId === actor.employeeId).map(t => t.id));
    const issueIds = new Set(state.tasks.filter(t => taskIds.has(t.id)).map(t => t.issueId));
    const clientIds = new Set(state.issues.filter(i => issueIds.has(i.id)).map(i => i.clientId));
    const signalIds = new Set(state.issueSources.filter(link => issueIds.has(link.issueId)).map(link => link.signalId));
    const result = clone(state);
    result.tasks = result.tasks.filter(t => taskIds.has(t.id)); result.issues = result.issues.filter(i => issueIds.has(i.id));
    result.clients = result.clients.filter(c => clientIds.has(c.id)); result.stakeholders = result.stakeholders.filter(s => clientIds.has(s.clientId));
    result.signals = result.signals.filter(s => signalIds.has(s.id)); result.issueSources = result.issueSources.filter(l => issueIds.has(l.issueId));
    result.activity = result.activity.filter(a => taskIds.has(a.taskId) || issueIds.has(a.issueId));
    result.assignments = result.assignments.filter(a => taskIds.has(a.taskId)); result.allocations = result.allocations.filter(a => taskIds.has(a.taskId));
    result.batches = []; result.analyses = []; result.reviews = []; result.feedback = []; result.communications = []; result.opportunities = [];
    result.aiPlans = [];
    result.employees.forEach(e => { if (e.id !== actor.employeeId) e.email = null; });
    return result;
  }
  return { VERSION, FACTORS, SCENARIOS, RESOURCES, STAGES, INVESTIGATION, TERMINAL, clone, clean, normalized, hash, valueRating, weights, score, emergency, priorities, capacity, seed, identifyClient, classify, validateAnalysis, parseCSV, parseImport, mapRecord, normalizeRecords, groupSignals, sampleMonday, sampleSupplement, validateState, applyAction, viewFor };
});

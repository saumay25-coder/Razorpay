const D = require('../lib/domain.js');
const { SIGNAL_PROMPT, ACTION_PROMPT } = require('../lib/prompts.js');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({ error:'Use POST.' }); }
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({error:'Invalid JSON.'}); }
  let providerPhase=false;
  try {
    if (!body || !['signals','plan','draft'].includes(body.mode)) throw new Error('Choose a supported analysis mode.');
    const state = D.seed();
    if (body.clients != null) {
      if (!Array.isArray(body.clients) || body.clients.length > 200) throw new Error('Invalid client context.');
      state.clients = body.clients.map(c => {
        if (!c || typeof c.id !== 'string' || c.id.length > 100 || typeof c.name !== 'string' || c.name.length > 150 || (c.acvLakh !== null && (!Number.isFinite(c.acvLakh) || c.acvLakh < 0 || c.acvLakh > 50000))) throw new Error('Invalid client context.');
        return { id:c.id,name:c.name,acvLakh:c.acvLakh };
      });
    }
    let input;
    if (body.mode === 'signals') {
      if (!Array.isArray(body.groups) || !body.groups.length || body.groups.length > 4 || new Set(body.groups.map(g=>g.id)).size !== body.groups.length) throw new Error('Process 1–4 distinct issue groups per request.');
      input = {
        clients:state.clients,
        knownIssues:Array.isArray(body.knownIssues) ? body.knownIssues.slice(0,100).map(i=>({id:D.clean(i.id,100),clientId:D.clean(i.clientId,100),category:D.clean(i.category,100),title:D.clean(i.title,300)})) : [],
        feedback:Array.isArray(body.feedback) ? body.feedback.slice(-5).map(f=>({category:D.clean(f.category,100),after:f.after,reason:D.clean(f.reason,500)})) : [],
        groups:body.groups.map(group=>{
          if (!group || typeof group.id !== 'string' || group.id.length > 150 || !Array.isArray(group.records) || !group.records.length || group.records.length > 5) throw new Error('Invalid group evidence.');
          return { id:group.id, records:group.records.map(r=>{
            if (!r || typeof r.content !== 'string' || !r.content.trim() || r.content.length > 2000) throw new Error('Evidence must be 1–2000 characters.');
            return {clientId:D.clean(r.clientId,100)||null,subject:D.clean(r.subject,300),content:r.content,source:D.clean(r.source,30)};
          })};
        })
      };
      state.issues=input.knownIssues;
    } else {
      if (!body.issue || typeof body.issue !== 'object' || JSON.stringify(body.issue).length > 18000 || !body.capacity || JSON.stringify(body.capacity).length > 5000) throw new Error('Provide bounded verified issue context and capacity.');
      input = { issue:body.issue, capacity:body.capacity, priority:body.priority, communicationDraftRequested:body.mode === 'draft', note:'Planning estimates are not bookings. Only verifiedFacts may support factual draft claims.' };
    }
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({error:'Live Gemini is not configured. Use the labelled simulator.',code:'NOT_CONFIGURED'});
    providerPhase=true;
    const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),20000);
    try {
      const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{
        method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},signal:controller.signal,
        body:JSON.stringify({systemInstruction:{parts:[{text:body.mode === 'signals' ? SIGNAL_PROMPT : ACTION_PROMPT}]},contents:[{role:'user',parts:[{text:JSON.stringify(input)}]}],generationConfig:{responseMimeType:'application/json',temperature:0.1}})
      });
      if (!upstream.ok) {
        const rateLimited = upstream.status === 429;
        if (rateLimited) res.setHeader('Retry-After','2');
        return res.status(rateLimited?429:502).json({error:rateLimited?'Gemini is rate limited; retry this controlled chunk.':'Gemini provider request failed.',code:rateLimited?'RATE_LIMIT':'PROVIDER_ERROR',retryAfter:rateLimited?2:null});
      }
      const data = await upstream.json(), text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
      let output;
      try { output=JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,'')); } catch { throw new Error('Invalid structured model output.'); }
      if (body.mode === 'signals') {
        if (!Array.isArray(output.results) || output.results.length !== body.groups.length) throw new Error('Gemini did not account for every group.');
        const seen = new Set();
        const results = output.results.map(row=>{
          if (!body.groups.some(g=>g.id===row.group_id)||seen.has(row.group_id)) throw new Error('Unexpected or duplicate group result.');
          seen.add(row.group_id); return {group_id:row.group_id,...D.validateAnalysis(row,state)};
        });
        return res.status(200).json({source:'Live Gemini',results});
      }
      if (!output || typeof output.recommended_action !== 'string' || output.recommended_action.length > 1500 || !['Technical Account Manager','Solution Consultant','Support Lead','Associate Manager'].includes(output.suggested_assignee_role) || !Array.isArray(output.missing_information) || !output.missing_information.every(v=>typeof v==='string'&&v.length<=1000) || typeof output.capacity_note !== 'string' || output.capacity_note.length > 1500 || (output.draft !== null && (typeof output.draft !== 'string'||output.draft.length>6000))) throw new Error('Invalid action-plan output.');
      return res.status(200).json({source:'Live Gemini',plan:{recommended_action:output.recommended_action,suggested_assignee_role:output.suggested_assignee_role,missing_information:output.missing_information,capacity_note:output.capacity_note,draft:output.draft}});
    } finally { clearTimeout(timer); }
  } catch (error) {
    return res.status(error.name==='AbortError'?504:providerPhase?502:400).json({error:error.name==='AbortError'?'Gemini timed out. Previously saved records are unchanged.':providerPhase?'Live AI returned invalid data or could not be reached. Previously saved records are unchanged.':error.message,code:'ANALYSIS_FAILED'});
  }
};

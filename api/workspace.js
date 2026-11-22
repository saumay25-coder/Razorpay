const D = require('../lib/domain.js');
const C = require('../lib/connected.js');
module.exports=async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (!['GET','POST'].includes(req.method)) {res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Use GET or POST.'});}
  try {
    const actor=await C.identity(req), state=await C.load();
    if (req.method==='GET') return res.status(200).json({state:D.viewFor(state,actor),actor});
    let body;
    try {body=typeof req.body==='string'?JSON.parse(req.body):req.body;} catch {return res.status(400).json({error:'Invalid JSON.'});}
    if (!body || !Number.isInteger(body.expectedRevision) || body.expectedRevision!==state.revision || typeof body.action?.type!=='string') return res.status(409).json({error:'Refresh the workspace before applying this change.'});
    const context={};
    if (['task.assign','task.reassign'].includes(body.action.type)) context.deliverableEmployeeIds=await C.recipients();
    const next=D.applyAction(state,body.action,actor,context);
    await C.commit(next,state.revision);
    return res.status(200).json({state:D.viewFor(next,actor),actor});
  } catch(error) {
    return res.status(error.status||502).json({error:error.status && error.status<500?error.message:'Connected service is unavailable or unconfigured. No local simulation has been substituted.'});
  }
};

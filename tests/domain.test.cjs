const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../lib/domain.js');
const manager={employeeId:'emp-manager',role:'manager',mode:'demo'};
const technical={employeeId:'emp-technical',role:'assignee',mode:'demo'};
const support={employeeId:'emp-support',role:'assignee',mode:'demo'};
const apply=(s,type,payload={},actor=manager,context={})=>D.applyAction(s,{type,payload},actor,context);
function ingest(s,raw=D.sampleMonday(),name='Sample Monday'){
  const rows=D.normalizeRecords(s,raw),groups=D.groupSignals(s,rows);
  return apply(s,'batch.save',{batch:{name,records:raw,groups:groups.map(g=>({key:g.key,candidateIssueId:g.candidateIssueId,signalIds:g.records.map(r=>r.id),analysis:g.analysis}))}});
}
function assign(s,taskId='task-1',employeeId='emp-technical',extra={}){
  s=apply(s,'task.approve',{taskId,note:'Reviewed evidence and planning effort.'});
  return apply(s,'task.assign',{taskId,employeeId,deliverable:'Provide tested resolution evidence and a verified progress report.',plannedHours:s.tasks.find(t=>t.id===taskId).plannedHours,...extra});
}
test('H / B: exactly 12 baseline accounts, 7 case items, unknowns and separate revenue',()=>{
  const s=D.seed();
  assert.equal(s.clients.length,12);assert.equal(s.issues.length,7);assert.equal(s.tasks.length,7);
  assert.equal(s.clients.reduce((sum,c)=>sum+(c.acvLakh||0),0),380);
  assert.equal(s.opportunities[0].upsideLakh,60);assert.equal(s.opportunities[1].upsideLakh,null);
  assert.equal(s.issues.find(i=>i.id==='case-2').ratings.F,3);
  assert.equal(s.issues.find(i=>i.id==='case-2').ratings.G,5);
  assert.equal(s.issues.find(i=>i.id==='case-7').clientId,null);
  for(const c of s.clients.slice(6)){assert.equal(c.acvLakh,null);assert.equal(c.health,'Not assessed');assert.equal(s.issues.filter(i=>i.clientId===c.id).length,0);}
  assert.equal(s.clients.find(c=>c.id==='orbit').stakeholder,null);
  assert.ok(s.clients.filter(c=>c.placeholder).every(c=>!['FreshMart','Verve','Deccan'].some(name=>c.name.includes(name))));
  for(const c of s.clients)assert.ok(c.id&&Array.isArray(c.products));
});
test('A: all 160 records accounted for; 13-record outage consolidated; distinct issue retained',()=>{
  const original=D.seed(),raw=D.sampleMonday(),s=ingest(original),batch=s.batches[0];
  assert.equal(raw.length,160);assert.equal(raw.filter(r=>r.source==='email').length,120);assert.equal(raw.filter(r=>r.source==='ticket').length,40);
  assert.deepEqual(D.sampleMonday(),raw,'Dataset is reproducible');
  assert.equal(batch.received,160);assert.equal(batch.processed,160);assert.equal(batch.invalid,0);assert.equal(s.signals.length,160);
  assert.equal(batch.rows.length,160);assert.equal(batch.uniqueIssues,10);assert.equal(s.issues.length,7,'No issue changes before review');
  assert.equal(s.tasks.length,7,'Messages do not become tasks');
  assert.equal(batch.repeatedSignals,147);
  const annam=s.analyses.find(a=>a.candidateIssueId==='case-1');
  assert.equal(annam.signalIds.length,13);
  const reviewed=apply(s,'group.review',{analysisId:annam.id,clientId:'annam',targetIssueId:'case-1',reason:'All 13 messages describe the same supplied invoice outage.'});
  assert.equal(reviewed.issueSources.filter(l=>l.issueId==='case-1').length,13);
  const separate=reviewed.analyses.find(a=>a.clientId==='annam'&&a.analysis.issue_category==='technical');
  const final=apply(reviewed,'group.review',{analysisId:separate.id,clientId:'annam',reason:'Separate inventory export complaint, not the invoice incident.'});
  assert.equal(final.issues.filter(i=>i.clientId==='annam').length,2);
  assert.equal(final.issues.length,8);
  assert.ok(final.activity.some(a=>a.clientId==='annam'&&a.type==='Signal intelligence approved'));
  assert.deepEqual(original.signals,[],'Mutations are atomic copies');
});
test('A / F: repeated imports cannot duplicate signals, links or issues',()=>{
  let s=ingest(D.seed());
  const g=s.analyses.find(a=>a.candidateIssueId==='case-1');
  s=apply(s,'group.review',{analysisId:g.id,clientId:'annam',targetIssueId:'case-1',reason:'Reviewed source consolidation.'});
  s=ingest(s);
  assert.equal(s.signals.length,160);assert.equal(s.batches[1].duplicateSources,160);assert.equal(s.batches[1].uniqueIssues,0);
  assert.equal(s.issueSources.filter(l=>l.issueId==='case-1').length,13);
  assert.equal(s.issues.length,7);
});
test('A: CSV mapping, quoted multiline data, invalid rows and conflicting IDs',()=>{
  const csv='\uFEFFMail ID,Account,Complaint,Type\nE1,annam,"Invoices blocked,\nsuppliers unpaid",email\nE2,annam,"Said ""hello""",email';
  const raw=D.parseImport(csv,'messages.csv'),map={externalId:'Mail ID',clientId:'Account',content:'Complaint',source:'Type'};
  const rows=D.normalizeRecords(D.seed(),raw,map);
  assert.equal(rows.length,2);assert.equal(rows[0].content,'Invoices blocked,\nsuppliers unpaid');assert.equal(rows[1].content,'Said "hello"');assert.equal(rows[0].errors.length,0);
  assert.throws(()=>D.parseCSV('id,body\n1,"unfinished'),/unclosed/);
  assert.throws(()=>D.parseImport('null','data.json'));
  const mixed=[{id:'bad',source:'ticket',client:'annam',body:''},{id:'good',source:'email',client:'annam',body:'Invoices are unpaid.'},{id:'date',source:'email',client:'annam',body:'Message',timestamp:'not-a-date'}];
  const s=ingest(D.seed(),mixed,'Invalid row exercise');
  assert.equal(s.batches[0].received,3);assert.equal(s.batches[0].processed,1);assert.equal(s.batches[0].invalid,2);
  const conflict=D.normalizeRecords(s,[{...mixed[1],body:'Different content for the same source ID.'}]);
  assert.match(conflict[0].errors.join(' '),/different content/);
});
test('A: unknown clients remain reviewable and cannot be silently invented',()=>{
  let s=ingest(D.seed(),[{id:'unknown-1',source:'email',client:'Unlisted Company',body:'Our invoice processing is blocked; suppliers remain unpaid.'}]);
  const a=s.analyses[0];assert.equal(a.clientId,null);
  assert.throws(()=>apply(s,'group.review',{analysisId:a.id,reason:'Approve without mapping'}),/Client not found/);
  s=apply(s,'group.review',{analysisId:a.id,clientId:'annam',reason:'Human identified the source as Annam.'});
  assert.equal(s.clients.length,12);
});
test('D: scores and real scenario movements; monetary facts do not change',()=>{
  let s=D.seed(),initial=D.priorities(s);
  assert.deepEqual(initial.emergencies.map(i=>i.id),['case-1','case-4']);
  assert.deepEqual(initial.ranked.map(i=>i.id),['case-3','case-5','case-6','case-2','case-7']);
  assert.equal(D.score(s,s.issues.find(i=>i.id==='case-2')),2.85);
  const facts=JSON.stringify(s.clients);
  s=apply(s,'scenario.change',{preset:'growth'});
  assert.equal(D.priorities(s).ranked[0].id,'case-6');assert.match(s.scenarioSettings.lastChange,/Executive visit with unresolved issues: #3 to #1/);
  assert.equal(JSON.stringify(s.clients),facts);assert.equal(D.priorities(s).emergencies.length,2);
  s=apply(s,'comparison.change',{mode:'value'});
  assert.deepEqual(D.priorities(s).ranked.map(i=>i.id),['case-6','case-3','case-5','case-2','case-7']);
  assert.equal(D.priorities(s).emergencies.length,2);
  s=apply(s,'weights.change',{weights:{F:0,U:0,I:0,R:0,S:0,G:0}});
  assert.ok(Math.abs(Object.values(D.weights(s)).reduce((sum,w)=>sum+w,0)-100)<1e-9);
  assert.ok(s.issues.every(i=>D.score(s,i)>=1&&D.score(s,i)<=5));
});
test('E: proposed, approved, confirmed and actual hours are distinct; overbooking cannot be silent',()=>{
  let s=D.seed(),c=D.capacity(s);
  assert.equal(c.technical.proposed,8);assert.equal(c.demo.proposed,1);assert.equal(c.technical.confirmed,0);assert.equal(c.technical.actual,0);
  s=apply(s,'allocation.edit',{taskId:'task-1',plannedHours:5});assert.equal(D.capacity(s).technical.planConflict,true);
  assert.equal(D.capacity(s).demo.planned,1);
  s=assign(s,'task-1');assert.equal(D.capacity(s).technical.confirmed,5);
  s=assign(s,'task-5');s=apply(s,'task.approve',{taskId:'task-6',note:'Reviewed Orbit proposal.'});
  assert.throws(()=>apply(s,'task.assign',{taskId:'task-6',employeeId:'emp-technical',plannedHours:1.5,deliverable:'Audit three issues.'}),/exceeds capacity/);
  s=apply(s,'task.assign',{taskId:'task-6',employeeId:'emp-technical',plannedHours:1.5,deliverable:'Audit three issues.',acceptConflict:true,conflictReason:'Request additional capacity from Priya; not yet granted.'});
  assert.equal(D.capacity(s).technical.assignmentConflict,true);
  assert.equal(D.capacity(s).technical.confirmed,9);
  assert.ok(s.activity.some(a=>a.details.includes('Capacity conflict remains')));
  assert.throws(()=>apply(s,'allocation.edit',{taskId:'task-4',plannedHours:1}),/support\/account/i);
  assert.throws(()=>apply(s,'allocation.edit',{taskId:'task-2',plannedHours:0.1}),/quarter-hour/);
});
test('C / F: complete delegation, simulated inbox, execution, verification and retained history',()=>{
  let s=assign(D.seed());
  assert.equal(s.tasks[0].status,'Assigned');assert.match(s.tasks[0].delivery,/Simulated/);
  assert.equal(s.issues[0].status,'Open','Assignment is not evidence of work starting');
  assert.equal(D.viewFor(s,technical).tasks.length,1);
  s=apply(s,'task.acknowledge',{taskId:'task-1'},technical);
  s=apply(s,'task.start',{taskId:'task-1'},technical);
  s=apply(s,'task.progress',{taskId:'task-1',note:'Inspected the supplied test logs.',actualHours:1,evidence:'Synthetic test log reference'},technical);
  s=apply(s,'task.resolve',{taskId:'task-1',note:'Synthetic test correction is ready for verification.',evidence:'Synthetic supplier invoice generation test evidence.',actualHours:2},technical);
  assert.equal(s.tasks[0].status,'Resolved');assert.equal(s.issues[0].status,'Awaiting verification');
  assert.throws(()=>apply(s,'task.close',{taskId:'task-1'}),/Verify/);
  s=apply(s,'task.verify',{taskId:'task-1',note:'Manager inspected synthetic invoice generation evidence.'});
  assert.equal(s.tasks[0].status,'Verified');
  s=apply(s,'task.close',{taskId:'task-1'});
  assert.equal(s.issues[0].status,'Closed');assert.equal(s.issues.length,7);
  assert.equal(D.priorities(s).emergencies.length,1);
  const restored=D.validateState(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.tasks[0].status,'Closed');assert.equal(restored.tasks[0].assigneeId,'emp-technical');
  const events=restored.activity.filter(a=>a.issueId==='case-1').map(a=>a.type);
  for(const expected of ['Task approved','Task assigned','Assignment acknowledged','Work started','Progress update','Resolution reported','Outcome verified','Task closed'])assert.ok(events.includes(expected),expected);
  assert.ok(restored.activity.every(a=>a.at&&a.actorId));
  s=apply(s,'task.reopen',{taskId:'task-1',note:'Synthetic recurrence exercise.'});
  assert.equal(s.issues[0].status,'Reopened');assert.ok(s.tasks[0].resolutionNotes);
});
test('I: assignee cannot approve, assign, verify, edit clients or update another assignee’s work',()=>{
  let s=assign(D.seed());
  for(const [type,payload] of [
    ['task.approve',{taskId:'task-2',note:'No authority'}],['task.verify',{taskId:'task-1',note:'No authority'}],
    ['task.assign',{taskId:'task-1'}],['client.edit',{clientId:'annam',changes:{name:'Unauthorized'},reason:'No authority'}],
    ['rating.correct',{issueId:'case-1'}],['employee.edit',{employeeId:'emp-technical'}]
  ])assert.throws(()=>apply(s,type,payload,technical),/Manager approval/);
  assert.throws(()=>apply(s,'task.acknowledge',{taskId:'task-1'},support),/active assignee/);
  assert.throws(()=>apply(s,'task.start',{taskId:'task-1'},technical),/Acknowledge/);
  assert.equal(D.viewFor(s,support).tasks.length,0);assert.equal(D.viewFor(s,support).clients.length,0);
  assert.equal(D.viewFor(s,technical).communications.length,0);
});
test('C: reassignment retains history, blockers persist and cancellation is not resolution',()=>{
  let s=assign(D.seed(),'task-3','emp-manager');
  s=apply(s,'task.acknowledge',{taskId:'task-3'},manager);s=apply(s,'task.start',{taskId:'task-3'},manager);
  s=apply(s,'task.block',{taskId:'task-3',note:'Synthetic exercise: buyer unavailable.'},manager);
  assert.equal(s.issues.find(i=>i.id==='case-3').status,'Blocked');
  s=apply(s,'task.reassign',{taskId:'task-3',employeeId:'emp-priya',deliverable:'Review the commercial blocker by message.',plannedHours:0});
  assert.equal(s.assignments.filter(a=>a.taskId==='task-3').length,2);
  assert.equal(s.assignments.filter(a=>a.taskId==='task-3'&&a.active).length,1);
  s=apply(s,'task.cancel',{taskId:'task-3',note:'Synthetic exercise: replace this action plan.'});
  assert.notEqual(s.issues.find(i=>i.id==='case-3').status,'Closed');
});
test('Permanent resolution: restart-only cannot close recurring technical failure',()=>{
  let s=assign(D.seed(),'task-5');s=apply(s,'task.acknowledge',{taskId:'task-5'},technical);s=apply(s,'task.start',{taskId:'task-5'},technical);
  assert.throws(()=>apply(s,'task.resolve',{taskId:'task-5',note:'Restarted the server',evidence:'Server restart log'},technical),/Permanent correction/);
  for(const stage of ['containment','rootCause','correction','recovery','monitoring'])s=apply(s,'investigation.update',{taskId:'task-5',stage,note:'Synthetic investigation evidence for '+stage+'; not a real case diagnosis.'},technical);
  assert.throws(()=>apply(s,'task.resolve',{taskId:'task-5',note:'Restarted the server',evidence:'Server restart log'},technical),/restart alone/);
  s=apply(s,'task.resolve',{taskId:'task-5',note:'Synthetic correction tested with recovery and monitoring.',evidence:'Synthetic test suite and replay evidence.'},technical);
  assert.throws(()=>apply(s,'task.verify',{taskId:'task-5',note:'Checked evidence.'}),/Confirm permanent/);
  s=apply(s,'task.verify',{taskId:'task-5',note:'Verified synthetic correction, recovery and recurrence alert evidence.',permanentFixVerified:true});
  assert.ok(s.issues.find(i=>i.id==='case-5').investigation.verification);
});
test('Human communication: placeholders and incomplete checks block copying; edits reset approval',()=>{
  let s=D.seed();
  for(let index=0;index<3;index++)s=apply(s,'draft.check',{draftId:'draft-sushma',index,checked:true});
  assert.throws(()=>apply(s,'draft.copy',{draftId:'draft-sushma'}),/verification/);
  s=apply(s,'draft.edit',{draftId:'draft-sushma',text:s.communications[0].text.replace('[VERIFIED CALLBACK TIME]','11:00 AM')});
  assert.deepEqual(s.communications[0].checks,[false,false,false]);
  for(let index=0;index<3;index++)s=apply(s,'draft.check',{draftId:'draft-sushma',index,checked:true});
  s=apply(s,'draft.copy',{draftId:'draft-sushma'});assert.equal(s.communications[0].status,'Ready to copy');
  assert.match(s.activity.at(-1).details,/no message was sent/);
});
test('Feedback: human classification/rating corrections are structured, not claimed model training',()=>{
  let s=ingest(D.seed()),group=s.analyses.find(a=>a.analysis.issue_category==='routine');
  s=apply(s,'group.correct',{analysisId:group.id,clientId:group.clientId,category:'technical',emergencyType:'NONE',actionable:true,reason:'Synthetic reviewer found a technical complaint in this routine group.'});
  assert.equal(s.analyses.find(a=>a.id===group.id).status,'Needs review');assert.equal(s.feedback.length,1);
  const issue=s.issues.find(i=>i.id==='case-5'),ratings={...issue.ratings,U:5};
  s=apply(s,'rating.correct',{issueId:issue.id,ratings,emergencyType:'NONE',reason:'Human confirmed an immediate deadline.'});
  assert.equal(s.feedback.length,2);assert.equal(s.issues.find(i=>i.id===issue.id).ratings.U,5);
  assert.throws(()=>apply(s,'rating.correct',{issueId:'case-2',ratings:{F:5,U:4,I:2,R:2,S:2,G:5},emergencyType:'NONE',reason:'Wrongly count expansion twice'}),/contracted value/);
});
test('Connected assignment requires a mapped authenticated recipient; no fake delivery',()=>{
  let s=apply(D.seed(),'task.approve',{taskId:'task-1',note:'Reviewed.'});
  const actor={...manager,mode:'connected'},payload={taskId:'task-1',employeeId:'emp-technical',plannedHours:4,deliverable:'Evidence'};
  assert.throws(()=>apply(s,'task.assign',payload,actor),/No authenticated user/);
  s=apply(s,'task.assign',payload,actor,{deliverableEmployeeIds:['emp-technical']});
  assert.equal(s.tasks[0].delivery,'Available in authenticated task inbox');
});
test('State integrity and account editing preserve relations, original facts and audit reasons',()=>{
  let s=D.seed();
  s=apply(s,'client.edit',{clientId:'demo',changes:{acvLakh:50,stakeholder:'User-entered example stakeholder',stakeholderRole:'User-entered role'},reason:'Synthetic user edit for acceptance test.'});
  assert.equal(s.issues.find(i=>i.id==='case-2').ratings.F,3);assert.ok(s.stakeholders.some(c=>c.clientId==='demo'));
  assert.match(s.activity.at(-1).details,/Synthetic user edit/);
  assert.equal(D.seed().clients.find(c=>c.id==='demo').acvLakh,40);
  const invalid=D.clone(s);invalid.tasks[0].issueId='missing';
  assert.throws(()=>D.validateState(invalid),/broken entity relationship/);
  assert.throws(()=>D.validateState({...s,schemaVersion:99}),/Unsupported/);
});
test('30-day opportunity plans remain proposals and retain unknown expansion values',()=>{
  let s=D.seed();
  assert.equal(s.opportunities.length,2);assert.equal(s.opportunities[1].upsideLakh,null);
  assert.equal(s.opportunities[0].milestones.length,6);
  s=apply(s,'opportunity.edit',{opportunityId:'opp-orbit',milestoneIndex:0,status:'In Progress',note:'Synthetic stakeholder discovery exercise.'});
  assert.equal(s.opportunities[1].milestones[0].status,'In Progress');
  assert.equal(s.opportunities[1].upsideLakh,null);
});

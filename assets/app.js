(function() {
  'use strict';
  const D=window.Tarang, $=id=>document.getElementById(id);
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let store;
  const ui={view:'overview',profile:null,clientQuery:'',clientFilter:'all',taskFilter:'all',signalQuery:'',signalSource:'all',page:0,dialog:null,pending:null,busy:false,progress:'',scoreOpen:false,draftId:'draft-sushma',dirtyDraft:null,queue:Promise.resolve(),connectionConfigured:false,issueSearch:''};
  const icon=name=>'<i data-lucide="'+name+'" aria-hidden="true"></i>';
  const button=(label,action,id='',kind='')=>'<button type="button" class="button '+kind+'" data-action="'+action+'" data-id="'+e(id)+'">'+e(label)+'</button>';
  const help=(label,text)=>'<button type="button" class="info" aria-label="'+e(label)+'" data-help="'+e(text)+'">'+icon('info')+'</button>';
  const badge=(text,kind='gray')=>'<span class="badge '+kind+'">'+e(text)+'</span>';
  const empty=text=>'<div class="empty-compact">'+e(text)+'</div>';
  const money=value=>value==null?'Unknown':'₹'+Number(value.toFixed(2))+'L';
  const hours=value=>Number((value||0).toFixed(2))+'h';
  const date=value=>value?new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'Date not provided';
  const S=()=>store.actor.role==='manager'?store.state:D.viewFor(store.state,store.actor);
  const employee=id=>store.state.employees.find(row=>row.id===id)?.name||id||'Unassigned';
  const clientName=id=>store.state.clients.find(row=>row.id===id)?.name||(id?'Unknown account':'Internal task');
  const isManager=()=>store.actor.role==='manager';
  function icons(){if(window.lucide)window.lucide.createIcons();}
  function toast(text,error=false){$('toast').textContent=text;$('toast').className='toast'+(error?' toast-error':'');clearTimeout(ui.toastTimer);ui.toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),5000);}
  function status(value){return badge(value,['Blocked','Reopened'].includes(value)?'red':['Verified','Closed','Ready to copy'].includes(value)?'teal':['Proposed','Approved','Needs review','Awaiting verification'].includes(value)?'amber':'gray');}
  function field(label,name,value='',type='text',extra=''){return '<label class="form-field">'+e(label)+'<input name="'+name+'" type="'+type+'" value="'+e(value??'')+'" '+extra+'></label>';}
  function area(label,name,value='',extra=''){return '<label class="form-field">'+e(label)+'<textarea name="'+name+'" rows="3" '+extra+'>'+e(value??'')+'</textarea></label>';}
  function options(rows,current,blank=''){return (blank?'<option value="">'+e(blank)+'</option>':'')+rows.map(row=>{const value=typeof row==='string'?row:row.id,label=typeof row==='string'?row:row.name;return '<option value="'+e(value)+'"'+(String(current)===String(value)?' selected':'')+'>'+e(label)+'</option>';}).join('');}
  function select(label,name,rows,current,blank='',extra=''){return '<label class="form-field">'+e(label)+'<select name="'+name+'" '+extra+'>'+options(rows,current,blank)+'</select></label>';}
  function table(headers,rows){return '<div class="table-scroll" tabindex="0" aria-label="Scrollable data table"><table class="data-table"><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';}
  function issueStatus(issue){return D.emergency(issue)?badge('Immediate emergency','red'):status(issue.status);}
  function sourceLabel(value){return value==='Live Gemini'?badge('Live Gemini','teal'):value==='Offline simulator'?badge('Offline simulator','amber'):badge(value||'Unknown');}
  function timeline(state,clientId=null,issueId=null,taskId=null){
    const rows=state.activity.filter(a=>(!clientId||a.clientId===clientId)&&(!issueId||a.issueId===issueId)&&(!taskId||a.taskId===taskId)).slice().reverse();
    return rows.length?'<ol class="timeline">'+rows.slice(0,100).map(a=>'<li><div class="timeline-heading"><strong>'+e(a.type)+'</strong><span>'+e(date(a.at))+'</span></div><p>'+e(a.details)+'</p><small>'+e(employee(a.actorId))+' · '+e(a.actorRole)+(a.mode==='demo'?' · role-switch simulation':' · authenticated account')+'</small></li>').join('')+'</ol>':empty('No activity is supplied for this account in the case.');
  }
  async function act(type,payload,rerender=true){
    ui.queue=ui.queue.catch(()=>{}).then(()=>store.act(type,payload));
    const result=await ui.queue;
    if(rerender){render();if(ui.dialog)renderDialog();}
    return result;
  }
  function header(){
    const state=S(), open=state.issues.filter(i=>!D.TERMINAL.includes(i.status)),capacity=D.capacity(store.state);
    const labels={overview:['Monday Portfolio Overview','Prioritize issues, approve work and track verified outcomes.'],clients:['Clients','A shared account record, from first complaint to resolution.'],intelligence:['AI Intelligence','Turn incoming records into reviewed, consolidated issues.'],tasks:['Tasks & Assignee Workspace','Assignment, execution and manager verification are separate steps.'],approval:['Human Approval','Review consequential decisions and prepare verified communications.']};
    $('page-title').textContent=labels[ui.view][0];$('page-description').textContent=labels[ui.view][1];
    $('mode-label').textContent=store.mode==='demo'?'Local demonstration':'Connected · authenticated';
    $('mode-note').innerHTML=store.mode==='demo'?'Saved in this browser. Role switching simulates assignment delivery; it is <strong>not real cross-user delivery</strong>.':'Stored in Supabase. Assignments appear only in the mapped assignee’s authenticated inbox. Email notifications are not configured.';
    $('role-switch').innerHTML=options(store.state.employees,store.actor.employeeId);
    $('role-switch').disabled=store.mode!=='demo'||ui.busy;
    $('connect-button').textContent=store.mode==='connected'?'Sign out':'Connected sign-in';
    $('actor-label').textContent=employee(store.actor.employeeId);
    document.querySelectorAll('[data-view]').forEach(tab=>{const active=tab.dataset.view===ui.view;tab.setAttribute('aria-selected',active);tab.tabIndex=active?0:-1;});
    const metrics=[
      [state.clients.length,'Client accounts'],[open.filter(i=>i.clientId).length,'Open client issues'],
      [open.filter(D.emergency).length,'Critical issues'],
      [state.tasks.filter(t=>['Proposed','Approved'].includes(t.status)).length,'Awaiting assignment'],
      [state.tasks.filter(t=>['In Progress','Blocked'].includes(t.status)).length,'Execution active'],
      [state.analyses.filter(a=>a.status==='Needs review').length+state.tasks.filter(t=>['Proposed','Resolved','Verified'].includes(t.status)).length+state.communications.filter(c=>c.status!=='Ready to copy').length,'Pending reviews']
    ];
    $('kpi-strip').innerHTML=metrics.map(([value,label])=>'<div class="kpi"><div><div class="kpi-value mono">'+value+'</div><div class="kpi-label">'+label+'</div></div></div>').join('');
    const contracted=state.clients.filter(c=>c.acvLakh!=null).reduce((sum,c)=>sum+c.acvLakh,0);
    const upside=state.opportunities.filter(o=>o.upsideLakh!=null).reduce((sum,o)=>sum+o.upsideLakh,0);
    $('portfolio-meta').innerHTML='<span>Known annual contracts <strong>₹'+(contracted/100).toFixed(2)+' Cr</strong> · Potential expansion <strong>'+money(upside)+'</strong> · '+state.clients.filter(c=>c.acvLakh==null).length+' values unknown · '+open.filter(i=>!i.clientId).length+' internal task</span><span>Committed / spent: Technical '+hours(capacity.technical.confirmed)+'/8h · Demo '+hours(capacity.demo.confirmed)+'/1h</span>';
    $('view-content').setAttribute('aria-labelledby','tab-'+ui.view);
  }
  function render(){
    if(!store)return;
    header();
    $('view-content').innerHTML=ui.view==='overview'?overview():ui.view==='clients'?clients():ui.view==='intelligence'?intelligence():ui.view==='tasks'?tasks():approval();
    icons();
  }
  function overview(){
    const state=S(),groups=D.priorities(state),capacity=D.capacity(store.state),manager=isManager();
    const card=issue=>{
      const task=state.tasks.find(t=>t.issueId===issue.id&&!D.TERMINAL.includes(t.status));
      const c=state.clients.find(c=>c.id===issue.clientId),isCritical=D.emergency(issue);
      const owner=task?.assigneeId?employee(task.assigneeId):issue.resource?D.RESOURCES[issue.resource].label:issue.category==='public_complaint'?'Support Lead':'Associate Manager';
      const feasible=issue.resource?!task?'Needs planning':capacity[issue.resource].planConflict?'Plan exceeds capacity':'Planning estimate only':'No scarce specialist hours';
      return '<article class="task '+(isCritical?'emergency':'')+'"><div class="task-content"><div class="task-top"><h3>'+e(issue.title)+'</h3>'+(isCritical?badge('Emergency','red'):badge(D.score(state,issue).toFixed(2)+' / 5','blue'))+'</div><p class="task-problem">'+e(c?.name||'Internal task')+' · '+e(issue.impact)+'</p><div class="task-bottom"><span class="assignment">'+e(owner)+' · '+hours(task?.plannedHours??issue.estimatedHours)+' '+e(task?.status||'estimate; no task proposed')+'</span>'+badge(feasible,feasible==='Plan exceeds capacity'?'red':'gray')+'</div><p class="next-action"><strong>Next:</strong> '+e(issue.nextAction)+'</p><div class="card-actions">'+button('View issue','issue',issue.id,'ghost')+(manager&&task?button(task.status==='Proposed'?'Review task':'Open task','task',task.id,'ghost'):'')+'</div></div></article>';
    };
    const capacityHtml=Object.entries(capacity).map(([key,c])=>{
      const assignments=store.state.tasks.filter(t=>t.resource===key&&(t.status!=='Cancelled'||t.actualHours>0)); const charge=t=>D.TERMINAL.includes(t.status)?(t.actualHours??(t.status==='Cancelled'?0:t.plannedHours)):Math.max(t.plannedHours,t.actualHours||0);
      return '<div class="budget-block"><div class="budget-heading"><strong>'+e(c.label)+'</strong>'+badge(hours(c.confirmed)+' / '+c.budget+'h committed / spent',c.assignmentConflict?'red':'gray')+'</div><div class="capacity-bar" role="img" aria-label="'+e(c.label+' illustrative plan '+hours(c.planned)+' / '+c.budget+'h')+'">'+assignments.map((t,index)=>'<span class="capacity-segment" style="width:'+charge(t)/Math.max(c.budget,c.planned)*100+'%;background:'+['#bd4e5d','#3964d4','#7894de'][index%3]+'">'+hours(charge(t))+'</span>').join('')+'</div><div class="resource-stages"><span>Proposed <b>'+hours(c.proposed)+'</b></span><span>Approved <b>'+hours(c.approved)+'</b></span><span>Assigned <b>'+hours(c.assigned)+'</b></span><span>Actual <b>'+hours(c.actual)+'</b></span></div>'+(c.unreportedActual?'<p class="small muted">'+c.unreportedActual+' assigned task(s) have no actual time report.</p>':'')+
        (c.planConflict||c.assignmentConflict?'<div class="capacity-alert"><strong>Capacity conflict</strong>Plan '+hours(c.planned)+'; confirmed assignments '+hours(c.confirmed)+' against '+c.budget+'h. Reallocate, defer or record an explicitly accepted conflict. Priority does not imply feasibility.</div>':'')+
        '<div class="capacity-legend">'+assignments.map(t=>'<div class="legend-row"><button type="button" class="link-button" data-action="task" data-id="'+t.id+'">'+e(state.issues.find(i=>i.id===t.issueId)?.title||t.title)+'</button>'+(manager&&['Proposed','Approved'].includes(t.status)?'<input class="compact-hours" aria-label="'+e((state.issues.find(i=>i.id===t.issueId)?.title||t.title)+' planned hours')+'" type="number" min="0" max="24" step="0.25" data-allocation="'+t.id+'" value="'+t.plannedHours+'">':'<span>'+hours(t.plannedHours)+'</span>')+'</div>').join('')+'</div></div>';
    }).join('');
    const weights=D.weights(state);
    return '<div class="section-heading"><h2>Today’s action plan</h2><div class="card-actions">'+button('Original case reference','case','','ghost')+button('Account opportunities','opportunities','','ghost')+'</div></div><div class="portfolio-layout"><div><div class="group-heading danger"><h3>Immediate Emergencies</h3>'+badge(groups.emergencies.length,'red')+help('Why emergencies bypass scores','Active financial outages and genuine public escalations require immediate acknowledgment and escalation, not an unverified technical fix promise.')+'</div><div class="task-list">'+(groups.emergencies.map(card).join('')||empty('No active emergencies.'))+'</div><div class="group-heading"><h3>'+(state.scenarioSettings.comparison==='value'?'Contract-value comparison':'Ranked Priorities')+'</h3>'+badge(groups.ranked.length)+'</div><div class="task-list">'+(groups.ranked.map(card).join('')||empty('No other open work.'))+'</div></div><aside class="sidebar"><section class="panel-card"><div class="panel-heading"><h2>Weekly scenario</h2>'+help('About scenarios','Only weights and ordering change. Account facts, emergency escalation and resource assignments are preserved.')+'</div><div class="scenario-grid">'+Object.entries(D.SCENARIOS).map(([key,s])=>'<button class="scenario-button '+(state.scenarioSettings.preset===key?'selected':'')+'" data-scenario="'+key+'" '+(!manager?'disabled':'')+'>'+e(s.name)+'</button>').join('')+'</div>'+(state.scenarioSettings.lastChange?'<div class="change-note"><strong>What Changed?</strong>'+e(state.scenarioSettings.lastChange)+'</div>':'')+'<div class="compare-control"><button data-comparison="weighted" aria-pressed="'+(state.scenarioSettings.comparison==='weighted')+'" '+(!manager?'disabled':'')+'>Weighted priority</button><button data-comparison="value" aria-pressed="'+(state.scenarioSettings.comparison==='value')+'" '+(!manager?'disabled':'')+'>Contract value only</button></div></section>'+
      '<section class="panel-card"><details id="scoring-details" '+(ui.scoreOpen?'open':'')+'><summary class="details-heading">Priority Scoring Settings</summary><p class="small muted">Total normalized weight: <strong>100%</strong>. All-zero input uses an equal split.</p>'+D.FACTORS.map(f=>'<label class="weight-row"><span>'+e(f.label)+' '+help('Scoring '+f.label,f.help)+'<b class="weight-number">'+Number(weights[f.key].toFixed(2))+'%</b></span><input type="range" data-weight="'+f.key+'" aria-label="'+e(f.label)+' weight" min="0" max="100" step="5" value="'+state.scenarioSettings.weights[f.key]+'" '+(!manager?'disabled':'')+'></label>').join('')+'</details></section>'+
      '<section class="panel-card"><h2>Specialist capacity</h2>'+capacityHtml+'<p class="small muted">'+e(store.state.assumptions[0])+'</p><p class="small muted">Separate people and budgets. Proposed hours are not bookings or completion promises.</p></section></aside></div>';
  }
  function clients(){
    const state=S();
    if(ui.profile){
      const c=state.clients.find(c=>c.id===ui.profile);if(!c){ui.profile=null;return clients();}
      const issues=state.issues.filter(i=>i.clientId===c.id),active=issues.filter(i=>!D.TERMINAL.includes(i.status)),history=issues.filter(i=>D.TERMINAL.includes(i.status)||i.recurrence>1);
      const original=D.seed().clients.find(row=>row.id===c.id);
      const tasksHtml=(items,emptyText='No reported issues in the provided case.')=>items.length?table(['Issue','Priority / status','Owner / effort','Next action'],items.map(i=>{const t=state.tasks.find(t=>t.issueId===i.id&&!D.TERMINAL.includes(t.status));return '<tr><td>'+button(i.title,'issue',i.id,'ghost')+'<small>'+e(i.id)+'</small></td><td>'+issueStatus(i)+'<small>'+D.score(state,i).toFixed(2)+' / 5 reference</small></td><td>'+e(t?.assigneeId?employee(t.assigneeId):'Not assigned')+'<small>'+hours(t?.plannedHours||0)+' planned</small></td><td>'+e(i.nextAction)+'</td></tr>';})):empty(emptyText);
      return button('Back to client directory','back-clients','','ghost')+'<div class="section-heading"><div><h2>'+e(c.name)+'</h2><p class="small muted">'+e(c.placeholder?'Placeholder account name; official company name not supplied.':c.provenance)+'</p></div>'+issueStatus({status:active.length?'Open':'No reported open issues',emergencyType:active.some(D.emergency)?'OUTAGE':'NONE'})+'</div><div class="profile-grid"><section class="panel-card"><div class="panel-heading"><h2>Account Overview</h2>'+(isManager()?button('Edit account','edit-client',c.id,'ghost'):'')+'</div><dl class="facts"><dt>Annual contract value</dt><dd>'+money(c.acvLakh)+'</dd><dt>Case contract value</dt><dd>'+money(original?.acvLakh)+'</dd><dt>Industry</dt><dd>'+e(c.industry||'Unknown')+'</dd><dt>Renewal</dt><dd>'+e(c.renewalDate||(c.renewalInDays?c.renewalInDays+' days from case Monday; date not supplied':'Unknown'))+'</dd><dt>Account owner</dt><dd>'+e(employee(c.ownerId))+'</dd><dt>Primary stakeholder</dt><dd>'+e(c.stakeholder||'Unknown')+' · '+e(c.stakeholderRole||'Role unknown')+'</dd><dt>Products used</dt><dd>'+e(c.products.join(', ')||'Unknown')+'</dd><dt>Relationship health</dt><dd>'+e(c.health||'Not assessed')+'</dd><dt>Risks</dt><dd>'+e(c.risks||'Assess from current issues; not independently verified')+'</dd><dt>Most recent activity</dt><dd>'+e(date(c.lastActivity))+'</dd></dl></section><section class="panel-card"><h2>Account Opportunities</h2>'+opportunityCards(state.opportunities.filter(o=>o.clientId===c.id))+'</section></div><section class="panel-card spaced"><h2>Active Issues</h2>'+tasksHtml(active,issues.length?'No open issues. All historical records remain below.':'No reported issues in the provided case.')+'</section><section class="panel-card spaced"><h2>Issue History</h2><p class="small muted">Resolved, closed and recurring issues are retained, with the complete action history inside each issue.</p>'+tasksHtml(history,'No resolved or reopened history has been supplied or recorded.')+'</section><section class="panel-card spaced"><h2>Activity Timeline</h2>'+timeline(state,c.id)+'</section>';
    }
    const rows=state.clients.filter(c=>{
      const issues=state.issues.filter(i=>i.clientId===c.id&&!D.TERMINAL.includes(i.status)),q=(c.name+' '+c.id).toLowerCase();
      return q.includes(ui.clientQuery.toLowerCase())&&(ui.clientFilter==='all'||ui.clientFilter==='critical'&&issues.some(D.emergency)||ui.clientFilter==='open'&&issues.length||ui.clientFilter==='quiet'&&!issues.length||ui.clientFilter==='growth'&&state.opportunities.some(o=>o.clientId===c.id));
    });
    return '<div class="section-heading"><h2>Client directory · '+state.clients.length+' accounts</h2>'+button('Account opportunities','opportunities','','ghost')+'</div><div class="filters"><input id="client-search" type="search" aria-label="Search clients" placeholder="Search clients or identifiers" value="'+e(ui.clientQuery)+'"><select id="client-filter" aria-label="Filter clients">'+options([{id:'all',name:'All accounts'},{id:'critical',name:'Critical issues'},{id:'open',name:'Open issues'},{id:'quiet',name:'No open issues'},{id:'growth',name:'Growth opportunities'}],ui.clientFilter)+'</select></div>'+table(['Client','Contract value','Health / issues','Renewal','Owner / latest activity','Growth'],rows.map(c=>{
      const issues=state.issues.filter(i=>i.clientId===c.id&&!D.TERMINAL.includes(i.status)),critical=issues.filter(D.emergency).length;
      const opportunity=state.opportunities.find(o=>o.clientId===c.id);
      return '<tr><td>'+button(c.name,'client',c.id,'ghost')+'<small>'+e(c.id)+(c.placeholder?' · name not supplied':'')+'</small></td><td>'+money(c.acvLakh)+'</td><td>'+badge(critical?'Critical':issues.length?'Needs attention':'Not assessed',critical?'red':issues.length?'amber':'gray')+'<small>'+issues.length+' open · '+critical+' critical</small>'+(!issues.length?'<small>'+e(state.issues.some(i=>i.clientId===c.id)?'No open issues; history retained':'No reported issues in the provided case')+'</small>':'')+'</td><td>'+e(c.renewalDate||(c.renewalInDays?c.renewalInDays+' days from case Monday':'Unknown'))+'</td><td>'+e(employee(c.ownerId))+'<small>'+e(date(c.lastActivity))+'</small></td><td>'+e(opportunity?opportunity.upsideLakh!=null?money(opportunity.upsideLakh)+' potential':'Unquantified discovery hypothesis':'Unknown / not reported')+'</td></tr>';
    }));
  }
  function opportunityCards(items){
    return items.length?items.map(o=>'<article class="opportunity-card"><h3>'+e(o.name)+'</h3>'+badge(o.kind,o.upsideLakh==null?'amber':'blue')+'<p>Current contract: <strong>'+money(store.state.clients.find(c=>c.id===o.clientId)?.acvLakh)+'</strong> · Potential upside: <strong>'+money(o.upsideLakh)+'</strong></p><p>'+e(o.readiness)+'</p><p class="small muted">'+e(o.risk)+'</p><p><strong>Next:</strong> '+e(o.nextAction)+'</p><p class="small muted">Owner: '+e(employee(o.ownerId))+' · Target: '+e(o.targetDate||'Not agreed')+'</p>'+button('Open 30-day plan','opportunity',o.id,'ghost')+'</article>').join(''):empty('No growth opportunity is supplied for this account.');
  }
  function intelligence(){
    const state=S(),pending=ui.pending,raw=pending?.records||[],rows=raw.length?D.normalizeRecords(store.state,raw,pending.mapping||{},pending.source||'email'):[];
    const batch=state.batches.at(-1),groups=state.analyses.filter(a=>a.batchId===batch?.id);
    const metrics=batch?[[batch.received,'Records received'],[batch.processed,'Processed'],[batch.invalid,'Invalid'],[batch.duplicateSources,'Repeated source IDs'],[batch.repeatedSignals,'Repeated incident signals'],[batch.uniqueIssues,'Actionable issues'],[batch.critical,'Critical issues'],[groups.filter(g=>g.status==='Needs review').length,'Human reviews']]:[];
    const columns=raw.length?Object.keys(raw[0]||{}).filter(k=>!k.startsWith('_')):[];
    let sourceRows=batch?.rows||[];
    sourceRows=sourceRows.filter(row=>{
      const signal=state.signals.find(s=>s.id===row.signalId),a=state.analyses.find(a=>a.signalIds.includes(row.signalId));
      const text=[signal?.subject,signal?.content,clientName(signal?.clientId),a?.analysis.issue_summary,row.status].join(' ').toLowerCase();
      return text.includes(ui.signalQuery.toLowerCase())&&(ui.signalSource==='all'||signal?.source===ui.signalSource);
    });
    const page=sourceRows.slice(ui.page*20,ui.page*20+20);
    const sourceTable=table(['Source / record','Client','Detected issue','Classification / confidence','Priority','Processing'],page.map(row=>{
      const s=state.signals.find(s=>s.id===row.signalId),a=state.analyses.find(a=>a.signalIds.includes(row.signalId));
      const ref=a?{...a.analysis,ratings:a.analysis.ratings,emergencyType:a.analysis.emergency_type,status:'Open'}:null;
      return '<tr><td>'+e(s?.source||'Invalid row')+'<small>'+e(s?.externalId||'Row '+row.row)+'</small>'+(s?.simulated?badge('Simulated source','amber'):'')+'</td><td>'+e(s?.clientId?clientName(s.clientId):'Needs mapping')+'</td><td>'+(a?button(a.analysis.issue_summary,'analysis',a.id,'ghost'):'—')+'</td><td>'+(a?sourceLabel(a.analysis.engine)+'<small>'+e(a.analysis.issue_category.replace(/_/g,' '))+' · '+(a.analysis.confidence==null?'Rule-based':a.analysis.confidence+'% self-reported')+'</small>':'—')+'</td><td>'+(a?a.analysis.emergency_type!=='NONE'?badge('Emergency','red'):a.analysis.actionable?D.score(store.state,ref).toFixed(2)+' / 5':'No task':'—')+'</td><td>'+status(row.status)+(a?'<small>'+e(a.status)+'</small>':'')+(row.errors.length?'<small class="over">'+e(row.errors.join(' '))+'</small>':'')+'</td></tr>';
    }));
    return '<div class="section-heading"><h2>Bulk Intelligence Processing</h2>'+help('About bulk processing','Only you initiate a run. Valid records are grouped by client and incident before controlled AI chunks. No inbox, CRM or ticketing connector is claimed.')+'</div>'+
      '<div class="card-actions spaced-bottom">'+button('Load Sample Monday — 160 Signals','sample-monday','','primary')+button('Add simulated CRM + social','sample-extra')+button('Single-message analysis','single')+button('Download sample JSON','sample-download')+'</div>'+
      '<section class="panel-card"><div class="import-top"><label class="form-field">Import CSV or JSON<input id="import-file" type="file" accept=".csv,.json,application/json,text/csv" '+(!isManager()||ui.busy?'disabled':'')+'></label><p class="small muted">Local staging is saved for recovery. '+(pending?.simulated?'Loaded data is explicitly simulated.':'Imported records remain unverified until review.')+'</p></div>'+
      (pending?'<div class="import-summary"><strong>'+e(pending.name)+' · '+raw.length+' records staged</strong>'+badge(rows.filter(r=>r.errors.length).length+' invalid',rows.some(r=>r.errors.length)?'red':'gray')+badge(rows.filter(r=>r.duplicateSource).length+' repeated IDs')+'</div><details class="spaced-small"><summary>Field mapping and row validation</summary><div class="mapping-grid">'+['externalId','clientId','content','source','timestamp','subject','sender','threadId','incidentRef','sourceStatus','sourcePriority','sourceAssignee'].map(key=>'<label class="form-field">'+e(({externalId:'Message / ticket ID',clientId:'Client identifier',content:'Body / complaint',sourceStatus:'Ticket status',sourcePriority:'Ticket priority',sourceAssignee:'Assigned person'})[key]||key)+'<select data-map="'+key+'">'+options(columns,pending.mapping?.[key]||'','Auto-detect')+'</select></label>').join('')+'</div><label class="form-field">Default source<select id="default-source">'+options(['email','ticket','crm','social'],pending.source||'email')+'</select></label>'+table(['Row','Client match','Validation'],rows.slice(0,20).map(r=>'<tr><td>'+r.sourceRow+'</td><td>'+e(r.clientId?clientName(r.clientId):'Needs human mapping')+'</td><td>'+e(r.errors.join(' ')||(r.duplicateSource?'Repeated source ID':'Valid'))+'</td></tr>'))+'<p class="small muted">Preview shows the first 20 rows; all rows are validated when processing.</p></details><div class="card-actions spaced"><label class="inline-check"><input id="bulk-simulator" type="checkbox" checked>Use labelled offline simulator</label><button type="button" class="button primary" data-action="process" '+(ui.busy||!isManager()?'disabled':'')+'>'+(ui.busy?'Processing…':'Analyze & Consolidate')+'</button></div>':'<p class="small muted">Upload records or load the reproducible sample. It contains exactly 120 emails and 40 tickets; CRM and social samples are separate.</p>')+
      (ui.progress?'<p class="processing-status" role="status">'+e(ui.progress)+'</p>':'')+'</section>'+
      (batch?'<section class="spaced"><div class="section-heading"><h2>Latest run: '+e(batch.name)+'</h2>'+badge(batch.simulated?'Contains simulated records':'Imported data',batch.simulated?'amber':'gray')+'</div><div class="metric-grid">'+metrics.map(([v,l])=>'<div><strong>'+v+'</strong><span>'+l+'</span></div>').join('')+'</div><p class="small muted">'+batch.fallbackGroups+' groups used offline classification. '+batch.failedAI+' provider failures were recorded. Repeated incident signals share evidence; source IDs remain distinct.</p><div class="proposal-list">'+groups.filter(a=>a.status==='Needs review').map(a=>'<div class="proposal-row"><div><strong>'+e(a.analysis.issue_summary)+'</strong><small>'+e(a.clientId?clientName(a.clientId):'Unknown client')+' · '+a.signalIds.length+' source records · '+e(a.candidateIssueId?'Possible existing issue '+a.candidateIssueId:'Proposed new issue')+'</small></div>'+button('Review proposal','analysis',a.id,'primary')+'</div>').join('')+'</div><div class="filters"><input type="search" id="signal-search" aria-label="Search signals" placeholder="Search records, clients or issues" value="'+e(ui.signalQuery)+'"><select id="signal-source" aria-label="Filter signal source">'+options(['all','email','ticket','crm','social'],ui.signalSource)+'</select></div>'+sourceTable+'<div class="pagination"><span>'+sourceRows.length+' records · page '+(ui.page+1)+' of '+Math.max(1,Math.ceil(sourceRows.length/20))+'</span>'+button('Previous','previous-page')+button('Next','next-page')+'</div></section>':'');
  }
  function tasks(){
    const state=S(),manager=isManager(),own=state.tasks.filter(t=>t.assigneeId===store.actor.employeeId);
    const visible=(manager&&ui.taskFilter!=='mine'?state.tasks:own).filter(t=>ui.taskFilter==='all'||ui.taskFilter==='mine'||ui.taskFilter==='new'&&['Assigned','Reassigned','Reopened'].includes(t.status)||ui.taskFilter==='active'&&['Acknowledged','In Progress'].includes(t.status)||ui.taskFilter==='blocked'&&t.status==='Blocked'||ui.taskFilter==='completed'&&['Resolved','Verified','Closed'].includes(t.status));
    return '<div class="section-heading"><div><h2>'+(manager?'Manager task dashboard':'My Tasks')+'</h2><p class="small muted">'+(store.mode==='demo'?'Simulated role inbox. Assignments are persisted locally, not delivered to real employee accounts.':'Authenticated assignee inbox. Availability is based on persisted assignments; email delivery is not implied.')+'</p></div><div class="card-actions">'+button('Refresh inbox','refresh')+(manager?button('Team directory','team','','ghost'):'')+'</div></div><div class="filters"><select id="task-filter" aria-label="Task inbox filter">'+options([{id:'all',name:manager?'All tasks':'My Tasks'},{id:'mine',name:'My Tasks'},{id:'new',name:'New Assignments'},{id:'active',name:'In Progress / Acknowledged'},{id:'blocked',name:'Blocked'},{id:'completed',name:'Resolved / Verified / Closed'}],ui.taskFilter)+'</select></div>'+
      table(['Task / issue','Status','Assignee / availability','Priority','Effort','Due / next step'],visible.map(t=>{
        const issue=state.issues.find(i=>i.id===t.issueId);return '<tr><td>'+button(issue?.title||t.title,'task',t.id,'ghost')+'<small>'+e(t.id)+' · '+e(clientName(t.clientId))+'</small></td><td>'+status(t.status)+'</td><td>'+e(employee(t.assigneeId))+'<small>'+e(t.delivery)+'</small></td><td>'+e(t.priority||'Follow issue')+'<small>'+(issue&&D.emergency(issue)?'Emergency escalation':issue?D.score(state,issue).toFixed(2)+' / 5':'—')+'</small></td><td>'+hours(t.plannedHours)+' planned<small>'+(t.actualHours==null?'Actual not reported':hours(t.actualHours)+' actual')+'</small></td><td>'+e(t.dueDate||'Date not set')+'<small>'+e(t.status==='Proposed'?'Manager review required':t.status==='Approved'?'Assign to an employee':t.status==='Resolved'?'Manager verification required':t.status==='Verified'?'Manager may close':t.status==='Closed'?'Retained in account history':'Open task for next action')+'</small></td></tr>';
      }));
  }
  function approval(){
    if(!isManager())return empty('Management approval is restricted to a manager identity. Use My Tasks for your assigned work.');
    const state=S(),draft=state.communications.find(c=>c.id===ui.draftId)||state.communications[0];
    const pending=state.tasks.filter(t=>['Proposed','Resolved','Verified'].includes(t.status));
    return '<div class="section-heading"><h2>Pending Decisions</h2>'+badge(pending.length+' task reviews · '+state.analyses.filter(a=>a.status==='Needs review').length+' intelligence reviews','amber')+'</div><div class="decision-strip">'+pending.map(t=>'<button type="button" data-action="task" data-id="'+t.id+'"><strong>'+e(state.issues.find(i=>i.id===t.issueId)?.title||t.title)+'</strong><span>'+e(t.status==='Proposed'?'Review proposed task':t.status==='Resolved'?'Verify reported resolution':'Close verified task')+'</span></button>').join('')+'</div><div class="approval-layout spaced"><section class="panel-card"><div class="panel-heading"><h2>Drafts Requiring Review</h2>'+status(draft.status)+'</div><div class="draft-tabs">'+state.communications.map(c=>'<button type="button" class="draft-tab" data-action="draft-select" data-id="'+c.id+'" aria-pressed="'+(c.id===draft.id)+'">'+e(c.title)+'</button>').join('')+'</div><form data-form="draft-save" data-id="'+draft.id+'">'+area('Editable draft','text',ui.dirtyDraft?.id===draft.id?ui.dirtyDraft.text:draft.text,'id="draft-text" class="draft-editor"')+'<div class="card-actions">'+button('Prepare AI draft from verified facts','draft-ai',draft.id)+ '<button type="submit" class="button">Save draft changes</button></div></form><p class="small muted">Source: '+e(draft.source)+'. AI drafts remain unverified.</p><div class="verification-box"><h3>Required verification</h3><div class="checklist">'+draft.checkLabels.map((label,index)=>'<label><input type="checkbox" data-draft-check="'+index+'" data-id="'+draft.id+'" '+(draft.checks[index]?'checked':'')+'><span>'+e(label)+'</span></label>').join('')+'</div></div><div class="approval-footer"><span id="draft-lock" class="lock-status">'+(draft.status==='Ready to copy'?'Verified for copying; send manually.':'Replace all placeholders and complete every check.')+'</span><button type="button" id="copy-draft" class="button primary" data-action="draft-copy" data-id="'+draft.id+'" '+(draft.status!=='Ready to copy'?'disabled':'')+'>Copy Verified Draft</button></div><p class="approval-info">Copying does not send anything. No email or social provider is connected.</p></section><aside class="panel-card"><h2>Human Approval Rules</h2>'+[
      ['No autonomous crisis communications','Check recipient, evidence, tone and authorization before sending.'],
      ['No unverified resolution promises','Engineering evidence and manager verification must support any claim.'],
      ['No unauthorized commercial commitments','Refunds, pricing, contracts and concessions require Priya’s approval.'],
      ['No expansion pitching during unresolved crises','Recover service and trust before a growth conversation.']
    ].map(([title,text])=>'<details class="rule"><summary>'+e(title)+'</summary><p>'+e(text)+'</p></details>').join('')+'</aside></div>';
  }
  function openDialog(type,id){ui.dialog={type,id};renderDialog();if(!$('detail-dialog').open)$('detail-dialog').showModal();}
  function closeDialog(){ui.dialog=null;$('detail-dialog').close();$('detail-content').innerHTML='';}
  function renderDialog(){
    const state=S(),{type,id}=ui.dialog;
    let title='',body='';
    if(type==='issue'){
      const issue=state.issues.find(i=>i.id===id);if(!issue){closeDialog();return;}
      title=issue.title;
      const sources=state.issueSources.filter(link=>link.issueId===id).map(link=>state.signals.find(s=>s.id===link.signalId)).filter(Boolean);
      const tasks=state.tasks.filter(t=>t.issueId===id),w=D.weights(state);
      body='<div class="card-actions">'+issueStatus(issue)+badge(issue.source)+((issue.simulated||issue.containsSimulatedEvidence)?badge('Includes simulated evidence','amber'):'')+button('Client profile','client',issue.clientId,'ghost')+(isManager()?button('Prepare AI action plan','issue-plan',id):'')+'</div><p>'+e(issue.impact)+'</p><dl class="facts"><dt>Issue / client</dt><dd>'+e(issue.id)+' · '+e(clientName(issue.clientId))+'</dd><dt>Reported / deadline</dt><dd>'+e(date(issue.reportedAt))+' · '+e(issue.deadline||'Unknown')+'</dd><dt>Last update</dt><dd>'+e(date(issue.lastUpdate))+'</dd><dt>Priority</dt><dd>'+(D.emergency(issue)?'Emergency escalation; outside ranked ordering. Reference score ':'Weighted priority ')+D.score(state,issue).toFixed(2)+' / 5</dd><dt>Next action</dt><dd>'+e(issue.nextAction)+'</dd><dt>Missing information</dt><dd>'+e(issue.missingInformation.join(' '))+'</dd></dl>'+
        ((state.aiPlans||[]).filter(p=>p.issueId===id).slice(-1).map(p=>'<section class="inline-notice"><strong>Live Gemini action plan · not executed</strong><p>'+e(p.recommendedAction)+'</p><p>Suggested role: '+e(p.suggestedRole)+'. '+e(p.capacityNote)+'</p><p>Missing: '+e(p.missing.join(' '))+'</p>'+button('Review as a proposed task','plan-task',p.id)+'</section>').join(''))+
        '<details class="spaced-small"><summary>How is this score calculated?</summary>'+table(['Factor','Rating','Weight','Contribution'],D.FACTORS.map(f=>'<tr><td>'+e(f.label)+'</td><td>'+issue.ratings[f.key]+'/5</td><td>'+Number(w[f.key].toFixed(2))+'%</td><td>'+(issue.ratings[f.key]*w[f.key]/100).toFixed(3)+'</td></tr>'))+'<p class="small muted">Sum of full-precision contributions, rounded to 2 decimals: '+D.score(state,issue).toFixed(2)+'. Deal Value uses contracted revenue only; expansion is represented under Growth.</p>'+ (isManager()?'<form data-form="rating" data-id="'+id+'" class="spaced"><div class="mapping-grid">'+D.FACTORS.map(f=>select(f.label,f.key,[1,2,3,4,5].map(n=>({id:n,name:n+'/5'})),issue.ratings[f.key],'',f.key==='F'?'disabled':'')).join('')+select('Emergency override','emergencyType',['NONE','OUTAGE','PR'],issue.emergencyType)+'</div>'+area('Reason for human correction','reason','','required')+'<button class="button primary" type="submit">Save correction & feedback</button><p class="small muted">Deal Value follows the account’s contracted value. Corrections are recorded as examples; no automatic model training is claimed.</p></form>':'')+'</details><section class="spaced"><h3>Evidence</h3><ul>'+issue.evidence.map(line=>'<li>'+e(line)+'</li>').join('')+'</ul>'+sourceMessages(sources)+'</section><section class="spaced"><div class="section-heading"><h3>Linked tasks</h3>'+(isManager()&&!D.TERMINAL.includes(issue.status)?button('Propose another task','new-task',id,'primary'):'')+'</div>'+tasks.map(t=>'<div class="proposal-row"><div><strong>'+e(t.id)+'</strong> '+status(t.status)+'<small>'+e(employee(t.assigneeId))+' · '+hours(t.plannedHours)+' planned · '+e(t.delivery)+'</small></div>'+button('Open task','task',t.id)+'</div>').join('')+'</section>'+
        (issue.category==='order_updates'?investigation(issue):'')+
        '<section class="spaced"><h3>Verified facts for communication</h3>'+(issue.verifiedFacts.length?'<ul>'+issue.verifiedFacts.map(f=>'<li>'+e(f.text)+' · '+e(date(f.at))+'</li>').join('')+'</ul>':empty('No technical resolution facts have been verified.'))+(isManager()?'<form data-form="issue-note" data-id="'+id+'">'+area('Verified information and evidence','note','','required')+'<button type="submit" class="button">Record verified fact</button></form>':'')+'</section><section class="spaced"><h3>Issue history · actors and timestamps</h3>'+timeline(state,null,id)+'</section>';
    }else if(type==='task'){
      const task=state.tasks.find(t=>t.id===id);if(!task){closeDialog();return;}const issue=state.issues.find(i=>i.id===task.issueId),own=task.assigneeId===store.actor.employeeId;
      title=issue.title+' · '+task.id;
      body='<div class="card-actions">'+status(task.status)+button('View linked issue','issue',issue.id,'ghost')+'</div><p>'+e(task.description)+'</p><dl class="facts"><dt>Account</dt><dd>'+e(clientName(task.clientId))+'</dd><dt>Assignee / delivery</dt><dd>'+e(employee(task.assigneeId))+' · '+e(task.delivery)+'</dd><dt>Resource / effort</dt><dd>'+e(task.resource?D.RESOURCES[task.resource].label:'Account / Support work')+' · '+hours(task.plannedHours)+' planned · '+e(task.actualHours==null?'Actual not reported':hours(task.actualHours)+' actual')+'</dd><dt>Target date</dt><dd>'+e(task.dueDate||'Not agreed')+'</dd><dt>Expected deliverable</dt><dd>'+e(task.deliverable||'Not specified until assignment')+'</dd><dt>Instructions</dt><dd>'+e(task.instructions||'Not provided')+'</dd><dt>Escalation</dt><dd>'+e(task.escalationContact)+'</dd></dl>';
      if(isManager()&&task.status==='Proposed')body+='<form data-form="approve-task" data-id="'+id+'">'+area('Approval note','note','','required placeholder="Review the action, evidence and proposed effort."')+'<button type="submit" class="button primary">Approve Proposed Task</button></form>';
      if(isManager()&&['Approved','Assigned','Acknowledged','In Progress','Blocked','Reassigned','Reopened'].includes(task.status)){
        const compatible=state.employees.filter(emp=>emp.capabilities.includes(task.resource||(issue.category==='public_complaint'?'support':'account')));
        body+='<details '+(task.status==='Approved'?'open':'')+' class="spaced-small"><summary>'+(task.status==='Approved'?'Assign Task':'Reassign task / revise confirmed allocation')+'</summary><form data-form="assign-task" data-id="'+id+'"><div class="form-grid">'+select('Employee / team','employeeId',compatible,task.assigneeId||compatible[0]?.id,'Choose assignee','required')+field('Planned specialist hours','plannedHours',task.plannedHours,'number','min="0" max="24" step="0.25" required')+field('Target / due date','dueDate',task.dueDate,'date')+select('Operational priority','priority',['Follow issue','Urgent','High','Normal','Low'],task.priority||'Follow issue')+'</div>'+area('Task description','description',task.description,'required')+area('Expected deliverable','deliverable',task.deliverable,'required')+area('Instructions / dependencies','instructions',task.instructions)+field('Escalation contact','escalationContact',task.escalationContact,'text','required')+'<label class="inline-check"><input name="acceptConflict" type="checkbox">Explicitly accept an unresolved capacity conflict</label>'+field('Conflict reason (only if accepting overbooking)','conflictReason','')+'<p class="small muted">Suggested capability: '+e(task.resource?D.RESOURCES[task.resource].label:issue.category==='public_complaint'?'Support Lead':'Associate Manager')+'. Availability is checked again at assignment. '+(store.mode==='demo'?'Delivery is simulated in the selected role’s local inbox.':'A mapped authenticated user is required.')+'</p><button type="submit" class="button primary">'+(task.status==='Approved'?'Confirm Assignment':'Confirm Reassignment')+'</button></form></details>';
      }
      if(own&&['Assigned','Reassigned','Reopened'].includes(task.status))body+=button('Acknowledge Assignment','task-ack',id,'primary');
      if(own&&['Acknowledged','Blocked'].includes(task.status))body+=button('Start / Resume Work','task-start',id,'primary');
      if(own&&['Acknowledged','In Progress','Blocked'].includes(task.status)){
        body+='<form data-form="progress" data-id="'+id+'" class="spaced"><h3>Progress and blockers</h3>'+area('Progress / blocker note','note','','required')+field('Cumulative actual hours (optional)','actualHours',task.actualHours,'number','min="0" max="200" step="0.25"')+area('Supporting evidence / log reference','evidence','')+select('Update type','updateType',[{id:'progress',name:'Progress note'},{id:'block',name:'Blocked'}],'progress')+'<button class="button" type="submit">Record Progress</button></form>';
        if(issue.category==='order_updates')body+=investigation(issue)+'<form data-form="investigation" data-id="'+id+'" class="spaced">'+select('Investigation stage','stage',D.STAGES.filter(s=>s!=='verification').map(s=>({id:s,name:stageLabel(s)})),'containment')+area('Evidence for this stage','note','','required')+'<button type="submit" class="button">Save Investigation Evidence</button></form>';
        if(['In Progress','Blocked'].includes(task.status))body+='<form data-form="resolve" data-id="'+id+'" class="spaced"><h3>Report resolution</h3>'+area('What was corrected (a restart alone is not permanent)','note','','required')+area('Evidence / test results / recovery references','evidence','','required')+field('Cumulative actual hours (optional)','actualHours',task.actualHours,'number','min="0" max="200" step="0.25"')+'<p class="small muted">This reports an employee outcome. It does not verify or close the issue.</p><button class="button primary" type="submit">Report Resolution</button></form>';
      }
      if(isManager()&&task.status==='Resolved')body+='<section class="spaced"><h3>Employee resolution report</h3><p>'+e(task.resolutionNotes)+'</p><p>'+e(task.evidence)+'</p><form data-form="verify" data-id="'+id+'">'+area('Manager verification evidence','note','','required')+(issue.category==='order_updates'?'<label class="inline-check"><input name="permanentFixVerified" type="checkbox" required>I verified permanent correction, recovered transactions and recurrence monitoring.</label>':'')+'<button type="submit" class="button success">Verify Outcome</button></form></section>';
      if(isManager()&&task.status==='Verified')body+=button('Close Verified Task','task-close',id,'success');
      if(isManager()&&['Resolved','Verified','Closed'].includes(task.status))body+='<form data-form="reopen" data-id="'+id+'" class="spaced">'+field('Reason for reopening','note','','text','required')+'<button type="submit" class="button">Reopen Task / Issue</button></form>';
      if(isManager()&&!D.TERMINAL.includes(task.status))body+='<details class="spaced"><summary>Cancel without claiming resolution</summary><form data-form="cancel" data-id="'+id+'">'+field('Cancellation reason','note','','text','required')+'<button type="submit" class="button">Cancel Task</button></form></details>';
      body+='<section class="spaced"><h3>Assignment and execution history</h3>'+timeline(state,null,null,id)+'</section>';
    }else if(type==='analysis'){
      const group=state.analyses.find(a=>a.id===id);if(!group){closeDialog();return;}const a=group.analysis;
      title='Review: '+a.issue_summary;
      body='<div class="card-actions">'+sourceLabel(a.engine)+status(group.status)+(group.simulated?badge('Simulated source records','amber'):'')+'</div><p>'+e(a.business_impact)+'</p><dl class="facts"><dt>Client match</dt><dd>'+e(a.client_id?clientName(a.client_id):'Unknown; map before approval')+'</dd><dt>Emergency</dt><dd>'+e(a.emergency_type==='OUTAGE'?'Active financial / operational halt':a.emergency_type==='PR'?'Public escalation':'No emergency detected')+'</dd><dt>Confidence</dt><dd>'+e(a.confidence==null?'Rule-based indicator; no model confidence':a.confidence+'% model-reported; not calibrated')+'</dd><dt>Proposed next action</dt><dd>'+e(a.recommended_action)+'</dd><dt>Suggested role</dt><dd>'+e(a.suggested_assignee_role)+'</dd><dt>Missing information</dt><dd>'+e(a.missing_information.join(' '))+'</dd></dl>'+table(['Factor','Rating'],D.FACTORS.map(f=>'<tr><td>'+e(f.label)+'</td><td>'+a.ratings[f.key]+'/5</td></tr>'))+sourceMessages(state.signals.filter(s=>group.signalIds.includes(s.id)))+
        (group.status==='Needs review'&&isManager()?'<form data-form="review-group" data-id="'+id+'" class="spaced"><div class="form-grid">'+select('Client account','clientId',state.clients,group.clientId,'Map the account','required')+select('Consolidate into an existing issue or create new','targetIssueId',state.issues.map(i=>({id:i.id,name:clientName(i.clientId)+' · '+i.title})),group.candidateIssueId||'','Create a distinct new issue')+'</div>'+area('Human review note','reason','','required')+'<label class="inline-check"><input name="reviewed" type="checkbox" required>I reviewed the sources, client match and proposed action.</label><div class="card-actions"><button class="button primary" type="submit">Approve Issue Update</button>'+button('Reject proposal','reject-group',id)+'</div><p class="small muted">Approval links evidence and updates history. It does not assign work, send a reply or confirm specialist time.</p></form>':'');
    }else if(type==='edit-client'){
      const c=state.clients.find(c=>c.id===id);title='Edit '+c.name;
      body='<form data-form="client-edit" data-id="'+id+'"><div class="form-grid">'+field('Client display name','name',c.name,'text','required')+field('Contracted annual value (₹ lakh; blank = unknown)','acvLakh',c.acvLakh,'number','min="0" max="50000" step="0.01"')+field('Industry','industry',c.industry)+field('Renewal date (unknown if blank)','renewalDate',c.renewalDate,'date')+field('Primary stakeholder','stakeholder',c.stakeholder)+field('Stakeholder role','stakeholderRole',c.stakeholderRole)+field('Products used (comma separated)','products',c.products.join(', '))+field('Relationship health (human assessment)','health',c.health)+field('Potential expansion (₹ lakh; blank = unknown)','expansionLakh',c.expansionLakh,'number','min="0" max="50000" step="0.01"')+select('Account owner','ownerId',state.employees,c.ownerId)+'</div>'+area('Account risks','risks',c.risks)+area('Reason / source of update','reason','','required')+'<button type="submit" class="button primary">Save Account Changes</button></form>';
    }else if(type==='new-task'){
      const issue=state.issues.find(i=>i.id===id);title='Propose work · '+issue.title;
      body='<form data-form="new-task" data-id="'+id+'">'+area('Task description','description',issue.nextAction,'required')+select('Specialist resource','resource',[{id:'',name:'Account / Support (0 scarce hours)'},{id:'technical',name:'Technical Account Manager'},{id:'demo',name:'Solution Consultant'}],issue.resource||'')+field('Proposed effort','plannedHours',issue.estimatedHours,'number','min="0" max="24" step="0.25" required')+'<button type="submit" class="button primary">Create Proposed Task</button></form>';
    }else if(type==='single'){
      title='Single-message AI analysis';
      body='<form id="single-form"><div class="form-grid">'+select('Known client','clientId',store.state.clients,'annam')+select('Source','source',['email','ticket','crm','social'],'email')+'</div>'+field('Subject','subject','New client signal')+area('Incoming message','content','','required maxlength="10000"')+field('Incident reference (optional; use a new ID for a distinct incident)','incidentRef','')+'<label class="inline-check"><input name="simulator" type="checkbox" checked>Use labelled offline simulator</label><button class="button primary" type="submit">Analyze Message</button><p class="small muted">This uses the same persistent ingestion and review pipeline as bulk processing. It does not add an issue before review.</p></form>';
    }else if(type==='team'){
      title='Internal team directory';
      body='<p class="small muted">Only Priya is named in the case. Other display names are role placeholders. Editing a job label does not grant management authority or increase capacity.</p>'+table(['Display name','Role / capabilities','Contact','Edit'],state.employees.map(emp=>'<tr><td>'+e(emp.name)+'</td><td>'+e(emp.role)+'<small>'+e(emp.capabilities.join(', '))+'</small></td><td>'+e(emp.email||'Not supplied; email delivery not integrated')+'</td><td>'+button('Edit','employee',emp.id,'ghost')+'</td></tr>'));
    }else if(type==='employee'){
      const emp=state.employees.find(e=>e.id===id);title='Edit team member';
      body='<form data-form="employee" data-id="'+id+'">'+field('Display name','name',emp.name,'text','required')+field('Role / title','role',emp.role,'text','required')+field('Contact email (does not enable email delivery)','email',emp.email,'email')+'<fieldset><legend>Capabilities</legend>'+['account','support','technical','demo'].map(cap=>'<label class="inline-check"><input type="checkbox" name="capabilities" value="'+cap+'" '+(emp.capabilities.includes(cap)?'checked':'')+'>'+e(cap)+'</label>').join('')+'</fieldset>'+area('Reason for change','reason','','required')+'<button class="button primary" type="submit">Save Team Member</button></form>';
    }else if(type==='opportunities'){
      title='Account Opportunities';body='<p class="small muted">Contracted value, quantified potential and discovery hypotheses are separate. No revenue forecast is manufactured.</p>'+opportunityCards(state.opportunities);
    }else if(type==='opportunity'){
      const o=state.opportunities.find(o=>o.id===id);title=o.name;
      body=opportunityCards([o])+table(['Target window','30-day step','Status','Update'],o.milestones.map((m,index)=>'<tr><td>'+e(m.target)+'</td><td>'+e(m.title)+'</td><td>'+status(m.status)+'</td><td>'+(isManager()?'<select data-milestone="'+index+'" data-id="'+o.id+'" aria-label="'+e(m.title)+' status">'+options(['Proposed','In Progress','Done'],m.status)+'</select>':'—')+'</td></tr>'))+'<p class="small muted">Relative windows are a planning proposal. Service-recovery steps apply where relevant; no completion or commercial outcome is implied.</p>'+(isManager()?'<form data-form="opportunity" data-id="'+id+'">'+field('Readiness','readiness',o.readiness,'text','required')+area('Next action','nextAction',o.nextAction,'required')+field('Agreed target date (optional)','targetDate',o.targetDate,'date')+field('Update reason','note','','text','required')+'<button class="button primary" type="submit">Save Opportunity Plan</button></form>':'');
    }else if(type==='case'){
      const baseline=D.seed();title='Original case reference';
      body='<p>Exactly 12 baseline accounts. Known contracted annual value: ₹3.80 Cr across six described client accounts. Potential expansion: ₹60L, separately. Six account values and most historical details are unknown.</p>'+table(['Client / placeholder','Case contract','Stakeholder','Case issue'],baseline.clients.map(c=>'<tr><td>'+e(c.name)+(c.placeholder?'<small>Official company name not provided</small>':'')+'</td><td>'+money(c.acvLakh)+'</td><td>'+e(c.stakeholder||'Unknown')+'</td><td>'+e(baseline.issues.find(i=>i.clientId===c.id)?.impact||'No reported issues in the provided case')+'</td></tr>'))+'<p class="spaced">Internal CRM audit is the seventh work item, not a thirteenth client. Root causes and resolution outcomes have not been supplied.</p>';
    }else if(type==='connect'){
      title='Connected workspace sign-in';
      body=ui.connectionConfigured?'<p>Use a Supabase Auth account mapped to an employee by the workspace administrator. Your authenticated membership determines the role.</p><form data-form="connect">'+field('Email','email','','email','required autocomplete="username"')+field('Password','password','','password','required autocomplete="current-password"')+'<button class="button primary" type="submit">Sign In</button></form>':'<p>Connected infrastructure is not configured. The current experience is a persistent local demonstration; role switching is not authentication or real delivery.</p><p>Configure the Supabase migration, Auth accounts and server environment variables described in docs/CONNECTED.md. No cross-user delivery has been claimed.</p>';
    }
    if(type==='analysis'&&isManager()){
      const group=state.analyses.find(a=>a.id===id),a=group?.analysis;
      if(a&&['Needs review','Non-actionable'].includes(group.status))body+='<details class="spaced"><summary>Correct classification / capture feedback</summary><form data-form="group-correct" data-id="'+id+'"><div class="form-grid">'+select('Client match','clientId',state.clients,a.client_id,'Unknown / needs mapping')+select('Issue category','category',['invoice_outage','public_complaint','renewal','order_updates','executive_review','expansion','technical','routine','internal'].map(k=>({id:k,name:k.replace(/_/g,' ')})),a.issue_category)+select('Emergency classification','emergencyType',['NONE','OUTAGE','PR'],a.emergency_type)+select('Actionable?','actionable',[{id:'yes',name:'Actionable; human review required'},{id:'no',name:'Non-actionable communication'}],a.actionable?'yes':'no')+D.FACTORS.map(f=>select(f.label,f.key,[1,2,3,4,5].map(n=>({id:n,name:n+'/5'})),a.ratings[f.key],'',f.key==='F'?'disabled':'')).join('')+'</div>'+area('Reason and evidence for correction','reason','','required')+'<p class="small muted">Deal Value is recalculated from the chosen account’s contracted value. Feedback is saved as structured examples; no automatic model training is claimed.</p><button type="submit" class="button">Save Human Correction</button></form></details>';
    }
    $('dialog-title').textContent=title;$('detail-content').innerHTML=body;icons();
  }
  function stageLabel(stage){return {containment:'Temporary containment',rootCause:'Root-cause investigation',correction:'Permanent correction',recovery:'Recovery of affected transactions',monitoring:'Monitoring',verification:'Manager-verified resolution'}[stage];}
  function investigation(issue){
    return '<section class="investigation spaced"><h3>Permanent technical resolution</h3><p>Restarting the server temporarily restores the order-update process, but it does not identify or remove the condition that caused it to fail. The same failure can therefore happen again.</p><p class="small muted">General explanation, not a confirmed diagnosis of this incident.</p><div class="investigation-stages">'+D.STAGES.map(stage=>'<details><summary>'+e(stageLabel(stage))+' '+badge(issue.investigation[stage]?'Evidence recorded':'Not established',issue.investigation[stage]?'blue':'gray')+'</summary><p>'+e(issue.investigation[stage]?.note||'No verified evidence recorded for this stage.')+'</p></details>').join('')+'</div><details class="spaced-small"><summary>Engineering investigation questions</summary><ul>'+D.INVESTIGATION.map(q=>'<li>'+e(q)+'</li>').join('')+'</ul></details></section>';
  }
  function sourceMessages(rows){return '<details class="spaced-small"><summary>Supporting source records ('+rows.length+')</summary>'+(rows.length?rows.map(s=>'<details class="source-record"><summary>'+e(s.source)+' · '+e(s.externalId)+' '+(s.simulated?'· SIMULATED':'')+'</summary><dl class="facts"><dt>Source timestamp</dt><dd>'+e(date(s.timestamp))+'</dd><dt>Sender</dt><dd>'+e(s.sender||'Unknown')+'</dd><dt>Ticket state / priority / assignee</dt><dd>'+e([s.sourceStatus,s.sourcePriority,s.sourceAssignee].filter(Boolean).join(' · ')||'Unknown')+'</dd></dl><p>'+e(s.subject)+'</p><p class="preserve-lines">'+e(s.content)+'</p></details>').join(''):empty('The original case supplies a brief, not the underlying source records. Imported messages appear here after review.'))+'</details>';}
  function stagePending(records,name,simulated=false){ui.pending={records,name,simulated,mapping:{},source:'email'};store.pending(ui.pending);ui.view='intelligence';ui.page=0;render();}
  async function analyzeChunk(groups,useSimulator){
    if(useSimulator)return groups.map(g=>({...g,analysis:g.analysis,failure:null}));
    let lastError='';
    for(let attempt=0;attempt<3;attempt++){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
      try{
        const response=await fetch('/api/intelligence',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({
          mode:'signals',clients:store.state.clients.map(c=>({id:c.id,name:c.name,acvLakh:c.acvLakh})),
          knownIssues:store.state.issues.map(i=>({id:i.id,clientId:i.clientId,category:i.category,title:i.title})),
          feedback:store.state.feedback.slice(-5),
          groups:groups.map(g=>({id:g.id,records:g.records.slice(0,5).map(r=>({clientId:r.clientId,source:r.source,subject:r.subject,content:r.content.slice(0,2000)}))}))
        })});
        const data=await response.json();
        if(response.status===429&&attempt<2){lastError='Gemini rate limit';await new Promise(resolve=>setTimeout(resolve,Math.min(3000,Number(data.retryAfter||1)*1000)));continue;}
        if(!response.ok)throw new Error(data.error||'HTTP '+response.status);
        if(data.source!=='Live Gemini'||!Array.isArray(data.results)||data.results.length!==groups.length)throw new Error('Invalid result count.');
        return groups.map(g=>{
          const result=data.results.find(row=>row.group_id===g.id);
          if(!result)throw new Error('Missing group result.');
          return {...g,candidateIssueId:result.existing_issue_id||g.candidateIssueId,analysis:D.validateAnalysis(result,store.state),failure:null};
        });
      }catch(error){lastError=error.name==='AbortError'?'Gemini chunk timed out':error.message;break;}finally{clearTimeout(timer);}
    }
    return groups.map(g=>({...g,analysis:g.analysis,failure:lastError||'Gemini unavailable; labelled fallback used.'}));
  }
  async function processPending(useSimulator){
    if(ui.busy||!ui.pending)return;
    ui.busy=true;const pending=D.clone(ui.pending),mapped=pending.records.map(raw=>D.mapRecord(raw,pending.mapping,pending.source));
    try{
      const rows=D.normalizeRecords(store.state,mapped),groups=D.groupSignals(store.state,rows),done=[];
      ui.progress='Validated '+rows.length+' records. '+groups.length+' evidence groups; '+rows.filter(r=>r.errors.length).length+' invalid rows. No issue changes before review.';render();
      for(let index=0;index<groups.length;index+=3){
        const chunk=await analyzeChunk(groups.slice(index,index+3),useSimulator);done.push(...chunk);
        ui.progress='Analyzed '+done.length+' / '+groups.length+' groups. '+done.filter(g=>g.failure).length+' labelled fallback group(s). Saving all row outcomes after the run.';render();
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      await act('batch.save',{batch:{name:pending.name,records:mapped,groups:done.map(g=>({key:g.key,signalIds:g.records.map(r=>r.id),candidateIssueId:g.candidateIssueId,analysis:g.analysis,failure:g.failure}))}},false);
      store.pending(null);ui.pending=null;ui.progress='Run saved. Review consolidated proposals before changing issues or assigning work.';ui.page=0;render();
    }finally{ui.busy=false;render();}
  }
  async function aiPlan(issue,mode){
    const cap=D.capacity(store.state);
    const response=await fetch('/api/intelligence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      mode,clients:store.state.clients.map(c=>({id:c.id,name:c.name,acvLakh:c.acvLakh})),
      issue:{id:issue.id,title:issue.title,caseFacts:issue.source==='Provided case'?issue.evidence:[],verifiedFacts:issue.verifiedFacts,missingInformation:issue.missingInformation,emergencyType:issue.emergencyType},
      capacity:Object.fromEntries(Object.entries(cap).map(([key,c])=>[key,{budget:c.budget,proposed:c.proposed,approved:c.approved,confirmed:c.confirmed,actual:c.actual}])),
      priority:{score:D.score(store.state,issue),emergency:D.emergency(issue)}
    })});
    const result=await response.json();if(!response.ok||result.source!=='Live Gemini')throw new Error(result.error||'Live action planning unavailable. Existing saved information is unchanged.');
    return result.plan;
  }
  function exportJSON(filename,data){
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  }
  async function handleAction(action,id){
    if(ui.busy&&['sample-monday','sample-extra','process','single'].includes(action))throw new Error('A processing run is active. Wait for its saved result before changing staged records.');
    if(['issue','task','analysis','edit-client','new-task','single','team','employee','opportunities','opportunity','case','connect'].includes(action)){openDialog(action,id);return;}
    if(action==='client'){closeDialog();ui.profile=id||null;ui.view='clients';render();return;}
    if(action==='back-clients'){ui.profile=null;render();return;}
    if(action==='refresh'){await store.refresh();return;}
    if(action==='sample-monday'){stagePending(D.sampleMonday(),'Sample Monday — 160 simulated signals',true);return;}
    if(action==='sample-extra'){const current=ui.pending?ui.pending.records.map(r=>D.mapRecord(r,ui.pending.mapping,ui.pending.source)):[];stagePending([...current,...D.sampleSupplement()],current.length?ui.pending.name+' + simulated CRM/social':'Simulated CRM and social supplement',true);return;}
    if(action==='sample-download'){exportJSON('sample-monday-160.json',D.sampleMonday());return;}
    if(action==='process'){await processPending($('bulk-simulator').checked);return;}
    if(action==='previous-page'){ui.page=Math.max(0,ui.page-1);render();return;}
    if(action==='next-page'){ui.page++;const total=S().batches.at(-1)?.rows.length||0;ui.page=Math.min(ui.page,Math.max(0,Math.ceil(total/20)-1));render();return;}
    if(action==='draft-select'){ui.draftId=id;ui.dirtyDraft=null;render();return;}
    if(action==='task-ack'){await act('task.acknowledge',{taskId:id});return;}
    if(action==='task-start'){await act('task.start',{taskId:id});return;}
    if(action==='task-close'){await act('task.close',{taskId:id});return;}
    if(action==='reject-group'){const reason=document.querySelector('[data-form="review-group"] [name="reason"]')?.value;if(!reason?.trim())throw new Error('Provide a review note before rejecting.');await act('group.review',{analysisId:id,reject:true,reason});return;}
    if(action==='issue-plan'){toast('Preparing an action plan using verified facts and current capacity…');const issue=store.state.issues.find(i=>i.id===id),plan=await aiPlan(issue,'plan');await act('plan.save',{issueId:id,plan});return;}
    if(action==='plan-task'){const plan=store.state.aiPlans.find(p=>p.id===id);openDialog('new-task',plan.issueId);const form=document.querySelector('[data-form="new-task"]');form.querySelector('[name="description"]').value=plan.recommendedAction;return;}
    if(action==='draft-ai'){
      const draft=store.state.communications.find(c=>c.id===id),issue=store.state.issues.find(i=>i.id===draft.issueId);
      toast('Preparing a live AI draft from verified facts…');
      const plan=await aiPlan(issue,'draft');
      if(!plan.draft)throw new Error('The provider returned no draft; the saved draft is unchanged.');
      await act('draft.edit',{draftId:id,text:plan.draft,source:'Live Gemini'});ui.dirtyDraft=null;toast('AI draft saved as unverified. Complete every human check.');return;
    }
    if(action==='draft-copy'){
      if(ui.dirtyDraft)throw new Error('Save your draft edit, then re-verify.');
      const draft=store.state.communications.find(c=>c.id===id);
      if(draft.status!=='Ready to copy')throw new Error('Complete verification first.');
      try{await navigator.clipboard.writeText(draft.text);}catch{const text=$('draft-text');text.focus();text.select();if(!document.execCommand('copy'))throw new Error('Clipboard unavailable. Copy the verified draft manually.');}
      await act('draft.copy',{draftId:id});toast('Verified draft copied. No message was sent.');return;
    }
  }
  function showHelp(buttonElement){
    const bubble=$('help-bubble'),open=buttonElement.getAttribute('aria-expanded')==='true';
    closeHelp();if(open)return;
    bubble.textContent=buttonElement.dataset.help;bubble.style.maxWidth=Math.min(320,document.documentElement.clientWidth-32)+'px';bubble.classList.remove('hidden');
    const rect=buttonElement.getBoundingClientRect();bubble.style.left=Math.max(16,Math.min(rect.left,document.documentElement.clientWidth-bubble.offsetWidth-16))+'px';bubble.style.top=Math.max(10,Math.min(rect.bottom+6,window.innerHeight-bubble.offsetHeight-10))+'px';
    buttonElement.setAttribute('aria-expanded','true');buttonElement.setAttribute('aria-describedby','help-bubble');
  }
  function closeHelp(){$('help-bubble').classList.add('hidden');document.querySelectorAll('[data-help][aria-expanded=true]').forEach(b=>{b.setAttribute('aria-expanded','false');b.removeAttribute('aria-describedby');});}
  function safely(promise){Promise.resolve(promise).catch(error=>{toast(error.message,true);ui.busy=false;header();});}
  document.addEventListener('click',event=>{
    const helpButton=event.target.closest('[data-help]');if(helpButton){showHelp(helpButton);return;}closeHelp();
    const nav=event.target.closest('[data-view]');if(nav){ui.view=nav.dataset.view;ui.profile=null;render();return;}
    const action=event.target.closest('[data-action]');if(action&&!action.disabled)safely(handleAction(action.dataset.action,action.dataset.id));
    const scenario=event.target.closest('[data-scenario]');if(scenario)safely(act('scenario.change',{preset:scenario.dataset.scenario}));
    const comparison=event.target.closest('[data-comparison]');if(comparison)safely(act('comparison.change',{mode:comparison.dataset.comparison}));
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')closeHelp();
    if(event.target.matches('[data-view]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      event.preventDefault();const tabs=[...document.querySelectorAll('[data-view]')],i=tabs.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      ui.view=tabs[next].dataset.view;render();tabs[next].focus();
    }
  });
  document.addEventListener('toggle',event=>{if(event.target.id==='scoring-details')ui.scoreOpen=event.target.open;},true);
  document.addEventListener('input',event=>{
    const element=event.target;
    if(element.id==='client-search'){ui.clientQuery=element.value;render();$('client-search').focus();$('client-search').setSelectionRange(ui.clientQuery.length,ui.clientQuery.length);}
    if(element.id==='signal-search'){ui.signalQuery=element.value;ui.page=0;render();$('signal-search').focus();$('signal-search').setSelectionRange(ui.signalQuery.length,ui.signalQuery.length);}
    if(element.id==='draft-text'){
      ui.dirtyDraft={id:ui.draftId,text:element.value};$('copy-draft').disabled=true;$('draft-lock').textContent='Unsaved edit. Save changes, then repeat verification.';document.querySelectorAll('[data-draft-check]').forEach(c=>{c.checked=false;c.disabled=true;});
    }
  });
  document.addEventListener('change',event=>safely((async()=>{
    const element=event.target;
    if(element.id==='client-filter'){ui.clientFilter=element.value;render();}
    if(element.id==='task-filter'){ui.taskFilter=element.value;render();}
    if(element.id==='signal-source'){ui.signalSource=element.value;ui.page=0;render();}
    if(element.dataset.allocation){await act('allocation.edit',{taskId:element.dataset.allocation,plannedHours:Number(element.value)});}
    if(element.dataset.weight){const weights={};document.querySelectorAll('[data-weight]').forEach(input=>{weights[input.dataset.weight]=Number(input.value);});await act('weights.change',{weights});}
    if(element.dataset.map){if(ui.busy)throw new Error('Wait for the active run before remapping.');ui.pending.mapping[element.dataset.map]=element.value;store.pending(ui.pending);render();}
    if(element.id==='default-source'){if(ui.busy)throw new Error('Wait for the active run before remapping.');ui.pending.source=element.value;store.pending(ui.pending);render();}
    if(element.dataset.draftCheck!=null){await act('draft.check',{draftId:element.dataset.id,index:Number(element.dataset.draftCheck),checked:element.checked});}
    if(element.dataset.milestone!=null){await act('opportunity.edit',{opportunityId:element.dataset.id,milestoneIndex:Number(element.dataset.milestone),status:element.value,note:'Manager updated the proposed 30-day milestone.'});}
    if(element.id==='import-file'){
      const file=element.files[0];if(!file)return;if(file.size>2000000)throw new Error('Import files up to 2 MB; split larger files into smaller runs.');
      if(!/\.(csv|json)$/i.test(file.name))throw new Error('Choose a CSV or JSON file.');
      const rows=D.parseImport(await file.text(),file.name);stagePending(rows,file.name,rows.some(r=>D.mapRecord(r).simulated));
    }
  })()));
  document.addEventListener('submit',event=>{
    const form=event.target;if(!form.matches('form'))return;event.preventDefault();
    safely((async()=>{
      const data=new FormData(form),get=name=>String(data.get(name)||''),numeric=name=>get(name)===''?null:Number(get(name)),id=form.dataset.id,type=form.dataset.form;
      if(form.id==='single-form'){
        const record={externalId:'MANUAL-'+Date.now(),source:get('source'),clientId:get('clientId'),subject:get('subject'),content:get('content'),incidentRef:get('incidentRef')||null,timestamp:new Date().toISOString(),simulated:false};
        const simulator=data.get('simulator')==='on';closeDialog();stagePending([record],'Single manually entered message',false);await processPending(simulator);return;
      }
      if(type==='client-edit'){
        const changes={};['name','industry','renewalDate','stakeholder','stakeholderRole','health','risks','ownerId'].forEach(key=>{changes[key]=get(key);});
        changes.acvLakh=numeric('acvLakh');changes.expansionLakh=numeric('expansionLakh');changes.products=get('products').split(',').map(s=>s.trim()).filter(Boolean);
        await act('client.edit',{clientId:id,changes,reason:get('reason')});closeDialog();render();
      }else if(type==='rating'){
        const issue=store.state.issues.find(i=>i.id===id),ratings={F:D.valueRating(store.state.clients.find(c=>c.id===issue.clientId)?.acvLakh)};
        D.FACTORS.filter(f=>f.key!=='F').forEach(f=>{ratings[f.key]=numeric(f.key);});await act('rating.correct',{issueId:id,ratings,emergencyType:get('emergencyType'),reason:get('reason')});
      }else if(type==='group-correct'){
        const group=store.state.analyses.find(a=>a.id===id),ratings={...group.analysis.ratings};
        D.FACTORS.filter(f=>f.key!=='F').forEach(f=>{ratings[f.key]=numeric(f.key);});
        await act('group.correct',{analysisId:id,clientId:get('clientId')||null,category:get('category'),emergencyType:get('emergencyType'),actionable:get('actionable')==='yes',ratings,reason:get('reason')});
      }else if(type==='issue-note')await act('issue.note',{issueId:id,note:get('note')});
      else if(type==='new-task'){await act('task.create',{issueId:id,description:get('description'),resource:get('resource')||null,plannedHours:numeric('plannedHours')});closeDialog();ui.view='tasks';render();}
      else if(type==='approve-task')await act('task.approve',{taskId:id,note:get('note')});
      else if(type==='assign-task'){
        const task=store.state.tasks.find(t=>t.id===id);await act(task.status==='Approved'?'task.assign':'task.reassign',{taskId:id,employeeId:get('employeeId'),plannedHours:numeric('plannedHours'),description:get('description'),priority:get('priority'),dueDate:get('dueDate')||null,deliverable:get('deliverable'),instructions:get('instructions'),escalationContact:get('escalationContact'),acceptConflict:data.get('acceptConflict')==='on',conflictReason:get('conflictReason')});
      }else if(type==='progress')await act(get('updateType')==='block'?'task.block':'task.progress',{taskId:id,note:get('note'),evidence:get('evidence'),actualHours:numeric('actualHours')});
      else if(type==='investigation')await act('investigation.update',{taskId:id,stage:get('stage'),note:get('note')});
      else if(type==='resolve')await act('task.resolve',{taskId:id,note:get('note'),evidence:get('evidence'),actualHours:numeric('actualHours')});
      else if(type==='verify')await act('task.verify',{taskId:id,note:get('note'),permanentFixVerified:data.get('permanentFixVerified')==='on'});
      else if(type==='cancel')await act('task.cancel',{taskId:id,note:get('note')});
      else if(type==='reopen')await act('task.reopen',{taskId:id,note:get('note')});
      else if(type==='review-group'){await act('group.review',{analysisId:id,clientId:get('clientId'),targetIssueId:get('targetIssueId')||null,reason:get('reason')});closeDialog();render();}
      else if(type==='employee')await act('employee.edit',{employeeId:id,name:get('name'),role:get('role'),email:get('email'),capabilities:data.getAll('capabilities'),reason:get('reason')});
      else if(type==='opportunity')await act('opportunity.edit',{opportunityId:id,readiness:get('readiness'),nextAction:get('nextAction'),targetDate:get('targetDate'),note:get('note')});
      else if(type==='draft-save'){await act('draft.edit',{draftId:id,text:get('text')},false);ui.dirtyDraft=null;render();}
      else if(type==='connect'){const password=get('password');form.querySelector('[name=password]').value='';await store.connect(get('email'),password);ui.view='tasks';closeDialog();render();}
      toast('Saved. All related views use the same workspace record.');
    })());
  });
  $('close-dialog').addEventListener('click',closeDialog);
  $('detail-dialog').addEventListener('close',()=>{ui.dialog=null;});
  $('role-switch').addEventListener('change',event=>{closeDialog();ui.view='tasks';ui.taskFilter=event.target.value==='emp-manager'?'all':'mine';store.setRole(event.target.value);});
  $('connect-button').addEventListener('click',()=>{if(store.mode==='connected'){store.disconnect();ui.view='overview';render();}else openDialog('connect');});
  $('export-button').addEventListener('click',()=>exportJSON('tarang-v2-workspace.json',{...S(),exportedAt:new Date().toISOString(),mode:store.mode,capacity:D.capacity(S()),normalizedWeights:D.weights(S()),externalMessagesSent:false}));
  $('reset-button').addEventListener('click',()=>safely((async()=>{
    if(store.mode!=='demo'||!isManager())throw new Error('Reset the demo only as its manager.');
    if(!window.confirm('Reset the local case demonstration? A backup of the current workspace will be kept in browser storage.'))return;
    ui.pending=null;ui.profile=null;ui.view='overview';store.resetDemo();closeDialog();render();
  })()));
  window.addEventListener('storage',event=>{if(store?.mode==='demo'&&event.key==='tarang.portfolio.v2')safely(store.refresh());});
  window.addEventListener('resize',closeHelp);window.addEventListener('scroll',closeHelp,{passive:true});
  async function boot(){
    try{
      store=new window.WorkspaceStore(localStorage,sessionStorage);ui.pending=store.pending();store.onChange(render);
      const config=await fetch('/api/session').then(r=>r.json()).catch(()=>({connectedConfigured:false}));ui.connectionConfigured=Boolean(config.connectedConfigured);
      if(store.session){
        try{await store.refresh(true);}catch(error){$('connection-error').classList.remove('hidden');$('connection-error').textContent='Connected session could not be restored: '+error.message+' Local demonstration is shown explicitly; saved server data was not replaced.';}
      }
      render();
    }catch(error){
      $('view-content').innerHTML='<section class="panel-card"><h2>Workspace recovery required</h2><p>'+e(error.message)+'</p><button type="button" class="button" id="recovery-export">Export saved recovery data</button><p>Saved browser data has not been overwritten. See README recovery instructions.</p></section>';
      $('recovery-export')?.addEventListener('click',()=>exportJSON('tarang-recovery.json',{saved:localStorage.getItem('tarang.portfolio.v2'),backup:localStorage.getItem('tarang.portfolio.v2.backup')}));
    }
  }
  window.addEventListener('DOMContentLoaded',boot);
})();

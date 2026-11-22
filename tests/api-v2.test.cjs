const {test}=require('node:test');const assert=require('node:assert/strict');const D=require('../lib/domain.js');
const intelligence=require('../api/intelligence.js'),workspace=require('../api/workspace.js'),session=require('../api/session.js');
const envKeys=['GEMINI_API_KEY','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','TARANG_WORKSPACE_ID'];
async function invoke(handler,body,method='POST',authorization=''){
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;}};
  await handler({method,body,headers:{authorization}},res);return res;
}
test('V2 structured AI endpoint, controlled chunks and visible failures',async t=>{
  const before=Object.fromEntries(envKeys.map(key=>[key,process.env[key]])),originalFetch=global.fetch;
  const groups=[{id:'g-1',records:[{clientId:'demo',subject:'Expansion demo',content:'Please arrange a delivery-partner scheduling demo with ₹60L potential expansion.',source:'email'}]}];
  const input={mode:'signals',clients:[{id:'demo',name:'Scheduling demo account',acvLakh:40}],knownIssues:[{id:'case-2',clientId:'demo',category:'expansion',title:'Wednesday demo'}],groups};
  const valid={...D.classify(D.seed(),{clientId:'demo',subject:'Demo',content:'Please arrange a demo.'}),group_id:'g-1',confidence:91,existing_issue_id:'case-2',ratings:{F:5,U:4,I:2,R:2,S:2,G:5}};
  try{
    process.env.GEMINI_API_KEY='synthetic-model-key';
    await t.test('rejects 160 uncontrolled groups before any provider request',async()=>{
      let count=0;global.fetch=async()=>{count++;throw new Error('Unexpected request');};
      const res=await invoke(intelligence,{...input,groups:Array.from({length:160},(_,i)=>({...groups[0],id:'g-'+i}))});
      assert.equal(res.statusCode,400);assert.equal(count,0);
    });
    await t.test('keeps keys in headers and corrects financial double counting deterministically',async()=>{
      let calls=0;
      global.fetch=async(url,options)=>{calls++;assert.ok(!url.includes('synthetic-model-key'));assert.equal(options.headers['x-goog-api-key'],'synthetic-model-key');const body=JSON.parse(options.body);assert.match(body.systemInstruction.parts[0].text,/untrusted DATA/);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({results:[valid]})}]}}]})};};
      const res=await invoke(intelligence,input);
      assert.equal(res.statusCode,200);assert.equal(calls,1);assert.equal(res.body.source,'Live Gemini');assert.equal(res.body.results[0].ratings.F,3);assert.equal(res.body.results[0].existing_issue_id,'case-2');
      assert.equal(res.body.results[0].engHours,undefined);
    });
    await t.test('rate limits are explicit with bounded retry metadata',async()=>{
      global.fetch=async()=>({ok:false,status:429});const res=await invoke(intelligence,input);
      assert.equal(res.statusCode,429);assert.equal(res.body.code,'RATE_LIMIT');assert.equal(res.headers['Retry-After'],'2');
    });
    await t.test('rejects missing, duplicate, invented-client and invalid model results',async()=>{
      for(const results of [[],[valid,valid],[{...valid,client_id:'invented'}],[{...valid,confidence:101}],[{...valid,ratings:{F:8}}]]){
        global.fetch=async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({results})}]}}]})});
        const res=await invoke(intelligence,input);assert.equal(res.statusCode,502);
      }
    });
    await t.test('network failures do not disclose provider details or credentials',async()=>{
      global.fetch=async()=>{throw new Error('synthetic-model-key private failure detail');};
      const res=await invoke(intelligence,input);assert.equal(res.statusCode,502);assert.ok(!JSON.stringify(res.body).includes('synthetic-model-key'));
    });
    await t.test('Prompt B action planning is a real validated endpoint',async()=>{
      const plan={recommended_action:'Review verified evidence before requesting a demo.',suggested_assignee_role:'Solution Consultant',missing_information:['Confirmed demo scope'],capacity_note:'Only one hour exists; no booking is confirmed.',draft:null};
      global.fetch=async(url,options)=>{assert.match(JSON.parse(options.body).systemInstruction.parts[0].text,/Prompt B/);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(plan)}]}}]})};};
      const res=await invoke(intelligence,{mode:'plan',issue:{id:'case-2',verifiedFacts:[]},capacity:{demo:{budget:1}}});
      assert.equal(res.statusCode,200);assert.equal(res.body.plan.suggested_assignee_role,'Solution Consultant');
      assert.equal(res.body.plan.confirmedHours,undefined);
    });
    await t.test('unconfigured AI never claims success',async()=>{
      delete process.env.GEMINI_API_KEY;const res=await invoke(intelligence,input);assert.equal(res.statusCode,503);assert.equal(res.body.code,'NOT_CONFIGURED');
    });
  }finally{global.fetch=originalFetch;for(const key of envKeys)if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
});
test('I: authenticated workspace API verifies identity, membership, scope and optimistic concurrency (mocked Supabase)',async t=>{
  const before=Object.fromEntries(envKeys.map(key=>[key,process.env[key]])),originalFetch=global.fetch;
  let state=D.seed(),rpcCalls=0,cas=true;
  const manager={employeeId:'emp-manager',role:'manager',mode:'demo'};
  state=D.applyAction(state,{type:'task.approve',payload:{taskId:'task-1',note:'Synthetic setup.'}},manager);
  state=D.applyAction(state,{type:'task.assign',payload:{taskId:'task-1',employeeId:'emp-technical',plannedHours:4,deliverable:'Synthetic evidence.'}},manager);
  try{
    Object.assign(process.env,{SUPABASE_URL:'https://mock.supabase.co',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-secret',TARANG_WORKSPACE_ID:'11111111-1111-4111-8111-111111111111'});
    global.fetch=async(url,options={})=>{
      if(url.includes('/auth/v1/user')){
        assert.equal(options.headers.apikey,'synthetic-anon');
        const managerToken=options.headers.Authorization.includes('manager-token');
        return {ok:true,json:async()=>({id:managerToken?'22222222-2222-4222-8222-222222222222':'33333333-3333-4333-8333-333333333333'})};
      }
      if(url.includes('/tarang_members?')){
        const scoped=url.includes('user_id='),managerQuery=url.includes('22222222-2222');
        return {ok:true,json:async()=>scoped?[{employee_id:managerQuery?'emp-manager':'emp-technical',app_role:managerQuery?'manager':'assignee'}]:[{employee_id:'emp-manager'},{employee_id:'emp-technical'}]};
      }
      if(url.includes('/tarang_workspaces?'))return {ok:true,json:async()=>[{state:D.clone(state),revision:state.revision}]};
      if(url.includes('/rpc/tarang_commit_workspace')){
        rpcCalls++;const payload=JSON.parse(options.body);
        if(cas)state=D.clone(payload.p_state);
        return {ok:true,json:async()=>cas};
      }
      throw new Error('Unexpected mock URL');
    };
    await t.test('anonymous requests cannot read task data',async()=>{
      const res=await invoke(workspace,null,'GET');assert.equal(res.statusCode,401);assert.equal(res.body.state,undefined);
    });
    await t.test('assignee reads only assigned tasks and relevant accounts',async()=>{
      const res=await invoke(workspace,null,'GET','Bearer assignee-token-000000');
      assert.equal(res.statusCode,200);assert.equal(res.body.actor.role,'assignee');assert.equal(res.body.state.tasks.length,1);assert.equal(res.body.state.clients.length,1);assert.equal(res.body.state.communications.length,0);
      assert.ok(!JSON.stringify(res.body).includes('synthetic-server-secret'));
    });
    await t.test('forged client-side manager identity cannot approve or modify another assignment',async()=>{
      const res=await invoke(workspace,{expectedRevision:state.revision,actor:{role:'manager',employeeId:'emp-manager'},action:{type:'task.approve',payload:{taskId:'task-2',note:'Spoofed authority'}}},'POST','Bearer assignee-token-000000');
      assert.equal(res.statusCode,403);assert.equal(rpcCalls,0);
      const other=await invoke(workspace,{expectedRevision:state.revision,action:{type:'task.acknowledge',payload:{taskId:'task-2'}}},'POST','Bearer assignee-token-000000');
      assert.equal(other.statusCode,403);
    });
    await t.test('assignee acknowledgment is durably committed via the storage contract',async()=>{
      const res=await invoke(workspace,{expectedRevision:state.revision,action:{type:'task.acknowledge',payload:{taskId:'task-1'}}},'POST','Bearer assignee-token-000000');
      assert.equal(res.statusCode,200);assert.equal(state.tasks[0].status,'Acknowledged');assert.equal(rpcCalls,1);
    });
    await t.test('stale revisions and failed compare-and-swap cannot overwrite records',async()=>{
      const beforeState=JSON.stringify(state);
      let res=await invoke(workspace,{expectedRevision:0,action:{type:'task.start',payload:{taskId:'task-1'}}},'POST','Bearer assignee-token-000000');
      assert.equal(res.statusCode,409);cas=false;
      res=await invoke(workspace,{expectedRevision:state.revision,action:{type:'task.start',payload:{taskId:'task-1'}}},'POST','Bearer assignee-token-000000');
      assert.equal(res.statusCode,409);assert.equal(JSON.stringify(state),beforeState);
    });
  }finally{global.fetch=originalFetch;for(const key of envKeys)if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
});
test('Connected configuration endpoint reveals capability flags, not secrets',async()=>{
  const previous=process.env.SUPABASE_URL;delete process.env.SUPABASE_URL;
  try{
    const result=await invoke(session,null,'GET');assert.equal(result.statusCode,200);assert.equal(result.body.connectedConfigured,false);assert.equal(result.body.emailNotifications,false);
    const login=await invoke(session,{email:'synthetic@example.test',password:'not-a-real-password'});assert.equal(login.statusCode,503);
  }finally{if(previous===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=previous;}
});

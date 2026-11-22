const D = require('./domain.js');
function configured() { return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_ANON_KEY && process.env.TARANG_WORKSPACE_ID); }
async function request(path, options = {}, userToken = null, publicKey = false) {
  const key = publicKey ? process.env.SUPABASE_ANON_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(process.env.SUPABASE_URL.replace(/\/$/,'') + path, {
    ...options, headers:{'Content-Type':'application/json',apikey:key,Authorization:'Bearer ' + (userToken || key),...(options.headers||{})}, signal:AbortSignal.timeout(15000)
  });
  let data; try { data = await response.json(); } catch { data = null; }
  if (!response.ok) { const error = new Error(response.status===401?'Authentication expired or invalid.':'Connected storage request failed.'); error.status=response.status===401?401:502; throw error; }
  return data;
}
async function identity(req) {
  if (!configured()) { const error=new Error('Connected mode is not configured. Local demonstration remains available.');error.status=503;throw error; }
  const authorization = req.headers?.authorization || '';
  if (!/^Bearer [^\s]{10,10000}$/.test(authorization)) { const error=new Error('Sign in to access connected records.');error.status=401;throw error; }
  const token=authorization.slice(7), user=await request('/auth/v1/user',{},token,true);
  if (!user?.id || !/^[a-f0-9-]{36}$/i.test(user.id)) { const error=new Error('Invalid authenticated identity.');error.status=401;throw error; }
  const members=await request('/rest/v1/tarang_members?workspace_id=eq.'+encodeURIComponent(process.env.TARANG_WORKSPACE_ID)+'&user_id=eq.'+encodeURIComponent(user.id)+'&select=employee_id,app_role');
  if (!members?.length || !['manager','assignee'].includes(members[0].app_role)) { const error=new Error('This user is not a member of the workspace.');error.status=403;throw error; }
  return {employeeId:members[0].employee_id,role:members[0].app_role,mode:'connected',userId:user.id};
}
async function load() {
  const rows=await request('/rest/v1/tarang_workspaces?id=eq.'+encodeURIComponent(process.env.TARANG_WORKSPACE_ID)+'&select=state,revision');
  if (!rows?.length) { const error=new Error('Initialize the workspace with the documented migration and seed script.');error.status=503;throw error; }
  const state=D.validateState(rows[0].state);
  state.revision=Number(rows[0].revision); return state;
}
async function commit(state, expectedRevision) {
  const result=await request('/rest/v1/rpc/tarang_commit_workspace',{method:'POST',body:JSON.stringify({p_id:process.env.TARANG_WORKSPACE_ID,p_expected_revision:expectedRevision,p_state:state})});
  if (result!==true) { const error=new Error('Workspace changed in another session. Refresh and retry; no update was overwritten.');error.status=409;throw error; }
}
async function recipients() {
  const rows=await request('/rest/v1/tarang_members?workspace_id=eq.'+encodeURIComponent(process.env.TARANG_WORKSPACE_ID)+'&select=employee_id');
  return rows.map(row=>row.employee_id);
}
module.exports={configured,request,identity,load,commit,recipients};

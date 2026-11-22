const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const D=require('../lib/domain.js');
class MemoryStorage{constructor(){this.map=new Map();}getItem(k){return this.map.get(k)||null;}setItem(k,v){this.map.set(k,v);}removeItem(k){this.map.delete(k);}}
function Store(){const context=vm.createContext({Tarang:D,fetch:()=>{throw new Error('Unexpected network');}});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/store.js'),'utf8'),context);return context.WorkspaceStore;}
test('F: local persistence survives reload, including assignment, status and activity',async()=>{
  const storage=new MemoryStorage(),sessions=new MemoryStorage(),Workspace=Store();let store=new Workspace(storage,sessions);
  await store.act('task.approve',{taskId:'task-1',note:'Synthetic approval.'});
  await store.act('task.assign',{taskId:'task-1',employeeId:'emp-technical',plannedHours:4,deliverable:'Synthetic evidence.'});
  store.setRole('emp-technical');await store.act('task.acknowledge',{taskId:'task-1'});
  store=new Workspace(storage,sessions);
  assert.equal(store.state.tasks[0].status,'Acknowledged');assert.equal(store.state.tasks[0].assigneeId,'emp-technical');assert.ok(store.state.activity.some(a=>a.type==='Assignment acknowledged'));
  assert.equal(store.state.tasks.length,7);
});
test('F / G: pending imports persist and a quota failure cannot overwrite saved records',async()=>{
  const storage=new MemoryStorage(),Workspace=Store(),store=new Workspace(storage,new MemoryStorage());
  store.pending({records:D.sampleMonday(),name:'Sample'});
  assert.equal(new Workspace(storage,new MemoryStorage()).pending().records.length,160);
  const before=JSON.stringify(store.state);storage.setItem=()=>{throw new Error('QuotaExceeded');};
  await assert.rejects(()=>store.act('task.approve',{taskId:'task-1',note:'Should not commit.'}),/Quota/);
  assert.equal(JSON.stringify(store.state),before);
});
test('F: stale tabs are refreshed and cannot silently overwrite newer revisions',async()=>{
  const storage=new MemoryStorage(),Workspace=Store(),one=new Workspace(storage,new MemoryStorage()),two=new Workspace(storage,new MemoryStorage());
  await one.act('task.approve',{taskId:'task-1',note:'First tab approval.'});
  await assert.rejects(()=>two.act('task.approve',{taskId:'task-2',note:'Stale tab approval.'}),/Another tab/);
  assert.equal(two.state.revision,one.state.revision);assert.equal(two.state.tasks[1].status,'Proposed');
});
test('G: corrupt local data is not silently reset',()=>{
  const storage=new MemoryStorage(),Workspace=Store();storage.setItem('tarang.portfolio.v2','invalid-json');
  assert.throws(()=>new Workspace(storage,new MemoryStorage()),/not been replaced/);
  assert.equal(storage.getItem('tarang.portfolio.v2'),'invalid-json');
});

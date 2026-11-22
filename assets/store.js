(function(root) {
  'use strict';
  const D=root.Tarang, KEY='tarang.portfolio.v2', PENDING=KEY+'.pending';
  class WorkspaceStore {
    constructor(storage,session) {
      this.storage=storage;this.sessionStorage=session;this.mode='demo';this.actor={employeeId:'emp-manager',role:'manager',mode:'demo'};
      const saved=storage.getItem(KEY);
      try {this.state=saved?D.validateState(JSON.parse(saved)):D.seed();}
      catch {this.corrupt=saved;throw new Error('Saved workspace could not be read. It has not been replaced. Export the recovery data or restore a backup.');}
      if(!saved)storage.setItem(KEY,JSON.stringify(this.state));
      this.session=JSON.parse(session.getItem('tarang.session')||'null');
      this.listeners=[];
    }
    onChange(callback){this.listeners.push(callback);}
    notify(){this.listeners.forEach(callback=>callback());}
    setRole(employeeId){
      if(this.mode!=='demo')throw new Error('Connected identity is determined by authenticated workspace membership.');
      const employee=this.state.employees.find(e=>e.id===employeeId);
      if(!employee)throw new Error('Employee not found.');
      this.actor={employeeId,role:employee.appRole,mode:'demo'};this.notify();
    }
    async token(){
      if(!this.session)throw new Error('Sign in first.');
      if(this.session.expiresAt<Date.now()+30000){
        const response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'refresh',refreshToken:this.session.refreshToken})});
        if(!response.ok)throw new Error('Session expired. Sign in again; saved server records are unchanged.');
        this.session=await response.json();this.sessionStorage.setItem('tarang.session',JSON.stringify(this.session));
      }
      return this.session.accessToken;
    }
    async connect(email,password){
      const response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Sign-in failed.');
      this.session=data;this.sessionStorage.setItem('tarang.session',JSON.stringify(data));await this.refresh(true);
    }
    async refresh(connect=false){
      if(this.mode==='connected'||connect){
        const response=await fetch('/api/workspace',{headers:{Authorization:'Bearer '+await this.token()}});
        const data=await response.json();if(!response.ok)throw new Error(data.error||'Connected workspace unavailable.');
        this.state=D.validateState(data.state);this.actor=data.actor;this.mode='connected';
      }else{
        const raw=this.storage.getItem(KEY);if(raw)this.state=D.validateState(JSON.parse(raw));
      }
      this.notify();
    }
    disconnect(){this.sessionStorage.removeItem('tarang.session');this.session=null;this.mode='demo';this.state=D.validateState(JSON.parse(this.storage.getItem(KEY)));this.actor={employeeId:'emp-manager',role:'manager',mode:'demo'};this.notify();}
    async act(type,payload={}){
      if(this.mode==='connected'){
        const response=await fetch('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await this.token()},body:JSON.stringify({expectedRevision:this.state.revision,action:{type,payload}})});
        const data=await response.json();if(!response.ok)throw new Error(data.error||'The server did not confirm this change. Refresh before retrying.');
        this.state=D.validateState(data.state);this.actor=data.actor;
      }else{
        const latest=JSON.parse(this.storage.getItem(KEY)||'null');
        if(latest&&latest.revision!==this.state.revision){this.state=D.validateState(latest);this.notify();throw new Error('Another tab changed this workspace. It was refreshed; retry your action.');}
        const next=D.applyAction(this.state,{type,payload},this.actor);
        this.storage.setItem(KEY,JSON.stringify(next)); // Commit before publishing state. Quota failure leaves old records intact.
        this.state=next;
      }
      return this.state;
    }
    pending(value){
      if(arguments.length){if(value===null)this.storage.removeItem(PENDING);else this.storage.setItem(PENDING,JSON.stringify(value));}
      else return JSON.parse(this.storage.getItem(PENDING)||'null');
    }
    resetDemo(){
      if(this.mode!=='demo'||this.actor.role!=='manager')throw new Error('Reset is available to the demonstration manager only.');
      this.storage.setItem(KEY+'.backup',this.storage.getItem(KEY)||'');
      const next=D.seed();this.storage.setItem(KEY,JSON.stringify(next));this.state=next;this.pending(null);this.notify();
    }
  }
  root.WorkspaceStore=WorkspaceStore;
})(typeof globalThis!=='undefined'?globalThis:this);

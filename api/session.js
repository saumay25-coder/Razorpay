const C = require('../lib/connected.js');
module.exports=async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method==='GET') return res.status(200).json({connectedConfigured:C.configured(),provider:'Supabase Auth + Postgres',emailNotifications:false});
  if (req.method!=='POST') {res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Use GET or POST.'});}
  if (!C.configured()) return res.status(503).json({error:'Connected mode is not configured. Follow docs/CONNECTED.md; local role switching is demonstration only.'});
  let body;
  try {body=typeof req.body==='string'?JSON.parse(req.body):req.body;} catch {return res.status(400).json({error:'Invalid JSON.'});}
  try {
    if (body?.action==='refresh') {
      if (typeof body.refreshToken!=='string'||body.refreshToken.length>10000) return res.status(400).json({error:'Invalid refresh token.'});
      const session=await C.request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:body.refreshToken})},null,true);
      return res.status(200).json({accessToken:session.access_token,refreshToken:session.refresh_token,expiresAt:Date.now()+session.expires_in*1000});
    }
    if (!body || typeof body.email!=='string'||body.email.length>250||typeof body.password!=='string'||body.password.length>1000||!body.password) return res.status(400).json({error:'Email and password are required.'});
    const session=await C.request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:body.email,password:body.password})},null,true);
    return res.status(200).json({accessToken:session.access_token,refreshToken:session.refresh_token,expiresAt:Date.now()+session.expires_in*1000});
  } catch {return res.status(401).json({error:'Sign-in failed. Check the configured account; no credentials were logged.'});}
};

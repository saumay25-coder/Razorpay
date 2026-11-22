// Local preview for the same frontend and serverless handler used on Vercel.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const handlers = {
  '/api/triage': require('./api/triage.js'),
  '/api/intelligence': require('./api/intelligence.js'),
  '/api/workspace': require('./api/workspace.js'),
  '/api/session': require('./api/session.js')
};
const port = Number(process.env.PORT || 4174);
http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const pathname = new URL(req.url,'http://localhost').pathname;
  if (handlers[pathname]) {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 2000000) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Message is too large.' }));
        return;
      }
    }
    req.body = body;
    res.status = status => { res.statusCode = status; return res; };
    res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return res; };
    try { await handlers[pathname](req, res); }
    catch { if (!res.headersSent) res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'The local handler could not finish. Saved records are unchanged.'})); }
    return;
  }
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
    return;
  }
  const assets = {'/assets/app.css':['assets/app.css','text/css'],'/assets/app.js':['assets/app.js','text/javascript'],'/assets/store.js':['assets/store.js','text/javascript'],'/lib/domain.js':['lib/domain.js','text/javascript']};
  if (req.method==='GET' && assets[pathname]) {
    res.setHeader('Content-Type',assets[pathname][1]+'; charset=utf-8');
    fs.createReadStream(path.join(__dirname,assets[pathname][0])).pipe(res);
    return;
  }
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  res.writeHead(404); res.end('Not found');
}).listen(port, '127.0.0.1', () => console.log('Tarang Cloud preview: http://127.0.0.1:' + port));

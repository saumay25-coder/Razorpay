// Local preview for the same frontend and serverless handler used on Vercel.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const triage = require('./api/triage.js');
const port = Number(process.env.PORT || 4174);
http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/api/triage') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 16000) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Message is too large.' }));
        return;
      }
    }
    req.body = body;
    res.status = status => { res.statusCode = status; return res; };
    res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return res; };
    await triage(req, res);
    return;
  }
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
    return;
  }
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  res.writeHead(404); res.end('Not found');
}).listen(port, '127.0.0.1', () => console.log('Tarang Cloud preview: http://127.0.0.1:' + port));

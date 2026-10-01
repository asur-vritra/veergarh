// Veergarh Kila: tiny Node server (static files + WebSocket chat/animations)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const ROLES = ['raja', 'rani', 'senapati', 'sipahi', 'daas'];
const WEAPONS = ['sword', 'arrow', 'cannon', 'fire', 'coins', 'gada', 'bhala', 'kataar', 'kulhadi', 'trishul', 'bandook'];

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') { res.end('ok'); return; }
  if (url === '/') url = '/index.html';
  const file = path.normalize(path.join(PUB, url));
  if (!file.startsWith(PUB)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 2048 });
const hist = [];            // last 60 chat messages and weapon strikes
let nextId = 1;

const push = (m) => { hist.push(m); if (hist.length > 60) hist.shift(); };
const members = () => [...wss.clients].filter(c => c.user).map(c => ({ id: c.id, ...c.user }));
const send = (c, m) => c.readyState === 1 && c.send(JSON.stringify(m));
const broadcast = (m) => wss.clients.forEach(c => c.user && send(c, m));
const sendMembers = () => broadcast({ k: 'members', members: members() });

wss.on('connection', (ws) => {
  ws.id = nextId++;
  ws.alive = true;
  ws.last = { chat: 0, fx: 0 };
  ws.on('pong', () => { ws.alive = true; });

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const now = Date.now();
    if (m.k === 'join') {
      const name = String(m.name || '').trim().slice(0, 24) || 'Anjaan';
      ws.user = { name, role: ROLES.includes(m.role) ? m.role : 'daas' };
      send(ws, { k: 'init', id: ws.id, members: members(), hist });
      sendMembers();
    } else if (!ws.user) {
      return;
    } else if (m.k === 'chat') {
      const text = String(m.text || '').trim().slice(0, 240);
      if (!text || now - ws.last.chat < 400) return;
      ws.last.chat = now;
      const msg = { k: 'chat', ...ws.user, text, ts: now };
      push(msg); broadcast(msg);
    } else if (m.k === 'fx') {
      if (!WEAPONS.includes(m.t) || now - ws.last.fx < 1500) return;
      ws.last.fx = now;
      const msg = { k: 'fx', t: m.t, ts: now };
      push(msg); broadcast(msg);
    }
  });
  ws.on('close', sendMembers);
});

setInterval(() => {            // drop dead connections
  wss.clients.forEach(c => { if (!c.alive) return c.terminate(); c.alive = false; c.ping(); });
}, 30000);

server.listen(PORT, () => console.log('Veergarh Kila chal raha hai: http://localhost:' + PORT));

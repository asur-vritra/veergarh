// Veergarh Kila - Node server
// Static files + WebSocket chat/animations

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// Files are in the SAME folder as server.js
const PUB = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const ROLES = ['raja', 'rani', 'senapati', 'sipahi', 'daas'];

const WEAPONS = [
  'sword',
  'arrow',
  'cannon',
  'fire',
  'coins',
  'gada',
  'bhala',
  'kataar',
  'kulhadi',
  'trishul',
  'bandook'
];

const server = http.createServer((req, res) => {
  try {
    let url = decodeURIComponent((req.url || '/').split('?')[0]);

    if (url === '/healthz') {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      return res.end('ok');
    }

    if (url === '/') {
      url = '/index.html';
    }

    // Remove leading slash before joining
    const relativePath = url.replace(/^\/+/, '');

    const file = path.resolve(PUB, relativePath);

    // Security check
    if (!file.startsWith(path.resolve(PUB) + path.sep) &&
        file !== path.resolve(PUB)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        console.log('File not found:', file);

        res.writeHead(404, {
          'Content-Type': 'text/plain; charset=utf-8'
        });

        return res.end('Not found');
      }

      const ext = path.extname(file).toLowerCase();

      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream'
      });

      res.end(data);
    });

  } catch (err) {
    console.error(err);

    res.writeHead(500, {
      'Content-Type': 'text/plain; charset=utf-8'
    });

    res.end('Server error');
  }
});

// WebSocket
const wss = new WebSocketServer({
  server,
  maxPayload: 2048
});

const hist = [];
let nextId = 1;

const push = (m) => {
  hist.push(m);

  if (hist.length > 60) {
    hist.shift();
  }
};

const members = () =>
  [...wss.clients]
    .filter(c => c.user)
    .map(c => ({
      id: c.id,
      ...c.user
    }));

const send = (c, m) => {
  if (c.readyState === 1) {
    c.send(JSON.stringify(m));
  }
};

const broadcast = (m) => {
  wss.clients.forEach(c => {
    if (c.user) {
      send(c, m);
    }
  });
};

const sendMembers = () => {
  broadcast({
    k: 'members',
    members: members()
  });
};

wss.on('connection', (ws) => {

  ws.id = nextId++;
  ws.alive = true;

  ws.last = {
    chat: 0,
    fx: 0
  };

  ws.on('pong', () => {
    ws.alive = true;
  });

  ws.on('message', (raw) => {

    let m;

    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }

    const now = Date.now();

    // JOIN
    if (m.k === 'join') {

      const name =
        String(m.name || '')
          .trim()
          .slice(0, 24) || 'Anjaan';

      ws.user = {
        name,
        role: ROLES.includes(m.role)
          ? m.role
          : 'daas'
      };

      send(ws, {
        k: 'init',
        id: ws.id,
        members: members(),
        hist
      });

      sendMembers();

    }

    // Ignore unauthenticated users
    else if (!ws.user) {
      return;
    }

    // CHAT
    else if (m.k === 'chat') {

      const text =
        String(m.text || '')
          .trim()
          .slice(0, 240);

      if (!text || now - ws.last.chat < 400) {
        return;
      }

      ws.last.chat = now;

      const msg = {
        k: 'chat',
        ...ws.user,
        text,
        ts: now
      };

      push(msg);
      broadcast(msg);
    }

    // WEAPON FX
    else if (m.k === 'fx') {

      if (
        !WEAPONS.includes(m.t) ||
        now - ws.last.fx < 1500
      ) {
        return;
      }

      ws.last.fx = now;

      const msg = {
        k: 'fx',
        t: m.t,
        ts: now
      };

      push(msg);
      broadcast(msg);
    }
  });

  ws.on('close', () => {
    sendMembers();
  });
});

// Ping clients
setInterval(() => {

  wss.clients.forEach(c => {

    if (!c.alive) {
      return c.terminate();
    }

    c.alive = false;
    c.ping();

  });

}, 30000);

// Start
server.listen(PORT, () => {
  console.log(
    `Veergarh Kila chal raha hai: http://localhost:${PORT}`
  );
});

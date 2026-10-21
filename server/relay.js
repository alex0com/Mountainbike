// Bluecow Rager two-player relay: pairs two games in a room by a four-letter code and passes their messages between
// them. It keeps no game state of its own; the host's game keeps the clock and decides the rounds.
//
//   PORT=8090 HOST=127.0.0.1 node relay.js
//
// Messages are JSON. To the relay:
//   {t: 'host'}              open a room          -> {t: 'room', code, you: 0}
//   {t: 'join', code}        join one             -> {t: 'joined', code, you: 1}, and the host gets {t: 'peer', on: true}
//   anything else            passed on as it is to the other player in the room
// From the relay, when the other player goes: {t: 'peer', on: false}; when something is wrong: {t: 'error', msg}
'use strict';
const {WebSocketServer} = require('ws');

const PORT = +(process.env.PORT || 8090), HOST = process.env.HOST || '127.0.0.1';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ', MAX_MESSAGE = 8192, ROOM_IDLE = 30*60*1000;
const rooms = new Map;

const send = (ws, m)=> { if (ws && ws.readyState == 1) ws.send(typeof m == 'string' ? m : JSON.stringify(m)); };
function newCode()
{
    for (;;)
    {
        let c = '';
        for (let k = 0; k < 4; ++k) c += LETTERS[Math.random()*LETTERS.length | 0];
        if (!rooms.has(c)) return c;
    }
}
function leave(ws)
{
    const room = rooms.get(ws.code);
    if (!room) return;
    room.players = room.players.filter(p=> p != ws);
    for (const p of room.players) send(p, {t: 'peer', on: false});
    // a room stays open for its host to be rejoined; it goes when both have gone
    if (!room.players.length) rooms.delete(ws.code);
    ws.code = null;
}

const wss = new WebSocketServer({host: HOST, port: PORT, maxPayload: MAX_MESSAGE});
wss.on('connection', ws=>
{
    ws.alive = true;
    ws.on('pong', ()=> ws.alive = true);
    ws.on('message', data=>
    {
        const text = String(data);
        let m;
        try { m = JSON.parse(text); } catch(e) { return; }
        const room = rooms.get(ws.code);
        if (room) room.seen = Date.now();
        if (m.t == 'host')
        {
            leave(ws);
            const code = newCode();
            rooms.set(code, {players: [ws], seen: Date.now()});
            ws.code = code;
            send(ws, {t: 'room', code, you: 0});
        }
        else if (m.t == 'join')
        {
            const code = String(m.code || '').toUpperCase().replace(/[^A-Z]/g, ''), r = rooms.get(code);
            if (!r) return send(ws, {t: 'error', msg: 'no room ' + code});
            if (r.players.length >= 2) return send(ws, {t: 'error', msg: 'room ' + code + ' is full'});
            leave(ws);
            r.players.push(ws); r.seen = Date.now();
            ws.code = code;
            send(ws, {t: 'joined', code, you: r.players.length - 1});
            for (const p of r.players) if (p != ws) send(p, {t: 'peer', on: true});
        }
        else if (room) for (const p of room.players) if (p != ws) send(p, text);
    });
    ws.on('close', ()=> leave(ws));
});

// drop connections that stop answering, and rooms nobody has used for a long time
setInterval(()=>
{
    for (const ws of wss.clients)
    {
        if (!ws.alive) { ws.terminate(); continue; }
        ws.alive = false;
        ws.ping();
    }
    const now = Date.now();
    for (const [code, r] of rooms) if (now - r.seen > ROOM_IDLE) { for (const p of r.players) p.close(); rooms.delete(code); }
}, 20000);

console.log(`bluecow relay on ws://${HOST}:${PORT}`);

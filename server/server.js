const http = require("http");
const { Server } = require("socket.io");
const PORT = process.env.PORT || 3000;

const httpServer = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Game server is running!");
});

const io = new Server(httpServer, {
  cors: { origin: "*" }
});

const players = {};
const SPEED = 3;
const ENEMY_SPEED = 1.2;
const ENEMY_SIZE = 28;       // collision diameter for enemy-enemy
const ENEMY_PLAYER_SIZE = 30; // collision diameter for enemy-player (avg of 28 and 32)
const MAX_ENEMIES = 6;
const TICK_RATE = 1000 / 60; // 60 times per second

const enemies = {};
let enemyIdCounter = 0;

function getNearestPlayer(enemy) {
  let nearest = null;
  let nearestDist = Infinity;

  Object.values(players).forEach((p) => {
    if (p.team === "enemy") return; // skip teammates when teams added
    const dx = p.x - enemy.x;
    const dy = p.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = p;
    }
  });

  return nearest;
}

function spawnEnemy() {
  if (Object.keys(enemies).length >= MAX_ENEMIES) return;

  const id = "e_" + enemyIdCounter++;
  const side = Math.floor(Math.random() * 4);
  let x, y;

  // spawn on a random edge
  if (side === 0) { x = Math.random() * 2000; y = 16; }
  else if (side === 1) { x = Math.random() * 2000; y = 1984; }
  else if (side === 2) { x = 16; y = Math.random() * 2000; }
  else { x = 1984; y = Math.random() * 2000; }

  enemies[id] = {
    id, x, y,
    targetId: null,
    team: "enemy",
    hp: 100,
    maxHp: 100
  };

  io.emit("enemySpawned", enemies[id]);
}

setInterval(spawnEnemy, 4000);

// retarget every second
setInterval(() => {
  Object.values(enemies).forEach((e) => {
    const nearest = getNearestPlayer(e);
    e.targetId = nearest ? nearest.id : null;
  });
}, 1000);

// server loop
setInterval(() => {
  const playerList = Object.values(players);
  const enemyList  = Object.values(enemies);

  // move players
  playerList.forEach((p) => {
    if (p.inputs.up)    p.y = Math.max(16, p.y - SPEED);
    if (p.inputs.down)  p.y = Math.min(1984, p.y + SPEED);
    if (p.inputs.left)  p.x = Math.max(16, p.x - SPEED);
    if (p.inputs.right) p.x = Math.min(1984, p.x + SPEED);
  });

  // player-player collision
  const PLAYER_MIN_DIST = 32;
  for (let i = 0; i < playerList.length; i++) {
    for (let j = i + 1; j < playerList.length; j++) {
      const a = playerList[i];
      const b = playerList[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PLAYER_MIN_DIST && dist > 0) {
        const overlap = (PLAYER_MIN_DIST - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        a.x = Math.max(16, Math.min(1984, a.x));
        a.y = Math.max(16, Math.min(1984, a.y));
        b.x = Math.max(16, Math.min(1984, b.x));
        b.y = Math.max(16, Math.min(1984, b.y));
      }
    }
  }

  // broadcast updated player positions
  playerList.forEach((p) => {
    io.emit("playerMoved", { id: p.id, x: p.x, y: p.y, name: p.name, angle: p.angle });
  });

  // move enemies toward their target
  enemyList.forEach((e) => {
    const target = e.targetId ? players[e.targetId] : null;
    if (!target) return;
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 2) {
      e.x += (dx / dist) * ENEMY_SPEED;
      e.y += (dy / dist) * ENEMY_SPEED;
      e.x = Math.max(16, Math.min(1984, e.x));
      e.y = Math.max(16, Math.min(1984, e.y));
    }
  });

  // enemy-enemy collision
  for (let i = 0; i < enemyList.length; i++) {
    for (let j = i + 1; j < enemyList.length; j++) {
      const a = enemyList[i];
      const b = enemyList[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < ENEMY_SIZE && dist > 0) {
        const overlap = (ENEMY_SIZE - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        a.x = Math.max(16, Math.min(1984, a.x));
        a.y = Math.max(16, Math.min(1984, a.y));
        b.x = Math.max(16, Math.min(1984, b.x));
        b.y = Math.max(16, Math.min(1984, b.y));
      }
    }
  }

  // enemy-player collision
  enemyList.forEach((e) => {
    playerList.forEach((p) => {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < ENEMY_PLAYER_SIZE && dist > 0) {
        const overlap = ENEMY_PLAYER_SIZE - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        // only push the player; enemy keeps advancing
        p.x += nx * overlap;
        p.y += ny * overlap;
        p.x = Math.max(16, Math.min(1984, p.x));
        p.y = Math.max(16, Math.min(1984, p.y));
      }
    });
  });

  // broadcast enemy positions
  if (enemyList.length > 0) {
    io.emit("enemiesMoved", enemyList.map(e => ({
      id: e.id, x: e.x, y: e.y
    })));
  }
}, TICK_RATE);

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  players[socket.id] = {
    x: 200 + Math.floor(Math.random() * 600),
    y: 200 + Math.floor(Math.random() * 600),
    id: socket.id,
    name: "Player",
    angle: 0,
    inputs: { up: false, down: false, left: false, right: false }
  };

  socket.emit("currentPlayers", players);

  // send existing enemies to the newly connected player
  Object.values(enemies).forEach((e) => {
    socket.emit("enemySpawned", e);
  });

  socket.broadcast.emit("newPlayer", players[socket.id]);

  socket.on("setName", (name) => {
    if (players[socket.id]) {
      players[socket.id].name = name;
      socket.broadcast.emit("playerNamed", { id: socket.id, name: name });
    }
  });

  socket.on("inputs", (data) => {
    if (players[socket.id]) {
      players[socket.id].inputs = data;
    }
  });

  socket.on("rotate", (data) => {
    if (players[socket.id]) {
      players[socket.id].angle = data.angle;
      socket.broadcast.emit("playerRotated", { id: socket.id, angle: data.angle });
    }
  });

  socket.on("chat", (data) => {
    io.emit("chatMessage", { id: socket.id, name: players[socket.id]?.name || "Player", message: data.message });
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("playerLeft", socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log("Game server running on port " + PORT);
});

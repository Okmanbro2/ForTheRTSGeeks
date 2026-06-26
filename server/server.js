const http = require("http");
const { Server } = require("socket.io");
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────
//  notes to self:
//    enemy   : which team(s) this team is hostile to (array)
//    color   : hex color used by clients for rendering
// ─────────────────────────────────────────────
const TEAMS = {
  havatica: {
    enemies: ["worstendom"],
    color: "#c9a0f0"          // light purple
  },
  worstendom: {
    enemies: ["havatica"],
    color: "#777777"          // dark gray (visible on green map)
  }
};

// are we Enemies yes or no
function areHostile(teamA, teamB) {
  if (!teamA || !teamB) return false;
  const def = TEAMS[teamA];
  return def ? def.enemies.includes(teamB) : false;
}

const httpServer = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Game server is running!");
});

const io = new Server(httpServer, {
  cors: { origin: "*" }
});

const players = {};
const SPEED             = 3;
const ENEMY_SPEED       = 1.2;
const ENEMY_SIZE        = 28;   // enemy-enemy collision diameter
const ENEMY_PLAYER_SIZE = 30;   // enemy-player collision diameter
const MAX_NPCS       = 4;
const TICK_RATE         = 1000 / 60;

let gameClock = 1500; // 25 mins

const enemies = {};
let enemyIdCounter = 0;

function getNearestHostilePlayer(enemy) {
  let nearest     = null;
  let nearestDist = Infinity;

  Object.values(players).forEach((p) => {
    if (!areHostile(enemy.team, p.team)) return; // skip friendlies / neutral
    const dx   = p.x - enemy.x;
    const dy   = p.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest     = p;
    }
  });

  return nearest;
}

const teamNames = Object.keys(TEAMS);

function spawnEnemy() {
  if (Object.keys(enemies).length >= MAX_NPCS) return;

  const id   = "e_" + enemyIdCounter++;
  const side = Math.floor(Math.random() * 4);
  let x, y;

  if (side === 0)      { x = Math.random() * 2000; y = 16;   }
  else if (side === 1) { x = Math.random() * 2000; y = 1984; }
  else if (side === 2) { x = 16;   y = Math.random() * 2000; }
  else                 { x = 1984; y = Math.random() * 2000; }

  // alt teams
  const team = teamNames[enemyIdCounter % teamNames.length];

  enemies[id] = { id, x, y, targetId: null, team, hp: 100, maxHp: 100, wanderAngle: Math.random() * Math.PI * 2 };
  io.emit("enemySpawned", enemies[id]);
}

setInterval(spawnEnemy, 4000);

// retargeting
setInterval(() => {
  Object.values(enemies).forEach((e) => {
    const nearest = getNearestHostilePlayer(e);
    e.targetId    = nearest ? nearest.id : null;
  });
}, 1000);

// game clock
setInterval(() => {
  gameClock--;
  if (gameClock <= 0) gameClock = 1500;

  const minutes = Math.floor(gameClock / 60);
  const seconds = gameClock % 60;
  io.emit("gameTick", { minutes, seconds });
}, 1000);

// other
setInterval(() => {
  const playerList = Object.values(players);
  const enemyList  = Object.values(enemies);

  // mooooove
  playerList.forEach((p) => {
    if (p.inputs.up)    p.y = Math.max(16, p.y - SPEED);
    if (p.inputs.down)  p.y = Math.min(1984, p.y + SPEED);
    if (p.inputs.left)  p.x = Math.max(16, p.x - SPEED);
    if (p.inputs.right) p.x = Math.min(1984, p.x + SPEED);
  });

  // pvp collisions
  const PLAYER_MIN_DIST = 32;
  for (let i = 0; i < playerList.length; i++) {
    for (let j = i + 1; j < playerList.length; j++) {
      const a  = playerList[i];
      const b  = playerList[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PLAYER_MIN_DIST && dist > 0) {
        const overlap = (PLAYER_MIN_DIST - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * overlap;  a.y -= ny * overlap;
        b.x += nx * overlap;  b.y += ny * overlap;
        a.x = Math.max(16, Math.min(1984, a.x));
        a.y = Math.max(16, Math.min(1984, a.y));
        b.x = Math.max(16, Math.min(1984, b.x));
        b.y = Math.max(16, Math.min(1984, b.y));
      }
    }
  }

  // broadcast player positions
  playerList.forEach((p) => {
    io.emit("playerMoved", { id: p.id, x: p.x, y: p.y, name: p.name, angle: p.angle, team: p.team });
  });

  // move chuds
   enemyList.forEach((e) => {
  const target = e.targetId ? players[e.targetId] : null;

  if (target) {
    // chase hostile player
    const dx   = target.x - e.x;
    const dy   = target.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 2) {
      e.x += (dx / dist) * ENEMY_SPEED;
      e.y += (dy / dist) * ENEMY_SPEED;
    }
  } else {
    // wander
    if (!e.wanderAngle || Math.random() < 0.01) {
        e.wanderAngle = Math.random() * Math.PI * 2;
      }
      e.x += Math.cos(e.wanderAngle) * ENEMY_SPEED;
      e.y += Math.sin(e.wanderAngle) * ENEMY_SPEED;

    // bounce off walls instead of clamping so they don't pile up at edges
      if (e.x < 16 || e.x > 1984) {
        e.wanderAngle = Math.PI - e.wanderAngle;
        e.x = Math.max(16, Math.min(1984, e.x));
      }
      if (e.y < 16 || e.y > 1984) {
        e.wanderAngle = -e.wanderAngle;
        e.y = Math.max(16, Math.min(1984, e.y));
      }
    }

    e.x = Math.max(16, Math.min(1984, e.x));
    e.y = Math.max(16, Math.min(1984, e.y));
  });

  // eve collision
  for (let i = 0; i < enemyList.length; i++) {
    for (let j = i + 1; j < enemyList.length; j++) {
      const a  = enemyList[i];
      const b  = enemyList[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < ENEMY_SIZE && dist > 0) {
        const overlap = (ENEMY_SIZE - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * overlap;  a.y -= ny * overlap;
        b.x += nx * overlap;  b.y += ny * overlap;
        a.x = Math.max(16, Math.min(1984, a.x));
        a.y = Math.max(16, Math.min(1984, a.y));
        b.x = Math.max(16, Math.min(1984, b.x));
        b.y = Math.max(16, Math.min(1984, b.y));
      }
    }
  }

  // pve collision
  enemyList.forEach((e) => {
    playerList.forEach((p) => {
      const dx   = p.x - e.x;
      const dy   = p.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < ENEMY_PLAYER_SIZE && dist > 0) {
        const overlap = ENEMY_PLAYER_SIZE - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        p.x += nx * overlap;
        p.y += ny * overlap;
        p.x = Math.max(16, Math.min(1984, p.x));
        p.y = Math.max(16, Math.min(1984, p.y));
      }
    });
  });

  // broadcast enemy positions and team so clients render the right color
  if (enemyList.length > 0) {
    io.emit("enemiesMoved", enemyList.map(e => ({
      id: e.id, x: e.x, y: e.y, team: e.team
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
    team: null, // set by "setTeam" event on join
    angle: 0,
    inputs: { up: false, down: false, left: false, right: false }
  };

  socket.emit("currentPlayers", players);
  Object.values(enemies).forEach((e) => socket.emit("enemySpawned", e));
  socket.emit("gameTick", { // send current time immediately on join
    minutes: Math.floor(gameClock / 60),
    seconds: gameClock % 60
  });
  socket.broadcast.emit("newPlayer", players[socket.id]);

  socket.on("setName", (name) => {
    if (players[socket.id]) {
      players[socket.id].name = name;
      socket.broadcast.emit("playerNamed", { id: socket.id, name });
    }
  });

  socket.on("setTeam", (team) => {
    if (players[socket.id] && TEAMS[team]) {
      players[socket.id].team = team;
      // tell everyone (including sender) so leaderboard updates
      io.emit("playerTeamed", { id: socket.id, team });
    }
  });

  socket.on("inputs", (data) => {
    if (players[socket.id]) players[socket.id].inputs = data;
  });

  socket.on("rotate", (data) => {
    if (players[socket.id]) {
      players[socket.id].angle = data.angle;
      socket.broadcast.emit("playerRotated", { id: socket.id, angle: data.angle });
    }
  });

  socket.on("chat", (data) => {
    io.emit("chatMessage", {
      id: socket.id,
      name: players[socket.id]?.name || "Player",
      team: players[socket.id]?.team || null,
      message: data.message
    });
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("playerLeft", socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log("Game server running on port " + PORT);
});

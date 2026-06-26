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
const TICK_RATE = 1000 / 60; // 60 times per second

// server looooop
setInterval(() => {
  const playerList = Object.values(players);

  // mooooove
  playerList.forEach((p) => {
    if (p.inputs.up)    p.y = Math.max(16, p.y - SPEED);
    if (p.inputs.down)  p.y = Math.min(1984, p.y + SPEED);
    if (p.inputs.left)  p.x = Math.max(16, p.x - SPEED);
    if (p.inputs.right) p.x = Math.min(1984, p.x + SPEED);
  });

  // pvp collision
  const MIN_DIST = 32;
  for (let i = 0; i < playerList.length; i++) {
    for (let j = i + 1; j < playerList.length; j++) {
      const a = playerList[i];
      const b = playerList[j];

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < MIN_DIST && dist > 0) {
        const overlap = (MIN_DIST - dist) / 2;
        const nx = dx / dist; // normalized direction
        const ny = dy / dist;

        // puuush
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        // keep in bounds
        a.x = Math.max(16, Math.min(1984, a.x));
        a.y = Math.max(16, Math.min(1984, a.y));
        b.x = Math.max(16, Math.min(1984, b.x));
        b.y = Math.max(16, Math.min(1984, b.y));
      }
    }
  }

  // live pos
  playerList.forEach((p) => {
    io.emit("playerMoved", { id: p.id, x: p.x, y: p.y, name: p.name, angle: p.angle });
  });

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

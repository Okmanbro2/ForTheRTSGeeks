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
  Object.values(players).forEach((p) => {
    let moved = false;
    if (p.inputs.up)    { p.y = Math.max(16, p.y - SPEED); moved = true; }
    if (p.inputs.down)  { p.y = Math.min(1984, p.y + SPEED); moved = true; }
    if (p.inputs.left)  { p.x = Math.max(16, p.x - SPEED); moved = true; }
    if (p.inputs.right) { p.x = Math.min(1984, p.x + SPEED); moved = true; }

    if (moved) {
      io.emit("playerMoved", { id: p.id, x: p.x, y: p.y, name: p.name, angle: p.angle });
    }
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

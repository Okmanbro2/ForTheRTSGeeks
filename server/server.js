const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;

const io = new Server(PORT, {
  cors: { origin: "*" }
});

const players = {};

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  players[socket.id] = {
  x: 200 + Math.floor(Math.random() * 600),
  y: 200 + Math.floor(Math.random() * 600),
  id: socket.id,
  name: "Player"
};

  socket.emit("currentPlayers", players);
  socket.broadcast.emit("newPlayer", players[socket.id]);

  socket.on("setName", (name) => {
    if (players[socket.id]) {
      players[socket.id].name = name;
    }
  });

  socket.on("move", (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      socket.broadcast.emit("playerMoved", { id: socket.id, x: data.x, y: data.y });
    }
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("playerLeft", socket.id);
  });
});

console.log("Game server running on port 3000");

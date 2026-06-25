const { Server } = require("socket.io");

const io = new Server(3000, {
  cors: { origin: "*" }
});

const players = {};

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // stupid join handler
  players[socket.id] = { x: 400, y: 300, id: socket.id };

  // state sending shit
  socket.emit("currentPlayers", players);

  // spread Miss Information
  socket.broadcast.emit("newPlayer", players[socket.id]);

  // movement
  socket.on("move", (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      socket.broadcast.emit("playerMoved", { id: socket.id, x: data.x, y: data.y });
    }
  });

  // Goodbye Bro
  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    delete players[socket.id];
    io.emit("playerLeft", socket.id);
  });
});

console.log("Game server running on port 3000");

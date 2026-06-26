const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;

// http
const httpServer = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Game server is running!");
});

const io = new Server(httpServer, {
  cors: { origin: "*" }
});

const players = {};

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // player
  players[socket.id] = {
    x: 200 + Math.floor(Math.random() * 600),
    y: 200 + Math.floor(Math.random() * 600),
    id: socket.id,
    name: null
  };

  // ingame people
  socket.emit("currentPlayers", players);

  // name
  socket.on("setName", (name) => {
    if (!players[socket.id]) return;

    players[socket.id].name = name;

    // tell the world that this player is now fully initialized
    io.emit("newPlayer", players[socket.id]);
  });

  socket.on("move", (data) => {
    if (!players[socket.id]) return;

    players[socket.id].x = data.x;
    players[socket.id].y = data.y;

    socket.broadcast.emit("playerMoved", {
      id: socket.id,
      x: data.x,
      y: data.y
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

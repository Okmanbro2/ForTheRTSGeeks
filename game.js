function dbg(msg) {
  const log = document.getElementById("debugLog");
  if (log) log.innerHTML += msg + "<br>";
}

const joinBtn = document.getElementById("joinBtn");
const nameInput = document.getElementById("nameInput");
const nameScreen = document.getElementById("nameScreen");
const gameContainer = document.getElementById("gameContainer");

const SERVER_URL = "https://forthertsgeeks-production.up.railway.app";

joinBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) { nameInput.placeholder = "Please enter a name!"; return; }
  nameScreen.style.display = "none";
  gameContainer.style.display = "block";
  startGame(name);
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinBtn.click();
});

function startGame(playerName) {

  class GameScene extends Phaser.Scene {
    constructor() { super("GameScene"); }

    create() {
      this.otherPlayers = {};
      this.myPlayer = null;
      this.myLabel = null;

      this.add.rectangle(0, 0, 2000, 2000, 0x3a7d44).setOrigin(0, 0);

      const grid = this.add.graphics();
      grid.lineStyle(1, 0x2d6b38, 0.4);
      for (let x = 0; x < 2000; x += 64) grid.moveTo(x, 0).lineTo(x, 2000);
      for (let y = 0; y < 2000; y += 64) grid.moveTo(0, y).lineTo(2000, y);
      grid.strokePath();

      this.cameras.main.setBounds(0, 0, 2000, 2000);

      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D
      });

      // connect after scene ready king
      this.socket = io(SERVER_URL);
      dbg("Socket created");

      this.socket.on("connect", () => {
        this.socket.emit("setName", playerName);
        dbg("Connected! ID: " + this.socket.id);
      });

      this.socket.on("currentPlayers", (players) => {
        dbg("Got currentPlayers: " + Object.keys(players).length + " players");
        Object.values(players).forEach((p) => {
          if (p.id === this.socket.id) this.spawnMe(p);
          else this.spawnOther(p);
        });
      });

      this.socket.on("newPlayer", (p) => {
        this.spawnOther(p);
      });

      this.socket.on("playerNamed", (data) => {
        const other = this.otherPlayers[data.id];
        if (other) {
          other.label.setText(data.name);
        }
      });

      this.socket.on("playerMoved", (data) => {
        const other = this.otherPlayers[data.id];
        if (other) {
          other.body.setPosition(data.x, data.y);
          other.label.setPosition(data.x, data.y - 28);
        }
      });

      this.socket.on("playerLeft", (id) => {
        if (this.otherPlayers[id]) {
          this.otherPlayers[id].label.destroy();
          this.otherPlayers[id].body.destroy();
          delete this.otherPlayers[id];
        }
      });
    }

    spawnMe(p) {
      dbg("spawnMe called at " + p.x + "," + p.y);
      this.myPlayer = this.add.rectangle(p.x, p.y, 32, 32, 0x4fc3f7);
      this.myLabel = this.add.text(p.x, p.y - 28, playerName, {
        fontSize: "13px", color: "#ffffff",
        stroke: "#000000", strokeThickness: 3
      }).setOrigin(0.5);
      this.cameras.main.startFollow(this.myPlayer, true, 0.1, 0.1);
    }

    spawnOther(p) {
      const body = this.add.rectangle(p.x, p.y, 32, 32, 0xef5350);
      const label = this.add.text(p.x, p.y - 28, p.name, {
        fontSize: "13px", color: "#ffffff",
        stroke: "#000000", strokeThickness: 3
      }).setOrigin(0.5);
      this.otherPlayers[p.id] = { body, label };

      this.time.delayedCall(200, () => {
        if (this.otherPlayers[p.id] && p.name && p.name !== "Player") {
          this.otherPlayers[p.id].label.setText(p.name);
        }
      });
    }

    update() {
      if (!this.myPlayer) return;

      const speed = 3;
      let dx = 0, dy = 0;
      let moved = false;

      if (this.cursors.left.isDown  || this.wasd.left.isDown)  { dx = -speed; moved = true; }
      if (this.cursors.right.isDown || this.wasd.right.isDown) { dx =  speed; moved = true; }
      if (this.cursors.up.isDown    || this.wasd.up.isDown)    { dy = -speed; moved = true; }
      if (this.cursors.down.isDown  || this.wasd.down.isDown)  { dy =  speed; moved = true; }

      if (moved) {
        this.myPlayer.x += dx;
        this.myPlayer.y += dy;
        this.myLabel.setPosition(this.myPlayer.x, this.myPlayer.y - 28);
        this.socket.emit("move", { x: this.myPlayer.x, y: this.myPlayer.y });
      }
    }
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: "#1a1a2e",
    parent: "gameContainer",
    scene: GameScene
  });
}

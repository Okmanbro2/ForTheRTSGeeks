const joinBtn = document.getElementById("joinBtn");
const nameInput = document.getElementById("nameInput");
const nameScreen = document.getElementById("nameScreen");
const gameContainer = document.getElementById("gameContainer");

const SERVER_URL = "https://forthertsgeeks-production.up.railway.app/";

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
  const socket = io(SERVER_URL);

  class GameScene extends Phaser.Scene {
    constructor() { super("GameScene"); }

    create() {
      this.otherPlayers = {};
      this.myPlayer = null;
      this.myLabel = null;

      // simple background for now
      this.add.rectangle(0, 0, 2000, 2000, 0x3a7d44).setOrigin(0, 0);

      // honestly i just did this for whatever
      const grid = this.add.graphics();
      grid.lineStyle(1, 0x2d6b38, 0.4);
      for (let x = 0; x < 2000; x += 64) grid.moveTo(x, 0).lineTo(x, 2000);
      for (let y = 0; y < 2000; y += 64) grid.moveTo(0, y).lineTo(2000, y);
      grid.strokePath();

      // cam
      this.cameras.main.setBounds(0, 0, 2000, 2000);

      // controls
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D
      });

      // socket things

      socket.on("currentPlayers", (players) => {
        Object.values(players).forEach((p) => {
          if (p.id === socket.id) this.spawnMe(p);
          else this.spawnOther(p);
        });
      });

      socket.on("newPlayer", (p) => this.spawnOther(p));

      socket.on("playerMoved", (data) => {
        const other = this.otherPlayers[data.id];
        if (other) {
          other.body.setPosition(data.x, data.y);
          other.label.setPosition(data.x, data.y - 28);
        }
      });

      socket.on("playerLeft", (id) => {
        if (this.otherPlayers[id]) {
          this.otherPlayers[id].label.destroy();
          this.otherPlayers[id].body.destroy();
          delete this.otherPlayers[id];
        }
      });
    }

    spawnMe(p) {
      this.myPlayer = this.add.rectangle(p.x, p.y, 32, 32, 0x4fc3f7);
      this.myLabel = this.add.text(p.x, p.y - 28, playerName, {
        fontSize: "13px", color: "#ffffff",
        stroke: "#000000", strokeThickness: 3
      }).setOrigin(0.5);
      this.cameras.main.startFollow(this.myPlayer, true, 0.1, 0.1);
    }

    spawnOther(p) {
      const body = this.add.rectangle(p.x, p.y, 32, 32, 0xef5350);
      const label = this.add.text(p.x, p.y - 28, p.name || "Player", {
        fontSize: "13px", color: "#ffffff",
        stroke: "#000000", strokeThickness: 3
      }).setOrigin(0.5);
      this.otherPlayers[p.id] = { body, label };
    }

    update() {
      if (!this.myPlayer) return;

      const speed = 3;
      let moved = false;
      let dx = 0, dy = 0;

      if (this.cursors.left.isDown  || this.wasd.left.isDown)  { dx = -speed; moved = true; }
      if (this.cursors.right.isDown || this.wasd.right.isDown) { dx =  speed; moved = true; }
      if (this.cursors.up.isDown    || this.wasd.up.isDown)    { dy = -speed; moved = true; }
      if (this.cursors.down.isDown  || this.wasd.down.isDown)  { dy =  speed; moved = true; }

      if (moved) {
        this.myPlayer.x += dx;
        this.myPlayer.y += dy;
        this.myLabel.setPosition(this.myPlayer.x, this.myPlayer.y - 28);
        socket.emit("move", { x: this.myPlayer.x, y: this.myPlayer.y });
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

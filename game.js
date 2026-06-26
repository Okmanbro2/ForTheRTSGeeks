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
      this.input.keyboard.disableGlobalCapture();

      // only after scene ready yo
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

      this.socket.on("newPlayer", (p) => this.spawnOther(p));

      this.socket.on("playerNamed", (data) => {
        dbg("playerNamed: " + data.id + " = " + data.name);
        const other = this.otherPlayers[data.id];
        dbg("other exists: " + !!other);
        if (other) other.label.setText(data.name);
      });

     this.socket.on("playerMoved", (data) => {
        const other = this.otherPlayers[data.id];
        if (other) {
          other.body.setPosition(data.x, data.y);
          other.label.setPosition(data.x, data.y - 28);
          if (data.name) other.label.setText(data.name);
        }
      });

      this.socket.on("playerRotated", (data) => {
        const other = this.otherPlayers[data.id];
        if (other) other.body.setRotation(data.angle);
      });

      this.socket.on("playerLeft", (id) => {
        if (this.otherPlayers[id]) {
          this.otherPlayers[id].label.destroy();
          this.otherPlayers[id].body.destroy();
          delete this.otherPlayers[id];
        }
      });

      this.chatInput = document.createElement("input");
      this.chatInput.type = "text";
      this.chatInput.maxLength = 64;
      this.chatInput.style.cssText = `
        position: fixed; bottom: 40px; left: 50%;
        transform: translateX(-50%);
        width: 400px; padding: 8px 12px;
        background: rgba(0,0,0,0.7); color: white;
        border: 2px solid rgba(255,255,255,0.4);
        border-radius: 6px; font-size: 14px;
        display: none; outline: none; z-index: 999;
      `;
      document.body.appendChild(this.chatInput);
      this.chatOpen = false;

      this.chatLog = document.createElement("div");
      this.chatLog.style.cssText = `
        position: fixed; bottom: 70px; left: 20px;
        width: 320px; pointer-events: none;
        z-index: 999; display: flex;
        flex-direction: column; gap: 2px;
        justify-content: flex-end;
      `;
      document.body.appendChild(this.chatLog);

      this.input.keyboard.on("keydown-T", (event) => {
        if (!this.chatOpen) {
          this.chatOpen = true;
          this.chatInput.style.display = "block";
          this.chatInput.value = "";
          setTimeout(() => this.chatInput.focus(), 10);
          event.preventDefault();
        }
      });

      this.chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const msg = this.chatInput.value.trim();
          if (msg) this.socket.emit("chat", { message: msg });
          this.chatInput.style.display = "none";
          this.chatInput.value = "";
          this.chatOpen = false;
        }
        if (e.key === "Escape") {
          this.chatInput.style.display = "none";
          this.chatOpen = false;
        }
      });

      this.socket.on("chatMessage", (data) => {
        this.showChatBubble(data.id, data.message);
        this.addChatLog(data.name, data.message);
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
      if (p.angle) body.setRotation(p.angle);
      const label = this.add.text(p.x, p.y - 28, p.name || "Player", {
        fontSize: "13px", color: "#ffffff",
        stroke: "#000000", strokeThickness: 3
      }).setOrigin(0.5);
      this.otherPlayers[p.id] = { body, label };
    }

   showChatBubble(id, message) {
      const isMe = this.socket && id === this.socket.id;
      const target = isMe ? this.myPlayer : (this.otherPlayers[id] ? this.otherPlayers[id].body : null);
      if (!target) return;

      if (!target.chatBubbles) target.chatBubbles = [];

      const bubble = this.add.text(target.x, target.y - 50, message, {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#00000099",
        padding: { x: 8, y: 5 },
        borderRadius: 8,
        shadow: { offsetX: 1, offsetY: 1, color: "#000", blur: 4, fill: true }
      }).setOrigin(0.5).setDepth(10);

      target.chatBubbles.push(bubble);

      this.time.delayedCall(3500, () => {
        bubble.destroy();
        if (target.chatBubbles) {
          target.chatBubbles = target.chatBubbles.filter(b => b !== bubble);
        }
      });
    }

    addChatLog(name, message) {
      const line = document.createElement("div");
      line.style.cssText = `
        background: rgba(0,0,0,0.6);
        color: white; font-size: 13px;
        font-family: Arial, sans-serif;
        padding: 3px 8px; border-radius: 4px;
      `;
      line.innerHTML = `<span style="color:#4fc3f7">${name}</span>: ${message}`;
      this.chatLog.appendChild(line);

      setTimeout(() => line.remove(), 8000);

      while (this.chatLog.children.length > 6) {
        this.chatLog.removeChild(this.chatLog.firstChild);
      }
    }

    update() {
      if (!this.myPlayer) return;
      if (this.chatOpen) return;
      
      if (this.myPlayer) {
        const pointer = this.input.activePointer;
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const angle = Phaser.Math.Angle.Between(
          this.myPlayer.x, this.myPlayer.y,
          worldPoint.x, worldPoint.y
        );
        this.myPlayer.setRotation(angle + Math.PI / 2);
        this.socket.emit("rotate", { angle: angle + Math.PI / 2 });
      }

      const speed = 3;
      let dx = 0, dy = 0;
      let moved = false;

      if (this.cursors.left.isDown  || this.wasd.left.isDown)  { dx = -speed; moved = true; }
      if (this.cursors.right.isDown || this.wasd.right.isDown) { dx =  speed; moved = true; }
      if (this.cursors.up.isDown    || this.wasd.up.isDown)    { dy = -speed; moved = true; }
      if (this.cursors.down.isDown  || this.wasd.down.isDown)  { dy =  speed; moved = true; }

      if (moved) {
        const newX = Phaser.Math.Clamp(this.myPlayer.x + dx, 16, 2000 - 16);
        const newY = Phaser.Math.Clamp(this.myPlayer.y + dy, 16, 2000 - 16);
        this.myPlayer.x = newX;
        this.myPlayer.y = newY;
        this.myLabel.setPosition(this.myPlayer.x, this.myPlayer.y - 28);
        this.socket.emit("move", { x: this.myPlayer.x, y: this.myPlayer.y });
      }

      if (this.myPlayer && this.myPlayer.chatBubbles) {
        this.myPlayer.chatBubbles.forEach((bubble, i) => {
          bubble.setPosition(this.myPlayer.x, this.myPlayer.y - 55 - (i * 26));
        });
      }

      Object.values(this.otherPlayers).forEach((p) => {
        if (p.body.chatBubbles) {
          p.body.chatBubbles.forEach((bubble, i) => {
            bubble.setPosition(p.body.x, p.body.y - 55 - (i * 26));
          });
        }
      });
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

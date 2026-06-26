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
      this.cameras.main.setBackgroundColor(0x3a7d44);

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
        this.myName = playerName;
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
        this.updatePlayerList();
      });

      this.socket.on("playerNamed", (data) => {
        dbg("playerNamed: " + data.id + " = " + data.name);
        const other = this.otherPlayers[data.id];
        dbg("other exists: " + !!other);
        if (other) other.label.setText(data.name);
      });

     this.socket.on("playerMoved", (data) => {
        if (data.id === this.socket.id) {
          if (this.myPlayer) {
            this.myPlayer.x = data.x;
            this.myPlayer.y = data.y;
            this.myLabel.setPosition(data.x, data.y - 28);
          }
        } else {
          const other = this.otherPlayers[data.id];
          if (other) {
            other.body.setPosition(data.x, data.y);
            other.label.setPosition(data.x, data.y - 28);
            if (data.name) other.label.setText(data.name);
          }
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
          this.updatePlayerList();
        }
      });

      this.chatInput = document.createElement("input");
      this.chatInput.type = "text";
      this.chatInput.maxLength = 64;
      this.chatInput.style.cssText = `
        position: fixed; bottom: 16px; left: calc(50% - 310px);
        transform: translateX(-50%);
        width: 280px; padding: 8px 12px;
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

      this.playerListDiv = document.createElement("div");
      this.playerListDiv.style.cssText = `
        position: fixed; top: 10px; right: 10px;
        background: rgba(0,0,0,0.5);
        border-radius: 8px; padding: 8px 14px;
        min-width: 160px; max-height: 300px;
        overflow-y: auto; z-index: 999;
        pointer-events: none;
        font-family: Arial, sans-serif;
      `;
      document.body.appendChild(this.playerListDiv);
      this.updatePlayerList();

      this.selectedSlot = 0;
      this.inventoryDiv = document.createElement("div");
      this.inventoryDiv.style.cssText = `
        position: fixed; bottom: 16px; left: 50%;
        transform: translateX(-50%);
        display: flex; gap: 6px;
        z-index: 999;
      `;
      document.body.appendChild(this.inventoryDiv);

      this.inventorySlots = [];
      for (let i = 0; i < 5; i++) {
        const slot = document.createElement("div");
        slot.style.cssText = `
          width: 56px; height: 56px;
          background: rgba(40,40,40,0.7);
          border: 2px solid ${i === 0 ? "#4fc3f7" : "rgba(255,255,255,0.15)"};
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.3);
          font-size: 11px; font-family: Arial, sans-serif;
          box-sizing: border-box;
        `;
        slot.textContent = i + 1;
        this.inventoryDiv.appendChild(slot);
        this.inventorySlots.push(slot);
      }

      document.addEventListener("keydown", (e) => {
        const slots = ["1","2","3","4","5"];
        const idx = slots.indexOf(e.key);
        if (idx !== -1 && !this.chatOpen) this.selectSlot(idx);
      });
      }
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

    updatePlayerList() {
      if (!this.playerListDiv) return;
      this.playerListDiv.innerHTML = "";

      const myEntry = document.createElement("div");
      myEntry.style.cssText = `
        color: #4fc3f7; font-size: 13px;
        padding: 2px 0; font-weight: bold;
      `;
      myEntry.textContent = "▶ " + (this.myName || "You");
      this.playerListDiv.appendChild(myEntry);

      Object.values(this.otherPlayers).forEach((p) => {
        const entry = document.createElement("div");
        entry.style.cssText = `
          color: #ffffff; font-size: 13px; padding: 2px 0;
        `;
        entry.textContent = p.label.text || "Player";
        this.playerListDiv.appendChild(entry);
      });
    }

    selectSlot(index) {
      if (!this.inventorySlots) return;
      this.inventorySlots[this.selectedSlot].style.border = "2px solid rgba(255,255,255,0.15)";
      this.selectedSlot = index;
      this.inventorySlots[this.selectedSlot].style.border = "2px solid #4fc3f7";
    }

    update() {
      if (!this.myPlayer) return;

      const inputs = {
        up:    this.cursors.up.isDown    || this.wasd.up.isDown,
        down:  this.cursors.down.isDown  || this.wasd.down.isDown,
        left:  this.cursors.left.isDown  || this.wasd.left.isDown,
        right: this.cursors.right.isDown || this.wasd.right.isDown
      };

      if (!this.chatOpen) {
        this.socket.emit("inputs", inputs);

        const pointer = this.input.activePointer;
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const angle = Phaser.Math.Angle.Between(
          this.myPlayer.x, this.myPlayer.y,
          worldPoint.x, worldPoint.y
        );
        this.myPlayer.setRotation(angle + Math.PI / 2);
        this.socket.emit("rotate", { angle: angle + Math.PI / 2 });
      }

      if (this.myPlayer.chatBubbles) {
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

      if (!this.lastListUpdate) this.lastListUpdate = 0;
      if (this.time.now - this.lastListUpdate > 2000) {
        this.updatePlayerList();
        this.lastListUpdate = this.time.now;
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

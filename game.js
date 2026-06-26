// ─────────────────────────────────────────────
//  note to self add team colors for new teams
// ─────────────────────────────────────────────
const TEAM_COLORS = {
  havatica:   { hex: 0xc9a0f0, css: "#c9a0f0" },
  worstendom: { hex: 0x777777, css: "#777777" }
};

function teamHex(team) { return TEAM_COLORS[team]?.hex ?? 0xaaaaaa; }
function teamCss(team) { return TEAM_COLORS[team]?.css ?? "#aaaaaa"; }

// ─────────────────────────────────────────────

function dbg(msg) {
  const log = document.getElementById("debugLog");
  if (log) log.innerHTML += msg + "<br>";
}

const SERVER_URL = "https://forthertsgeeks-production.up.railway.app";

// startGame is called by index.html after the player picks name + team
function startGame(playerName, playerTeam) {

  class GameScene extends Phaser.Scene {
    constructor() { super("GameScene"); }

    create() {
      this.otherPlayers = {};
      this.myPlayer     = null;
      this.myLabel      = null;
      this.myTeam       = playerTeam;

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
        up:    Phaser.Input.Keyboard.KeyCodes.W,
        down:  Phaser.Input.Keyboard.KeyCodes.S,
        left:  Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D
      });
      this.input.keyboard.disableGlobalCapture();

      this.socket = io(SERVER_URL);
      dbg("Socket created");

      this.socket.on("connect", () => {
        this.myName = playerName;
        this.socket.emit("setName", playerName);
        this.socket.emit("setTeam", playerTeam);
        dbg("Connected! ID: " + this.socket.id + " | Team: " + playerTeam);
      });

      this.socket.on("currentPlayers", (players) => {
        dbg("Got currentPlayers: " + Object.keys(players).length);
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
        const other = this.otherPlayers[data.id];
        if (other) other.label.setText(data.name);
      });

      // Server now includes team in every playerMoved broadcast
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

      // update body/label colour when a player's team is confirmed
      this.socket.on("playerTeamed", (data) => {
        if (data.id === this.socket.id) {
          if (this.myPlayer) this.myPlayer.setFillStyle(teamHex(data.team));
          this.myTeam = data.team;
        } else {
          const other = this.otherPlayers[data.id];
          if (other) {
            other.body.setFillStyle(teamHex(data.team));
            other.label.setColor(teamCss(data.team));
            other.team = data.team;
          }
        }
        this.updatePlayerList();
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

      // chat
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
        this.addChatLog(data.name, data.team, data.message);
      });

      // npcs
      this.enemies = {};

      this.socket.on("enemySpawned", (e) => {
        const color = teamHex(e.team);
        const body  = this.add.rectangle(e.x, e.y, 28, 28, color);
        // Dim the enemy slightly so it reads as NPC not player
        body.setAlpha(0.75);
        const label = this.add.text(e.x, e.y - 22, "NPC", {
          fontSize: "10px", color: teamCss(e.team),
          stroke: "#000", strokeThickness: 2
        }).setOrigin(0.5);
        this.enemies[e.id] = { body, label, team: e.team };
      });

      this.socket.on("enemiesMoved", (list) => {
        list.forEach((e) => {
          const obj = this.enemies[e.id];
          if (!obj) return;
          obj.body.setPosition(e.x, e.y);
          obj.label.setPosition(e.x, e.y - 22);
          // Update color if team changed (future-proofing)
          if (e.team && e.team !== obj.team) {
            obj.body.setFillStyle(teamHex(e.team));
            obj.label.setColor(teamCss(e.team));
            obj.team = e.team;
          }
        });
      });

      this.socket.on("enemyLeft", (id) => {
        if (this.enemies[id]) {
          this.enemies[id].body.destroy();
          this.enemies[id].label.destroy();
          delete this.enemies[id];
        }
      });

      // leaderboard
      this.playerListDiv = document.createElement("div");
      this.playerListDiv.style.cssText = `
        position: fixed; top: 10px; right: 10px;
        background: rgba(0,0,0,0.5);
        border-radius: 8px; padding: 8px 14px;
        min-width: 180px; max-height: 300px;
        overflow-y: auto; z-index: 999;
        pointer-events: none;
        font-family: Arial, sans-serif;
      `;
      document.body.appendChild(this.playerListDiv);
      this.updatePlayerList();

      // inventory ui
      this.selectedSlot = -1;
      this.inventoryDiv = document.createElement("div");
      this.inventoryDiv.style.cssText = `
        position: fixed; bottom: 16px; left: 50%;
        transform: translateX(-50%);
        display: flex; gap: 6px; z-index: 999;
      `;
      document.body.appendChild(this.inventoryDiv);

      this.inventorySlots = [];
      for (let i = 0; i < 5; i++) {
        const slot = document.createElement("div");
        slot.style.cssText = `
          width: 56px; height: 56px;
          background: rgba(40,40,40,0.7);
          border: 3px solid rgba(255,255,255,0.15);
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          box-sizing: border-box; cursor: pointer; pointer-events: all;
          transition: border-color 0.1s;
        `;
        slot.addEventListener("click", () => {
          this.selectSlot(this.selectedSlot === i ? -1 : i);
        });
        this.inventoryDiv.appendChild(slot);
        this.inventorySlots.push(slot);
      }

      document.addEventListener("keydown", (e) => {
        const idx = ["1","2","3","4","5"].indexOf(e.key);
        if (idx !== -1 && !this.chatOpen) {
          this.selectSlot(this.selectedSlot === idx ? -1 : idx);
        }
      });
    }

    // spawning

    spawnMe(p) {
      dbg("spawnMe at " + p.x + "," + p.y + " team=" + playerTeam);
      this.myPlayer = this.add.rectangle(p.x, p.y, 32, 32, teamHex(playerTeam));
      this.myLabel  = this.add.text(p.x, p.y - 28, playerName, {
        fontSize: "13px", color: teamCss(playerTeam),
        stroke: "#000000", strokeThickness: 3
      }).setOrigin(0.5);
      this.cameras.main.startFollow(this.myPlayer, true, 0.1, 0.1);
    }

    spawnOther(p) {
      const color = teamHex(p.team);
      const css   = teamCss(p.team);
      const body  = this.add.rectangle(p.x, p.y, 32, 32, color);
      if (p.angle) body.setRotation(p.angle);
      const label = this.add.text(p.x, p.y - 28, p.name || "Player", {
        fontSize: "13px", color: css,
        stroke: "#000000", strokeThickness: 3
      }).setOrigin(0.5);
      this.otherPlayers[p.id] = { body, label, team: p.team || null };
    }

    // chat (again)

    showChatBubble(id, message) {
      const isMe   = this.socket && id === this.socket.id;
      const target = isMe ? this.myPlayer : (this.otherPlayers[id]?.body ?? null);
      if (!target) return;

      if (!target.chatBubbles) target.chatBubbles = [];

      const bubble = this.add.text(target.x, target.y - 50, message, {
        fontSize: "13px", color: "#ffffff",
        backgroundColor: "#00000099",
        padding: { x: 8, y: 5 },
        shadow: { offsetX: 1, offsetY: 1, color: "#000", blur: 4, fill: true }
      }).setOrigin(0.5).setDepth(10);

      target.chatBubbles.push(bubble);
      this.time.delayedCall(3500, () => {
        bubble.destroy();
        if (target.chatBubbles) target.chatBubbles = target.chatBubbles.filter(b => b !== bubble);
      });
    }

    addChatLog(name, team, message) {
      const line = document.createElement("div");
      line.style.cssText = `
        background: rgba(0,0,0,0.6); color: white; font-size: 13px;
        font-family: Arial, sans-serif; padding: 3px 8px; border-radius: 4px;
      `;
      const nameColor = teamCss(team);
      line.innerHTML = `<span style="color:${nameColor}">${name}</span>: ${message}`;
      this.chatLog.appendChild(line);
      setTimeout(() => line.remove(), 8000);
      while (this.chatLog.children.length > 6) this.chatLog.removeChild(this.chatLog.firstChild);
    }

    // player list

    updatePlayerList() {
      if (!this.playerListDiv) return;
      this.playerListDiv.innerHTML = "";

      // header
      const header = document.createElement("div");
      header.style.cssText = "color:#888; font-size:10px; letter-spacing:0.08em; text-transform:uppercase; padding-bottom:4px; border-bottom:1px solid rgba(255,255,255,0.1); margin-bottom:4px;";
      header.textContent = "Players";
      this.playerListDiv.appendChild(header);

      // u
      const myColor = teamCss(this.myTeam);
      const myEntry = document.createElement("div");
      myEntry.style.cssText = `color:${myColor}; font-size:13px; padding:2px 0; font-weight:bold;`;
      myEntry.textContent = "▶ " + (this.myName || "You");
      this.playerListDiv.appendChild(myEntry);

      // folk
      Object.values(this.otherPlayers).forEach((p) => {
        const color = teamCss(p.team);
        const entry = document.createElement("div");
        entry.style.cssText = `color:${color}; font-size:13px; padding:2px 0;`;
        entry.textContent = p.label.text || "Player";
        this.playerListDiv.appendChild(entry);
      });
    }

    // inventory

    selectSlot(index) {
      if (!this.inventorySlots) return;
      if (this.selectedSlot >= 0) {
        this.inventorySlots[this.selectedSlot].style.border = "3px solid rgba(255,255,255,0.15)";
      }
      if (index === -1) { this.selectedSlot = -1; return; }
      this.selectedSlot = index;
      this.inventorySlots[index].style.border = "5px solid #4a90d9";
    }

    // update loop

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
        const pointer    = this.input.activePointer;
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const angle = Phaser.Math.Angle.Between(
          this.myPlayer.x, this.myPlayer.y, worldPoint.x, worldPoint.y
        );
        this.myPlayer.setRotation(angle + Math.PI / 2);
        this.socket.emit("rotate", { angle: angle + Math.PI / 2 });
      }

      // chat bubbles
      if (this.myPlayer.chatBubbles) {
        this.myPlayer.chatBubbles.forEach((b, i) => {
          b.setPosition(this.myPlayer.x, this.myPlayer.y - 55 - i * 26);
        });
      }
      Object.values(this.otherPlayers).forEach((p) => {
        if (p.body.chatBubbles) {
          p.body.chatBubbles.forEach((b, i) => {
            b.setPosition(p.body.x, p.body.y - 55 - i * 26);
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
    type:            Phaser.AUTO,
    width:           window.innerWidth,
    height:          window.innerHeight,
    backgroundColor: "#1a1a2e",
    parent:          "gameContainer",
    scene:           GameScene
  });
}

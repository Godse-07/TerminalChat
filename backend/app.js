const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const routes = require("./routes");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }));

app.use(express.static("public"));
app.use("/", routes);

const MAX_HISTORY = 100;
const lastMessages = new Map();

async function emitPresence(room) {
  const sockets = await io.in(room).allSockets();
  const count = sockets.size;
  io.in(room).emit("presence", { count });
}

function pushToHistory(room, msg) {
  if (!lastMessages.has(room)) lastMessages.set(room, []);
  const arr = lastMessages.get(room);
  arr.push(msg);
  if (arr.length > MAX_HISTORY) arr.shift();
}

io.on("connection", (socket) => {
  console.log("socket connected", socket.id);

  socket._msgsSent = 0;
  socket._lastReset = Date.now();

  function allowedToSend() {
    const now = Date.now();
    if (now - socket._lastReset > 10 * 1000) {
      socket._msgsSent = 0;
      socket._lastReset = now;
    }
    socket._msgsSent++;
    return socket._msgsSent <= 12;
  }

  socket.on("join", async ({ room, nick }) => {
    socket.join(room);
    socket.data.nick = nick || "anon";
    socket.data.room = room;

    const hist = lastMessages.get(room) || [];
    if (hist.length) {
      socket.emit("history", hist.slice());
    }

    socket.to(room).emit("system", `${socket.data.nick} joined`);
    await emitPresence(room);
  });

  socket.on("typing", ({ room } = {}) => {
    const r = room || socket.data.room;
    if (!r) return;
    socket.to(r).emit("typing", { nick: socket.data.nick || "anon" });
  });
  socket.on("stop-typing", ({ room } = {}) => {
    const r = room || socket.data.room;
    if (!r) return;
    socket.to(r).emit("stop-typing", { nick: socket.data.nick || "anon" });
  });

  socket.on("msg", (data) => {
    const text = data?.text ? String(data.text).slice(0, 1000) : "";
    const room = data?.room || socket.data.room;
    if (!room || !text) return;

    if (!allowedToSend()) {
      socket.emit("system", "You are sending messages too quickly. Slow down.");
      return;
    }

    const msg = {
      id:
        Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
      clientId: data?.clientId, // propagate for ack replacement
      nick: socket.data.nick || data?.nick || "anon",
      text,
      ts: Date.now(),
    };

    pushToHistory(room, msg);

    socket.emit("msg:ack", msg);

    socket.to(room).emit("msg", msg);
  });

  socket.on("disconnect", async () => {
    const { nick, room } = socket.data || {};
    if (room) {
      socket.to(room).emit("system", `${nick || "anon"} left`);
      await emitPresence(room);
    }
    console.log("socket disconnected", socket.id);
  });
});

module.exports = { app, server };

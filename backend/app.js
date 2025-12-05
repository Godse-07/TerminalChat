const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const routes = require("./routes");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static("public"));

app.use("/", routes);

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

  socket.on("join", ({ room, nick }) => {
    socket.join(room);
    socket.data.nick = nick || "anon";
    socket.data.room = room;

    socket.to(room).emit("system", `${socket.data.nick} joined`);
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
      nick: socket.data.nick || data.nick || "anon",
      text,
      ts: Date.now(),
    };

    socket.to(room).emit("msg", msg);
  });

  socket.on("disconnect", () => {
    const { nick, room } = socket.data || {};
    if (room) socket.to(room).emit("system", `${nick || "anon"} left`);
    console.log("socket disconnected", socket.id);
  });
});

module.exports = { app, server };

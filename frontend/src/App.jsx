import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./index.css";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";

function genUsername() {
  const adjectives = [
    "Swift",
    "Silent",
    "Cyber",
    "Digital",
    "Ghost",
    "Shadow",
    "Neon",
    "Binary",
  ];
  const nouns = [
    "Hacker",
    "User",
    "Agent",
    "Terminal",
    "Node",
    "Client",
    "Phantom",
    "Entity",
  ];
  return (
    localStorage.getItem("term_nick") ||
    `${adjectives[Math.floor(Math.random() * adjectives.length)]}${
      nouns[Math.floor(Math.random() * nouns.length)]
    }${Math.floor(Math.random() * 999)}`
  );
}

function getRoomFromPathOrCreate() {
  const p = window.location.pathname.split("/").filter(Boolean);
  if (p[0] === "room" && p[1]) return p[1];
  const id = Math.random().toString(36).slice(2, 8);
  history.replaceState({}, "", "/room/" + id);
  return id;
}

export default function App() {
  const [nick, setNick] = useState(genUsername());
  const [status, setStatus] = useState("DISCONNECTED");
  const [statusColor, setStatusColor] = useState("error");
  const [lines, setLines] = useState([]); // starts empty
  const [input, setInput] = useState("");
  const socketRef = useRef(null);
  const messagesRef = useRef(null);
  const roomRef = useRef(getRoomFromPathOrCreate());
  const messageCountRef = useRef(0);

  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = s;

    s.on("connect", () => {
      setStatus("CONNECTED");
      setStatusColor("ok");
      // join room but DO NOT push any system messages into the chat
      s.emit("join", { room: roomRef.current, nick });
    });

    s.on("msg", (m) => {
      // Real incoming message from other users
      pushLine({ type: "msg", ...m });
      messageCountRef.current += 1;
    });

    // If you want to show server-side system messages (like "x joined"), enable this:
    // s.on("system", (txt) => pushLine({ type: "system", text: txt, ts: Date.now() }));

    s.on("disconnect", () => {
      setStatus("DISCONNECTED");
      setStatusColor("error");
      // We do NOT push a 'disconnected' system message into chat to keep initial view clean.
    });

    return () => {
      s.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-scroll when messages arrive
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  function escapeHtml(text) {
    if (!text && text !== 0) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function pushLine(item) {
    setLines((prev) => [...prev, item]);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const raw = input.trim();
    if (!raw) return;

    // commands
    if (raw.toLowerCase() === "help") {
      pushLine({
        type: "system",
        text: "Available commands: help, clear, /nick <name>, /me <action>, /exit",
        ts: Date.now(),
      });
      setInput("");
      return;
    }
    if (raw.toLowerCase() === "clear") {
      setLines([]);
      messageCountRef.current = 0;
      setInput("");
      return;
    }
    if (raw.startsWith("/nick ")) {
      const newNick = raw.slice(6).trim();
      if (newNick) {
        setNick(newNick);
        localStorage.setItem("term_nick", newNick);
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit("join", {
            room: roomRef.current,
            nick: newNick,
          });
        }
        // optional small confirmation within chat
        pushLine({
          type: "system",
          text: `You are now: ${newNick}`,
          ts: Date.now(),
        });
      }
      setInput("");
      return;
    }
    if (raw.startsWith("/me ")) {
      const action = raw.slice(4).trim();
      const payload = {
        room: roomRef.current,
        text: `* ${nick} ${action}`,
        nick,
      };
      socketRef.current?.emit("msg", payload);
      pushLine({
        type: "msg",
        nick,
        text: `* ${nick} ${action}`,
        ts: Date.now(),
      });
      messageCountRef.current += 1;
      setInput("");
      return;
    }
    if (raw === "/exit") {
      window.location.href = "/";
      return;
    }

    // normal message: send to server and local echo
    const payload = { room: roomRef.current, text: raw, nick };
    socketRef.current?.emit("msg", payload);
    pushLine({ type: "msg", nick, text: raw, ts: Date.now() });
    messageCountRef.current += 1;
    setInput("");
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-terminal-bg text-terminal-text terminal-scanline">
      {/* Header */}
      <div className="border-b border-terminal-border px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-terminal-system font-bold">
            TERMINAL-CHAT v1.0
          </span>
          <span className="text-xs opacity-60">|</span>
          <span className="text-xs opacity-80">
            User:
            <span className="text-terminal-user font-semibold ml-1">
              {nick}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs opacity-60">Status:</span>
          <div id="status-indicator" className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                statusColor === "ok"
                  ? "bg-terminal-ok animate-pulse"
                  : "bg-terminal-error"
              }`}
            />
            <span
              className={`text-xs ${
                statusColor === "ok"
                  ? "text-terminal-ok"
                  : "text-terminal-error"
              }`}
            >
              {status}
            </span>
          </div>
        </div>
      </div>

      {/* Messages + static intro box */}
      <div
        id="messages-container"
        ref={messagesRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
      >
        {/* STATIC intro block — visible on load */}
        <div className="text-terminal-system mb-4">
          <div className="mb-2">
            ╔═══════════════════════════════════════════════════════════╗
          </div>
          <div className="mb-2">║ WELCOME TO TERMINAL CHAT ║</div>
          <div className="mb-2">║ Anonymous P2P Communication System ║</div>
          <div className="mb-2">
            ╚═══════════════════════════════════════════════════════════╝
          </div>
          <div className="text-xs opacity-80 mt-3">
            <div>&gt; Initializing connection...</div>
            <div>
              &gt; Your identity:{" "}
              <span className="text-terminal-user">{nick}</span>
            </div>
            <div>&gt; Type your message and press ENTER to send</div>
          </div>
        </div>

        {/* dynamic (real) messages will appear below the static intro */}
        {lines.map((l, i) => {
          if (l.type === "system") {
            const time = new Date(l.ts || Date.now()).toLocaleTimeString();
            return (
              <div
                key={i}
                className="text-terminal-system text-sm opacity-80 flex gap-2"
              >
                <span className="opacity-50">[{time}]</span>
                <span>*** {escapeHtml(l.text)}</span>
              </div>
            );
          }
          const time = new Date(l.ts || Date.now()).toLocaleTimeString();
          const own = l.nick === nick;
          return (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-xs opacity-50">[{time}]</span>
              <span
                className={`${
                  own
                    ? "text-terminal-user font-semibold"
                    : "text-terminal-text font-semibold"
                }`}
              >
                {escapeHtml(l.nick)}:
              </span>
              <span className="flex-1 break-words">{escapeHtml(l.text)}</span>
            </div>
          );
        })}
      </div>

      {/* input */}
      <div className="border-t border-terminal-border px-4 py-3">
        <form
          id="message-form"
          className="flex items-center gap-2"
          onSubmit={handleSubmit}
        >
          <span className="text-terminal-prompt font-bold">&gt;</span>
          <input
            id="message-input"
            type="text"
            autoComplete="off"
            placeholder="Type your message..."
            className="flex-1 bg-transparent border-none outline-none text-terminal-text placeholder-terminal-text placeholder-opacity-30"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <span id="cursor" className="cursor-blink">
            █
          </span>
        </form>
        <div id="help-text" className="text-xs opacity-50 mt-2">
          Type 'help' for commands | Type 'clear' to clear history
        </div>
      </div>
    </div>
  );
}

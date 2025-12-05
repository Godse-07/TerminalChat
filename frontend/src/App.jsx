// src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./index.css";
import { genUsername, getRoomFromPathOrCreate } from "./utils/helper";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";

export default function App() {
  const [nick, setNick] = useState(genUsername());
  const [status, setStatus] = useState("DISCONNECTED");
  const [statusColor, setStatusColor] = useState("error");
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState("");
  const [presence, setPresence] = useState(1);
  const [typingUsers, setTypingUsers] = useState([]);

  const socketRef = useRef(null);
  const messagesRef = useRef(null);
  const roomRef = useRef(getRoomFromPathOrCreate());
  const messageCountRef = useRef(0);

  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = s;

    s.on("connect", () => {
      setStatus("CONNECTED");
      setStatusColor("ok");
      s.emit("join", { room: roomRef.current, nick });
    });

    s.on("history", (arr) => {
      setLines((prev) => [...prev, ...arr.map((m) => ({ type: "msg", ...m }))]);
    });

    s.on("msg", (m) => {
      pushLine({ type: "msg", ...m });
      messageCountRef.current += 1;
    });

    s.on("msg:ack", (m) => {
      if (m.clientId) {
        setLines((prev) => {
          const idx = prev.findIndex(
            (ln) =>
              ln.type === "msg" && ln.clientId && ln.clientId === m.clientId
          );
          if (idx !== -1) {
            const copy = prev.slice();
            copy[idx] = { type: "msg", ...m };
            return copy;
          }
          return [...prev, { type: "msg", ...m }];
        });
      } else {
        pushLine({ type: "msg", ...m });
      }
    });

    s.on("system", (txt) => {
      pushLine({ type: "system", text: txt, ts: Date.now() });
    });

    s.on("presence", (p) => {
      if (p && typeof p.count === "number") setPresence(p.count);
    });

    s.on("typing", ({ nick: tnick }) => {
      setTypingUsers((prev) =>
        prev.includes(tnick) ? prev : [...prev, tnick]
      );
    });
    s.on("stop-typing", ({ nick: tnick }) => {
      setTypingUsers((prev) => prev.filter((n) => n !== tnick));
    });

    s.on("disconnect", () => {
      setStatus("DISCONNECTED");
      setStatusColor("error");
    });

    return () => {
      s.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, typingUsers]);

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

  async function handleCreateRoom() {
    const BACKEND = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";
    const url = `${BACKEND.replace(/\/$/, "")}/create-room`;

    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        pushLine({
          type: "system",
          text: `Failed to create room: ${res.status} ${res.statusText} ${text}`,
          ts: Date.now(),
        });
        return;
      }
      const j = await res.json();
      if (j && j.room) {
        location.href = "/room/" + j.room;
        return;
      }
      pushLine({
        type: "system",
        text: "Failed to create room: invalid response",
        ts: Date.now(),
      });
    } catch (err) {
      console.error("create-room error:", err);
      pushLine({
        type: "system",
        text: `Failed to create room (network/CORS): ${err.message}`,
        ts: Date.now(),
      });
      // optional fallback
      const fallback = Math.random().toString(36).slice(2, 8);
      pushLine({
        type: "system",
        text: `Using fallback room: ${fallback}`,
        ts: Date.now(),
      });
      location.href = "/room/" + fallback;
    }
  }

  function handleCopyLink() {
    navigator.clipboard
      .writeText(location.href)
      .then(() => {
        pushLine({
          type: "system",
          text: "Link copied to clipboard",
          ts: Date.now(),
        });
      })
      .catch(() => {
        pushLine({
          type: "system",
          text: "Unable to copy link",
          ts: Date.now(),
        });
      });
  }

  function handleTypingChange(value) {
    setInput(value);
    const s = socketRef.current;
    if (!s || !s.connected) return;

    if (!isTypingRef.current) {
      s.emit("typing", { room: roomRef.current });
      isTypingRef.current = true;
    }

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      s.emit("stop-typing", { room: roomRef.current });
      isTypingRef.current = false;
    }, 1200);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const raw = input.trim();
    if (!raw) return;

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
        if (socketRef.current?.connected)
          socketRef.current.emit("join", {
            room: roomRef.current,
            nick: newNick,
          });
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

    const clientId =
      "c-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 6);
    const payload = { room: roomRef.current, text: raw, nick, clientId };
    socketRef.current?.emit("msg", payload);

    pushLine({ type: "msg", clientId, nick, text: raw, ts: Date.now() });
    messageCountRef.current += 1;
    setInput("");

    if (isTypingRef.current) {
      socketRef.current.emit("stop-typing", { room: roomRef.current });
      isTypingRef.current = false;
      clearTimeout(typingTimeoutRef.current);
    }
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
          <button className="ml-4 px-2 py-1 text-xs" onClick={handleCreateRoom}>
            Create room
          </button>
          <button className="px-2 py-1 text-xs" onClick={handleCopyLink}>
            Copy link
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs opacity-60">In room:</div>
          <div className="text-xs text-terminal-user font-semibold">
            {roomRef.current}
          </div>
          <div className="text-xs opacity-60 ml-3">Users:</div>
          <div className="text-xs">{presence}</div>

          <span className="text-xs opacity-60 ml-4">Status:</span>
          <div id="status-indicator" className="flex items-center gap-2 ml-2">
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
        {/* STATIC intro block */}
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

        {/* dynamic messages */}
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

          // Highlight optimistic pending messages (they have clientId but no server id)
          const pending = l.clientId && !l.id;

          return (
            <div
              key={i}
              className="flex gap-2 items-start"
              style={pending ? { opacity: 0.8 } : {}}
            >
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

        {/* typing indicator */}
        {typingUsers.length > 0 && (
          <div className="text-xs opacity-70 text-terminal-system">
            {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"}{" "}
            typing...
          </div>
        )}
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
            onChange={(e) => handleTypingChange(e.target.value)}
            onBlur={() => {
              if (isTypingRef.current) {
                socketRef.current?.emit("stop-typing", {
                  room: roomRef.current,
                });
                clearTimeout(typingTimeoutRef.current);
                isTypingRef.current = false;
              }
            }}
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

import React, { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { MdFileUpload } from "react-icons/md";
import "./index.css";
import { genUsername, getRoomFromPathOrCreate } from "./utils/helper";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";

export default function App() {
  const [nick, setNick] = useState(genUsername());
  const [status, setStatus] = useState("DISCONNECTED");
  const [statusColor, setStatusColor] = useState("error");
  const [lines, setLines] = useState([]); // chat lines
  const [input, setInput] = useState("");
  const [presence, setPresence] = useState(1);
  const [typingUsers, setTypingUsers] = useState([]);
  const [outgoingProgressMap, setOutgoingProgressMap] = useState({});

  // refs
  const socketRef = useRef(null);
  const messagesRef = useRef(null);
  const roomRef = useRef(getRoomFromPathOrCreate());
  const incomingFilesRef = useRef({});
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef();

  // autoscroll
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, typingUsers]);

  const escapeHtml = useCallback((text) => {
    if (!text && text !== 0) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }, []);

  const pushLine = useCallback((item) => {
    setLines((prev) => [...prev, item]);
  }, []);

  // socket setup
  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = s;

    const onConnect = () => {
      setStatus("CONNECTED");
      setStatusColor("ok");
      s.emit("join", { room: roomRef.current, nick });
    };
    s.on("connect", onConnect);

    const onHistory = (arr = []) => {
      if (!Array.isArray(arr) || !arr.length) return;
      setLines((prev) => [...prev, ...arr.map((m) => ({ type: "msg", ...m }))]);
    };
    s.on("history", onHistory);

    const onMsg = (m) => pushLine({ type: "msg", ...m });
    s.on("msg", onMsg);

    const onMsgAck = (m) => {
      if (m?.clientId) {
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
    };
    s.on("msg:ack", onMsgAck);

    const onSystem = (txt) =>
      pushLine({ type: "system", text: txt, ts: Date.now() });
    s.on("system", onSystem);

    const onPresence = (p) => {
      if (p && typeof p.count === "number") setPresence(p.count);
    };
    s.on("presence", onPresence);

    const onTyping = ({ nick: tnick }) =>
      setTypingUsers((prev) =>
        prev.includes(tnick) ? prev : [...prev, tnick]
      );
    const onStopTyping = ({ nick: tnick }) =>
      setTypingUsers((prev) => prev.filter((n) => n !== tnick));
    s.on("typing", onTyping);
    s.on("stop-typing", onStopTyping);

    // file events
    const onFileMeta = ({ meta }) => {
      if (!meta || !meta.id) return;
      incomingFilesRef.current[meta.id] = { meta, chunks: [], received: 0 };
      pushLine({
        type: "system",
        text: `Incoming file: ${meta.name} (${Math.round(
          (meta.size || 0) / 1024
        )} KB) — receiving...`,
        ts: Date.now(),
      });
    };
    s.on("file-meta", onFileMeta);

    const onFileChunk = ({ fileId, seq, chunk }) => {
      const entry = incomingFilesRef.current[fileId];
      if (!entry) return;
      if (chunk && chunk.constructor && chunk.constructor.name === "Buffer") {
        chunk = chunk.buffer.slice(
          chunk.byteOffset,
          chunk.byteOffset + chunk.byteLength
        );
      }
      entry.chunks[seq] = chunk;
      entry.received++;
      if (entry.received % 8 === 0) {
        pushLine({
          type: "system",
          text: `Receiving ${entry.meta.name}: ${entry.received} chunks...`,
          ts: Date.now(),
        });
      }
    };
    s.on("file-chunk", onFileChunk);

    const onFileDone = ({ fileId }) => {
      const entry = incomingFilesRef.current[fileId];
      if (!entry) return;
      const meta = entry.meta || {};
      const buffers = entry.chunks
        .map((ab) => new Uint8Array(ab))
        .filter(Boolean);
      const totalLen = buffers.reduce((acc, b) => acc + b.length, 0);
      const tmp = new Uint8Array(totalLen);
      let pos = 0;
      for (const b of buffers) {
        tmp.set(b, pos);
        pos += b.length;
      }
      const blob = new Blob([tmp], {
        type: meta.type || "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      pushLine({
        type: "system",
        text: `Received file: ${meta.name} — ${url}`,
        ts: Date.now(),
      });
      delete incomingFilesRef.current[fileId];
    };
    s.on("file-done", onFileDone);

    const onDisconnect = () => {
      setStatus("DISCONNECTED");
      setStatusColor("error");
    };
    s.on("disconnect", onDisconnect);

    return () => {
      s.off("connect", onConnect);
      s.off("history", onHistory);
      s.off("msg", onMsg);
      s.off("msg:ack", onMsgAck);
      s.off("system", onSystem);
      s.off("presence", onPresence);
      s.off("typing", onTyping);
      s.off("stop-typing", onStopTyping);
      s.off("file-meta", onFileMeta);
      s.off("file-chunk", onFileChunk);
      s.off("file-done", onFileDone);
      s.off("disconnect", onDisconnect);
      s.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateRoom = useCallback(async () => {
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
      if (j && j.room) location.href = "/room/" + j.room;
      else
        pushLine({
          type: "system",
          text: "Failed to create room: invalid response",
          ts: Date.now(),
        });
    } catch (err) {
      console.error(err);
      pushLine({
        type: "system",
        text: `Failed to create room (network/CORS): ${err.message}`,
        ts: Date.now(),
      });
      const fallback = Math.random().toString(36).slice(2, 8);
      pushLine({
        type: "system",
        text: `Using fallback room: ${fallback}`,
        ts: Date.now(),
      });
      location.href = "/room/" + fallback;
    }
  }, [pushLine]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard
      .writeText(location.href)
      .then(() =>
        pushLine({
          type: "system",
          text: "Link copied to clipboard",
          ts: Date.now(),
        })
      )
      .catch(() =>
        pushLine({
          type: "system",
          text: "Unable to copy link",
          ts: Date.now(),
        })
      );
  }, [pushLine]);

  const handleTypingChange = useCallback((value) => {
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
  }, []);

  const handleSubmit = useCallback(
    (e) => {
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
        setInput("");
        return;
      }
      if (raw.startsWith("/nick ")) {
        const newNick = raw.slice(6).trim();
        if (newNick) {
          setNick(newNick);
          localStorage.setItem("term_nick", newNick);
          const s = socketRef.current;
          if (s?.connected)
            s.emit("join", { room: roomRef.current, nick: newNick });
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
      setInput("");

      if (isTypingRef.current) {
        socketRef.current?.emit("stop-typing", { room: roomRef.current });
        isTypingRef.current = false;
        clearTimeout(typingTimeoutRef.current);
      }
    },
    [input, nick, pushLine]
  );

  const sendFile = useCallback(
    async (file) => {
      if (!file) return;
      const s = socketRef.current;
      if (!s || !s.connected) {
        pushLine({
          type: "system",
          text: "Not connected: cannot send file",
          ts: Date.now(),
        });
        return;
      }

      const CHUNK_SIZE = 128 * 1024;
      const MAX_ALLOWED = 50 * 1024 * 1024;
      if (file.size > MAX_ALLOWED) {
        pushLine({
          type: "system",
          text: `File too large (max ${MAX_ALLOWED / 1024 / 1024} MB)`,
          ts: Date.now(),
        });
        return;
      }

      const id =
        "f-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 6);
      const meta = { id, name: file.name, size: file.size, type: file.type };
      s.emit("file-meta", { room: roomRef.current, meta });

      let offset = 0;
      let seq = 0;
      setOutgoingProgressMap((m) => ({ ...m, [id]: 0 }));
      while (offset < file.size) {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const ab = await slice.arrayBuffer();
        s.emit("file-chunk", {
          room: roomRef.current,
          fileId: id,
          seq,
          chunk: ab,
        });
        offset += CHUNK_SIZE;
        seq++;
        setOutgoingProgressMap((m) => ({
          ...m,
          [id]: Math.min(1, offset / file.size),
        }));
      }
      s.emit("file-done", { room: roomRef.current, fileId: id });
      pushLine({
        type: "system",
        text: `Sent file: ${file.name}`,
        ts: Date.now(),
      });
      setTimeout(
        () =>
          setOutgoingProgressMap((m) => {
            const copy = { ...m };
            delete copy[id];
            return copy;
          }),
        800
      );
    },
    [pushLine]
  );

  const renderSystemText = useCallback(
    (txt) => {
      const s = String(txt || "");
      const m = s.match(/(blob:[^\s]+|https?:\/\/[^\s]+)/);
      if (m) {
        const [url] = m;
        const parts = s.split(url);
        return (
          <>
            <span dangerouslySetInnerHTML={{ __html: escapeHtml(parts[0]) }} />
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="underline ml-1 mr-1"
            >
              download
            </a>
            <span
              dangerouslySetInnerHTML={{ __html: escapeHtml(parts[1] || "") }}
            />
          </>
        );
      }
      return escapeHtml(s);
    },
    [escapeHtml]
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-terminal-bg text-terminal-text terminal-scanline">
      <header className="header px-4 py-3 border-b border-terminal-border flex items-center justify-between gap-3">
        <div className="left flex items-center gap-3 flex-1 min-w-0">
          <div className="brand text-terminal-system font-bold shrink-0">
            TERMINAL-CHAT v1.0
          </div>
          <div className="user text-xs opacity-80 truncate">
            User:
            <span className="text-terminal-user font-semibold ml-1">
              {nick}
            </span>
          </div>

          <div className="controls ml-2 flex gap-2 flex-wrap">
            <button
              className="btn"
              onClick={handleCreateRoom}
              aria-label="Create room"
            >
              Create
            </button>

            <label className="btn file-btn" title="Upload file">
              <input
                id="file-input"
                type="file"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) sendFile(f);
                  e.target.value = "";
                }}
              />
              <MdFileUpload className="icon" />
              <span className="btn-label">Upload</span>
            </label>

            <button
              className="btn"
              onClick={handleCopyLink}
              aria-label="Copy link"
            >
              Link
            </button>
          </div>
        </div>

        <div className="right flex items-center gap-3 shrink-0">
          <div className="text-xs opacity-60 truncate">
            In room:{" "}
            <span className="text-terminal-user font-semibold ml-1">
              {roomRef.current}
            </span>
          </div>
          <div className="text-xs opacity-60">
            Users: <span className="font-semibold ml-1">{presence}</span>
          </div>
          <div className="status flex items-center gap-2">
            <div
              className={`status-dot ${statusColor === "ok" ? "ok" : "err"}`}
              aria-hidden
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
      </header>

      <main
        id="messages-container"
        ref={messagesRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
      >
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

        {lines.map((l, i) => {
          if (l.type === "system") {
            const time = new Date(l.ts || Date.now()).toLocaleTimeString();
            return (
              <div
                key={i}
                className="text-terminal-system text-sm opacity-80 flex gap-2"
              >
                <span className="opacity-50">[{time}]</span>
                <span>*** {renderSystemText(l.text)}</span>
              </div>
            );
          }
          const time = new Date(l.ts || Date.now()).toLocaleTimeString();
          const own = l.nick === nick;
          const pending = l.clientId && !l.id;
          return (
            <div
              key={i}
              className="flex gap-2 items-start message"
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

        {typingUsers.length > 0 && (
          <div className="text-xs opacity-70 text-terminal-system">
            {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"}{" "}
            typing...
          </div>
        )}

        {Object.keys(outgoingProgressMap).length > 0 && (
          <div className="text-xs opacity-70 text-terminal-system">
            {Object.entries(outgoingProgressMap).map(([id, p]) => (
              <div key={id}>{`Sending file ${id}: ${Math.round(
                p * 100
              )}%`}</div>
            ))}
          </div>
        )}
      </main>

      <footer className="input-area border-t border-terminal-border px-4 py-3">
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
            className="flex-1 input-field"
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
            aria-label="Message input"
          />
          <span id="cursor" className="cursor-blink">
            █
          </span>
        </form>
        <div id="help-text" className="text-xs opacity-50 mt-2">
          Type 'help' for commands | Type 'clear' to clear history
        </div>
      </footer>
    </div>
  );
}

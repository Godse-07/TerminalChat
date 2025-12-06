# 🖥️ TERMINAL-CHAT — Anonymous Real-Time Terminal Style Chat

<div align="center">
  <img src="https://github.com/Godse-07/TerminalChat/blob/master/frontend/public/Terminal_chat.jpg" 
       alt="PR Checker hero" width="200" height="200" style="border-radius:50%; margin-bottom:10px">
</div>

## 🧠 Overview

Terminal-Chat is a **no-login, no-database, anonymous chat system** inspired by retro terminal aesthetics.  
Users instantly join a chat room, share the room link, and chat in real-time.

Built using:

- **React + Vite** (frontend)  
- **Node.js + Express + Socket.IO** (backend)  
- **Render** (backend hosting)  
- **Vercel** (frontend hosting)

---

## 🎯 Features

### ✅ Anonymous chatting  
No signup or login — identity is auto-generated.

### ✅ Room-based chat  
Create a private room → share the link → chat.

### ✅ Optimistic messages + server ACK  
Messages appear instantly while waiting for server confirmation.

### ✅ In-memory chat history  
Last **100 messages per room**, reset after backend restarts.  
(No database → privacy-friendly)

### ✅ Presence counter  
Shows how many users are in the room.

### ✅ Typing indicators  
Displays who is typing in real-time.

### ✅ Rate limiting  
Prevents spam messaging & room creation abuse.

### ✅ Safe HTML escaping  
Blocks malicious scripts (XSS protection).

### ✅ Terminal-style UI  
Retro cyber aesthetic with CRT scanlines.


## 🛠️ Installation & Setup

### Backend (Node.js + Express + Socket.IO)

**1. Install dependencies**
```bash
cd backend
npm install
```

**2. Create `.env`**
```
PORT=3000
FRONTEND_ORIGIN=https://terminal-chat-rosy.vercel.app
```

**3. Start backend**
```bash
node index.js
```

Backend runs at `http://localhost:3000`

### Frontend (React + Vite)

**1. Install dependencies**
```bash
cd frontend
npm install
```

**2. Environment Variables**

Local development (`.env`):
```
VITE_SOCKET_URL=http://localhost:3000
```

Production (`.env.production`):
```
VITE_SOCKET_URL=https://terminalchat-8zbl.onrender.com
```

**3. Start development server**
```bash
npm run dev
```

---

## 🚀 Deployment

**Frontend (Vercel)**
- Import repo into Vercel
- Add env var: `VITE_SOCKET_URL=********`
- Add `vercel.json` with SPA rewrites
- Deploy

**Backend (Render)**
- Create Web Service
- Build: `npm install` | Start: `node index.js`
- Add env var: `FRONTEND_ORIGIN=https://terminal-chat-rosy.vercel.app`

---
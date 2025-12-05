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

export { genUsername, getRoomFromPathOrCreate };
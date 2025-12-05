const express = require("express");
const router = express.Router();

router.get("/create-room", (req, res) => {
  const id = Math.random().toString(36).slice(2, 8);
  res.json({ room: id });
});

module.exports = router;

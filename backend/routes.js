const express = require("express");
const { createRoomLimiter } = require("./middleware/rateLimiter");
const router = express.Router();

router.get("/create-room", createRoomLimiter, (req, res) => {
  const id = Math.random().toString(36).slice(2, 8);
  res.json({ room: id });
});

router.get("/ping", (req, res) => {
  res.json({
    status: "ok",
    statusCode: 200,
    message: "pong",
  })
})

module.exports = router;

const rateLimit = require("express-rate-limit");

const createRoomLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many rooms created from this IP, try later." }
});

module.exports = {
    createRoomLimiter
}
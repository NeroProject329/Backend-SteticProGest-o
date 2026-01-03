const express = require("express");
const { requireAuth } = require("../middlewares/auth.middleware");
const { financeSummary } = require("../controllers/finance.controller");

const router = express.Router();

router.get("/summary", requireAuth, financeSummary);

module.exports = router;

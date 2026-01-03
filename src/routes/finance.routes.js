const express = require("express");
const { financeSummary } = require("../controllers/finance.controller");

const router = express.Router();

router.get("/summary", financeSummary);

module.exports = router;

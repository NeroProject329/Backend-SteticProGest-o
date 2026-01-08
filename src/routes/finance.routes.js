const express = require("express");
const { requireAuth } = require("../middlewares/auth.middleware");
const { checkLimit } = require("../middlewares/plan.middleware");

const {
  financeSummary,
  financeFlow,
  listCategories,
  createCategory,
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} = require("../controllers/finance.controller");

const router = express.Router();

router.use(requireAuth);

// ✅ já existia
router.get("/summary", checkLimit("finance"), financeSummary);

// ✅ NOVO: fluxo de caixa (PDF)
router.get("/flow", checkLimit("finance"), financeFlow);

// ✅ NOVO: categorias
router.get("/categories", checkLimit("finance"), listCategories);
router.post("/categories", checkLimit("finance"), createCategory);

// ✅ NOVO: lançamentos
router.get("/transactions", checkLimit("finance"), listTransactions);
router.post("/transactions", checkLimit("finance"), createTransaction);
router.patch("/transactions/:id", checkLimit("finance"), updateTransaction);
router.delete("/transactions/:id", checkLimit("finance"), deleteTransaction);

module.exports = router;

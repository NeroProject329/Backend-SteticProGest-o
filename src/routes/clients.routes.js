const router = require("express").Router();
const { requireAuth } = require("../middlewares/auth.middleware");
const {
  listClients,
  createClient,
  updateClient,
  deleteClient,
} = require("../controllers/clients.controller");
const { checkLimit } = require("../middlewares/plan.middleware"); // ✅ ADICIONA ISSO

router.use(requireAuth);

router.get("/", listClients);
router.post("/", requireAuth, checkLimit("clients"), createClient);
router.patch("/:id", updateClient);
router.delete("/:id", deleteClient);

module.exports = router;

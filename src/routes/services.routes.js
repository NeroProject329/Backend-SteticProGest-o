const router = require("express").Router();
const { requireAuth } = require("../middlewares/auth.middleware");
const {
  listServices,
  createService,
  updateService,
  disableService,
} = require("../controllers/services.controller");

router.use(requireAuth);

router.get("/", listServices);
router.post("/", createService);
router.patch("/:id", updateService);
router.delete("/:id", disableService);

module.exports = router;

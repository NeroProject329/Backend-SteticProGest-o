const router = require("express").Router();
const { requireAuth } = require("../middlewares/auth.middleware");
const { updateMe, changeMyPassword } = require("../controllers/me.controller");

router.use(requireAuth);

router.patch("/", updateMe);
router.patch("/password", changeMyPassword);

module.exports = router;

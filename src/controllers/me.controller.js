const bcrypt = require("bcrypt");
const { prisma } = require("../lib/prisma");

function cleanPhone(v) {
  return String(v || "").replace(/\D/g, "");
}

// PATCH /api/me
async function updateMe(req, res) {
  const { userId } = req.user;
  const { name, email, phone } = req.body;

  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ message: "Nome inválido." });
  }
  if (!email || !String(email).includes("@")) {
    return res.status(400).json({ message: "E-mail inválido." });
  }

  const data = {
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    phone: phone ? cleanPhone(phone) : null,
  };

  // evita email duplicado
  const dup = await prisma.user.findFirst({
    where: { email: data.email, NOT: { id: userId } },
    select: { id: true },
  });
  if (dup) return res.status(409).json({ message: "Este e-mail já está em uso." });

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, email: true, phone: true, createdAt: true },
  });

  return res.json({ user });
}

// PATCH /api/me/password
async function changeMyPassword(req, res) {
  const { userId } = req.user;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Informe senha atual e nova senha." });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ message: "A nova senha deve ter pelo menos 6 caracteres." });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true },
  });
  if (!user) return res.status(404).json({ message: "Usuário não encontrado." });

  const ok = await bcrypt.compare(String(currentPassword), user.password);
  if (!ok) return res.status(401).json({ message: "Senha atual incorreta." });

  const hashed = await bcrypt.hash(String(newPassword), 10);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashed },
  });

  return res.json({ ok: true });
}

module.exports = {
  updateMe,
  changeMyPassword,
};

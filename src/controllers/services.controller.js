const { prisma } = require("../lib/prisma");

// Helpers
function toInt(value, fieldName) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    const err = new Error(`Campo inválido: ${fieldName}`);
    err.statusCode = 400;
    throw err;
  }
  return n;
}

async function listServices(req, res) {
  const { salonId } = req.user;
  const { active } = req.query; // ?active=true/false

  const where = { salonId };
  if (active === "true") where.isActive = true;
  if (active === "false") where.isActive = false;

  const services = await prisma.service.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      durationM: true,
      isActive: true,
      createdAt: true,
    },
  });

  return res.json({ services });
}

async function createService(req, res) {
  try {
    const { salonId } = req.user;
    const { name, category, price, durationM } = req.body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({ message: "Nome do serviço é obrigatório." });
    }

    const priceInt = toInt(price, "price"); // centavos
    const durationInt = toInt(durationM, "durationM"); // minutos

    if (priceInt < 0) return res.status(400).json({ message: "Preço inválido." });
    if (durationInt <= 0) return res.status(400).json({ message: "Duração inválida." });

    const service = await prisma.service.create({
      data: {
        name: name.trim(),
        category: category ? String(category).trim() : null,
        price: priceInt,
        durationM: durationInt,
        salonId,
      },
      select: {
        id: true,
        name: true,
        category: true,
        price: true,
        durationM: true,
        isActive: true,
        createdAt: true,
      },
    });

    return res.status(201).json({ service });
  } catch (e) {
    const status = e.statusCode || 500;
    return res.status(status).json({ message: e.message || "Erro interno" });
  }
}

async function updateService(req, res) {
  try {
    const { salonId } = req.user;
    const { id } = req.params;

    const exists = await prisma.service.findFirst({
      where: { id, salonId },
      select: { id: true },
    });

    if (!exists) return res.status(404).json({ message: "Serviço não encontrado." });

    const { name, category, price, durationM, isActive } = req.body;

    const data = {};

    if (name !== undefined) {
      if (!name || String(name).trim().length < 2) {
        return res.status(400).json({ message: "Nome inválido." });
      }
      data.name = String(name).trim();
    }

    if (category !== undefined) {
      data.category = category ? String(category).trim() : null;
    }

    if (price !== undefined) {
      const priceInt = toInt(price, "price");
      if (priceInt < 0) return res.status(400).json({ message: "Preço inválido." });
      data.price = priceInt;
    }

    if (durationM !== undefined) {
      const durationInt = toInt(durationM, "durationM");
      if (durationInt <= 0) return res.status(400).json({ message: "Duração inválida." });
      data.durationM = durationInt;
    }

    if (isActive !== undefined) {
      data.isActive = Boolean(isActive);
    }

    const service = await prisma.service.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        category: true,
        price: true,
        durationM: true,
        isActive: true,
        createdAt: true,
      },
    });

    return res.json({ service });
  } catch (e) {
    const status = e.statusCode || 500;
    return res.status(status).json({ message: e.message || "Erro interno" });
  }
}

async function disableService(req, res) {
  const { salonId } = req.user;
  const { id } = req.params;

  const exists = await prisma.service.findFirst({
    where: { id, salonId },
    select: { id: true },
  });

  if (!exists) return res.status(404).json({ message: "Serviço não encontrado." });

  await prisma.service.update({
    where: { id },
    data: { isActive: false },
  });

  return res.json({ ok: true });
}

module.exports = {
  listServices,
  createService,
  updateService,
  disableService,
};

const { prisma } = require("../lib/prisma");

function parseISO(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayKeyLocal(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// --------------------
// 1) SUMMARY (mantém como está hoje)
// --------------------
// GET /api/finance/summary?from=ISO&to=ISO
async function financeSummary(req, res) {
  const { salonId } = req.user;

  const from = req.query.from ? parseISO(req.query.from) : null;
  const to = req.query.to ? parseISO(req.query.to) : null;

  if (!from || !to) return res.status(400).json({ message: "Informe from e to em ISO." });
  if (from >= to) return res.status(400).json({ message: "Intervalo inválido: from precisa ser menor que to." });

  const appts = await prisma.appointment.findMany({
    where: {
      salonId,
      status: "FINALIZADO",
      startAt: { gte: from, lt: to },
    },
    orderBy: { startAt: "desc" },
    select: {
      id: true,
      startAt: true,
      client: { select: { name: true } },
      service: { select: { id: true, name: true, price: true } },
    },
  });

  const totalCents = appts.reduce((acc, a) => acc + (a.service?.price || 0), 0);
  const totalCount = appts.length;

  const byDayMap = new Map();
  for (const a of appts) {
    const k = dayKeyLocal(new Date(a.startAt));
    const cur = byDayMap.get(k) || { day: k, totalCents: 0, count: 0 };
    cur.totalCents += a.service?.price || 0;
    cur.count += 1;
    byDayMap.set(k, cur);
  }
  const byDay = Array.from(byDayMap.values()).sort((x, y) => x.day.localeCompare(y.day));

  const byServiceMap = new Map();
  for (const a of appts) {
    const s = a.service;
    if (!s) continue;
    const cur = byServiceMap.get(s.id) || { serviceId: s.id, name: s.name, totalCents: 0, count: 0 };
    cur.totalCents += s.price || 0;
    cur.count += 1;
    byServiceMap.set(s.id, cur);
  }
  const byService = Array.from(byServiceMap.values()).sort((a, b) => b.totalCents - a.totalCents);

  const lastFinalized = appts.slice(0, 10).map((a) => ({
    id: a.id,
    startAt: a.startAt,
    clientName: a.client?.name || "-",
    serviceName: a.service?.name || "-",
    priceCents: a.service?.price || 0,
  }));

  // ✅ extra: já manda o flow também (sem quebrar front antigo)
  const flow = await calcFlow({ salonId, from, to });

  return res.json({
    totals: { totalCents, totalCount },
    byDay,
    byService,
    lastFinalized,
    flow, // { inCents, outCents, balanceCents }
  });
}

// --------------------
// 2) FLOW (PDF: entradas, saídas, saldo)
// --------------------
async function calcFlow({ salonId, from, to }) {
  // Entradas automáticas = FINALIZADO
  const appts = await prisma.appointment.findMany({
    where: { salonId, status: "FINALIZADO", startAt: { gte: from, lt: to } },
    select: { service: { select: { price: true } } },
  });
  const autoIn = appts.reduce((acc, a) => acc + (a.service?.price || 0), 0);

  // Lançamentos manuais
  const tx = await prisma.cashTransaction.findMany({
    where: { salonId, occurredAt: { gte: from, lt: to }, source: "MANUAL" },
    select: { type: true, amountCents: true },
  });

  const manualIn = tx.filter((t) => t.type === "IN").reduce((a, t) => a + (t.amountCents || 0), 0);
  const manualOut = tx.filter((t) => t.type === "OUT").reduce((a, t) => a + (t.amountCents || 0), 0);

  const inCents = autoIn + manualIn;
  const outCents = manualOut;
  const balanceCents = inCents - outCents;

  return { inCents, outCents, balanceCents, autoInCents: autoIn, manualInCents: manualIn, manualOutCents: manualOut };
}

// GET /api/finance/flow?from=ISO&to=ISO
async function financeFlow(req, res) {
  const { salonId } = req.user;

  const from = req.query.from ? parseISO(req.query.from) : null;
  const to = req.query.to ? parseISO(req.query.to) : null;

  if (!from || !to) return res.status(400).json({ message: "Informe from e to em ISO." });
  if (from >= to) return res.status(400).json({ message: "Intervalo inválido: from precisa ser menor que to." });

  const flow = await calcFlow({ salonId, from, to });
  return res.json({ flow });
}

// --------------------
// 3) CATEGORIES
// --------------------
// GET /api/finance/categories
async function listCategories(req, res) {
  const { salonId } = req.user;

  const categories = await prisma.cashCategory.findMany({
    where: { salonId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, createdAt: true },
  });

  return res.json({ categories });
}

// POST /api/finance/categories
async function createCategory(req, res) {
  const { salonId } = req.user;
  const { name, type } = req.body;

  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ message: "Nome da categoria é obrigatório." });
  }

  // type opcional: IN | OUT
  const t = type ? String(type).toUpperCase() : null;
  if (t && t !== "IN" && t !== "OUT") {
    return res.status(400).json({ message: "Tipo de categoria inválido (IN/OUT)." });
  }

  try {
    const category = await prisma.cashCategory.create({
      data: { salonId, name: String(name).trim(), type: t || null },
      select: { id: true, name: true, type: true, createdAt: true },
    });
    return res.status(201).json({ category });
  } catch {
    return res.status(409).json({ message: "Já existe uma categoria com esse nome." });
  }
}

// --------------------
// 4) TRANSACTIONS (manual IN/OUT)
// --------------------
// GET /api/finance/transactions?from=ISO&to=ISO&type=IN|OUT&categoryId=
async function listTransactions(req, res) {
  const { salonId } = req.user;

  const from = req.query.from ? parseISO(req.query.from) : null;
  const to = req.query.to ? parseISO(req.query.to) : null;

  if (!from || !to) return res.status(400).json({ message: "Informe from e to em ISO." });
  if (from >= to) return res.status(400).json({ message: "Intervalo inválido: from precisa ser menor que to." });

  const type = req.query.type ? String(req.query.type).toUpperCase() : null;
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : null;

  const where = {
    salonId,
    occurredAt: { gte: from, lt: to },
    source: "MANUAL",
  };

  if (type) where.type = type;
  if (categoryId) where.categoryId = categoryId;

  const transactions = await prisma.cashTransaction.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    select: {
      id: true,
      type: true,
      source: true,
      name: true,
      occurredAt: true,
      amountCents: true,
      notes: true,
      category: { select: { id: true, name: true } },
      createdAt: true,
    },
  });

  return res.json({ transactions });
}

// POST /api/finance/transactions
async function createTransaction(req, res) {
  const { salonId } = req.user;
  const { type, name, occurredAt, amountCents, categoryId, notes } = req.body;

  const t = String(type || "").toUpperCase();
  if (t !== "IN" && t !== "OUT") return res.status(400).json({ message: "type inválido (IN/OUT)." });

  if (!name || String(name).trim().length < 2) return res.status(400).json({ message: "Nome é obrigatório." });

  const dt = parseISO(occurredAt);
  if (!dt) return res.status(400).json({ message: "occurredAt inválido (use ISO)." });

  const cents = Number(amountCents);
  if (!Number.isFinite(cents) || !Number.isInteger(cents) || cents <= 0) {
    return res.status(400).json({ message: "amountCents inválido (inteiro > 0)." });
  }

  // se categoria veio, valida se é do salão
  if (categoryId) {
    const cat = await prisma.cashCategory.findFirst({ where: { id: categoryId, salonId }, select: { id: true, type: true } });
    if (!cat) return res.status(404).json({ message: "Categoria não encontrada." });
    if (cat.type && cat.type !== t) return res.status(400).json({ message: "Categoria não compatível com o tipo (IN/OUT)." });
  }

  const transaction = await prisma.cashTransaction.create({
    data: {
      salonId,
      type: t,
      source: "MANUAL",
      name: String(name).trim(),
      occurredAt: dt,
      amountCents: cents,
      categoryId: categoryId || null,
      notes: notes ? String(notes).trim() : null,
    },
    select: {
      id: true,
      type: true,
      source: true,
      name: true,
      occurredAt: true,
      amountCents: true,
      notes: true,
      category: { select: { id: true, name: true } },
      createdAt: true,
    },
  });

  return res.status(201).json({ transaction });
}

// PATCH /api/finance/transactions/:id
async function updateTransaction(req, res) {
  const { salonId } = req.user;
  const { id } = req.params;

  const exists = await prisma.cashTransaction.findFirst({
    where: { id, salonId, source: "MANUAL" },
    select: { id: true, type: true },
  });
  if (!exists) return res.status(404).json({ message: "Lançamento não encontrado." });

  const { name, occurredAt, amountCents, categoryId, notes } = req.body;

  const data = {};

  if (name !== undefined) {
    if (!name || String(name).trim().length < 2) return res.status(400).json({ message: "Nome inválido." });
    data.name = String(name).trim();
  }

  if (occurredAt !== undefined) {
    const dt = parseISO(occurredAt);
    if (!dt) return res.status(400).json({ message: "occurredAt inválido (use ISO)." });
    data.occurredAt = dt;
  }

  if (amountCents !== undefined) {
    const cents = Number(amountCents);
    if (!Number.isFinite(cents) || !Number.isInteger(cents) || cents <= 0) {
      return res.status(400).json({ message: "amountCents inválido (inteiro > 0)." });
    }
    data.amountCents = cents;
  }

  if (notes !== undefined) data.notes = notes ? String(notes).trim() : null;

  if (categoryId !== undefined) {
    if (!categoryId) {
      data.categoryId = null;
    } else {
      const cat = await prisma.cashCategory.findFirst({
        where: { id: categoryId, salonId },
        select: { id: true, type: true },
      });
      if (!cat) return res.status(404).json({ message: "Categoria não encontrada." });
      if (cat.type && cat.type !== exists.type) return res.status(400).json({ message: "Categoria não compatível com o tipo (IN/OUT)." });
      data.categoryId = categoryId;
    }
  }

  const transaction = await prisma.cashTransaction.update({
    where: { id },
    data,
    select: {
      id: true,
      type: true,
      source: true,
      name: true,
      occurredAt: true,
      amountCents: true,
      notes: true,
      category: { select: { id: true, name: true } },
      createdAt: true,
    },
  });

  return res.json({ transaction });
}

// DELETE /api/finance/transactions/:id
async function deleteTransaction(req, res) {
  const { salonId } = req.user;
  const { id } = req.params;

  const exists = await prisma.cashTransaction.findFirst({
    where: { id, salonId, source: "MANUAL" },
    select: { id: true },
  });
  if (!exists) return res.status(404).json({ message: "Lançamento não encontrado." });

  await prisma.cashTransaction.delete({ where: { id } });
  return res.json({ ok: true });
}

module.exports = {
  financeSummary,
  financeFlow,
  listCategories,
  createCategory,
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
};

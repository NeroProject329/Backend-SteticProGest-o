const { prisma } = require("../lib/prisma");

function parseISODate(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function dayKeyLocal(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// GET /api/finance/summary?from=ISO&to=ISO
async function financeSummary(req, res) {
  const { salonId } = req.user;

  const from = req.query.from ? parseISODate(req.query.from) : null;
  const to = req.query.to ? parseISODate(req.query.to) : null;

  if (!from || !to) {
    return res.status(400).json({ message: "Informe from e to em ISO (ex: 2026-01-03T00:00:00.000Z)." });
  }
  if (from >= to) {
    return res.status(400).json({ message: "Intervalo inválido: from precisa ser menor que to." });
  }

  // Puxa FINALIZADO no período
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
      client: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, price: true } },
    },
  });

  // Totais
  const totalCents = appts.reduce((acc, a) => acc + (a.service?.price || 0), 0);
  const totalCount = appts.length;

  // Agrupar por dia
  const byDayMap = new Map();
  for (const a of appts) {
    const key = dayKeyLocal(new Date(a.startAt));
    const cur = byDayMap.get(key) || { day: key, totalCents: 0, count: 0 };
    cur.totalCents += a.service?.price || 0;
    cur.count += 1;
    byDayMap.set(key, cur);
  }
  const byDay = Array.from(byDayMap.values()).sort((x, y) => x.day.localeCompare(y.day));

  // Agrupar por serviço
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

  // Últimos 10 finalizados (pra tabela)
  const lastFinalized = appts.slice(0, 10).map((a) => ({
    id: a.id,
    startAt: a.startAt,
    clientName: a.client?.name || "-",
    serviceName: a.service?.name || "-",
    priceCents: a.service?.price || 0,
  }));

  return res.json({
    totals: { totalCents, totalCount },
    byDay,
    byService,
    lastFinalized,
  });
}

module.exports = { financeSummary };

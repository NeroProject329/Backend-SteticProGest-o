const { prisma } = require("../lib/prisma");

function isWithinBusinessHours({ startAt, endAt, salon }) {
  if (!salon.blockOutsideHours) return true;

  if (!salon.openTime || !salon.closeTime || !salon.workingDays) return true;

  const day = startAt.getDay(); // 0 (Dom) → 6 (Sáb)
  if (!salon.workingDays.includes(day)) return false;

  const [openH, openM] = salon.openTime.split(":").map(Number);
  const [closeH, closeM] = salon.closeTime.split(":").map(Number);

  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  const startMinutes = startAt.getHours() * 60 + startAt.getMinutes();
  const endMinutes = endAt.getHours() * 60 + endAt.getMinutes();

  return startMinutes >= openMinutes && endMinutes <= closeMinutes;
}


function parseISODate(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}



async function hasConflict({ salonId, startAt, endAt, excludeId }) {
  // Conflito se existir agendamento no mesmo salão (não cancelado)
  // com intervalo sobreposto: existing.startAt < endAt && existing.endAt > startAt
  const where = {
    salonId,
    status: { not: "CANCELADO" },
    startAt: { lt: endAt },
    endAt: { gt: startAt },
  };

  if (excludeId) where.NOT = { id: excludeId };

  const found = await prisma.appointment.findFirst({
    where,
    select: { id: true },
  });

  return Boolean(found);
}

// GET /api/appointments?from=ISO&to=ISO
async function listAppointments(req, res) {
  const { salonId } = req.user;

  const from = req.query.from ? parseISODate(req.query.from) : null;
  const to = req.query.to ? parseISODate(req.query.to) : null;

  if (!from || !to) {
    return res.status(400).json({ message: "Informe from e to em ISO (ex: 2026-01-03T00:00:00.000Z)." });
  }
  if (from >= to) {
    return res.status(400).json({ message: "Intervalo inválido: from precisa ser menor que to." });
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      salonId,
      startAt: { gte: from, lt: to },
    },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      notes: true,
      createdAt: true,
      client: { select: { id: true, name: true, phone: true } },
      service: { select: { id: true, name: true, durationM: true, price: true } },
    },
  });

  return res.json({ appointments });
}

// POST /api/appointments
// body: { clientId, serviceId, startAt, notes? }
async function createAppointment(req, res) {
  const { salonId } = req.user;
  const { clientId, serviceId, startAt, notes } = req.body;

  if (!clientId || !serviceId || !startAt) {
    return res.status(400).json({ message: "clientId, serviceId e startAt são obrigatórios." });
  }

  const start = parseISODate(startAt);
  if (!start) return res.status(400).json({ message: "startAt inválido (use ISO)." });

  const [client, service] = await Promise.all([
    prisma.client.findFirst({ where: { id: clientId, salonId }, select: { id: true } }),
    prisma.service.findFirst({ where: { id: serviceId, salonId, isActive: true }, select: { id: true, durationM: true } }),
  ]);

  if (!client) return res.status(404).json({ message: "Cliente não encontrado." });
  if (!service) return res.status(404).json({ message: "Serviço não encontrado ou inativo." });

  const end = new Date(start.getTime() + service.durationM * 60 * 1000);

  const salon = await prisma.salon.findUnique({
  where: { id: salonId },
  select: {
    openTime: true,
    closeTime: true,
    workingDays: true,
    blockOutsideHours: true,
  },
});

if (!isWithinBusinessHours({ startAt: start, endAt: end, salon })) {
  return res.status(400).json({
    message: "Agendamento fora do horário de funcionamento.",
  });
}


  const conflict = await hasConflict({ salonId, startAt: start, endAt: end });
  if (conflict) {
    return res.status(409).json({ message: "Conflito de horário: já existe agendamento nesse intervalo." });
  }

  const appointment = await prisma.appointment.create({
    data: {
      salonId,
      clientId,
      serviceId,
      startAt: start,
      endAt: end,
      notes: notes ? String(notes).trim() : null,
      status: "PENDENTE",
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      notes: true,
      client: { select: { id: true, name: true, phone: true } },
      service: { select: { id: true, name: true, durationM: true, price: true } },
    },
  });

  return res.status(201).json({ appointment });
}

// PATCH /api/appointments/:id
// body pode conter: { startAt?, serviceId?, status?, notes?, clientId? }
async function updateAppointment(req, res) {
  const { salonId } = req.user;
  const { id } = req.params;

  const current = await prisma.appointment.findFirst({
    where: { id, salonId },
    select: { id: true, startAt: true, endAt: true, serviceId: true, clientId: true, status: true },
  });
  if (!current) return res.status(404).json({ message: "Agendamento não encontrado." });

  const { startAt, serviceId, status, notes, clientId } = req.body;

  const data = {};

  // valida status
  if (status !== undefined) {
    const allowed = ["PENDENTE", "CONFIRMADO", "FINALIZADO", "CANCELADO"];
    if (!allowed.includes(String(status))) {
      return res.status(400).json({ message: "Status inválido." });
    }
    data.status = String(status);
  }

  if (notes !== undefined) data.notes = notes ? String(notes).trim() : null;

  // troca cliente (opcional)
  if (clientId !== undefined) {
    const client = await prisma.client.findFirst({ where: { id: clientId, salonId }, select: { id: true } });
    if (!client) return res.status(404).json({ message: "Cliente não encontrado." });
    data.clientId = clientId;
  }

  // recalcular intervalo se mudar startAt e/ou serviceId
  let newStart = current.startAt;
  if (startAt !== undefined) {
    const parsed = parseISODate(startAt);
    if (!parsed) return res.status(400).json({ message: "startAt inválido (use ISO)." });
    newStart = parsed;
    data.startAt = parsed;
  }

  let newServiceId = current.serviceId;
  let durationM = null;

  if (serviceId !== undefined) {
    const service = await prisma.service.findFirst({
      where: { id: serviceId, salonId, isActive: true },
      select: { id: true, durationM: true },
    });
    if (!service) return res.status(404).json({ message: "Serviço não encontrado ou inativo." });

    newServiceId = service.id;
    durationM = service.durationM;
    data.serviceId = service.id;
  } else {
    // pega duração do serviço atual se precisar recalcular
    const svc = await prisma.service.findFirst({
      where: { id: newServiceId, salonId },
      select: { durationM: true },
    });
    durationM = svc?.durationM ?? 30;
  }

  // se mexeu em startAt ou serviceId, recalcula endAt e checa conflito
  if (startAt !== undefined || serviceId !== undefined) {
    const newEnd = new Date(newStart.getTime() + durationM * 60 * 1000);
    data.endAt = newEnd;

    const conflict = await hasConflict({
      salonId,
      startAt: newStart,
      endAt: newEnd,
      excludeId: id,
    });

    if (conflict) {
      return res.status(409).json({ message: "Conflito de horário: já existe agendamento nesse intervalo." });
    }

    const salon = await prisma.salon.findUnique({
  where: { id: salonId },
  select: {
    openTime: true,
    closeTime: true,
    workingDays: true,
    blockOutsideHours: true,
  },
});

if (!isWithinBusinessHours({ startAt: newStart, endAt: newEnd, salon })) {
  return res.status(400).json({
    message: "Agendamento fora do horário de funcionamento.",
  });
}

  }

  const appointment = await prisma.appointment.update({
    where: { id },
    data,
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      notes: true,
      client: { select: { id: true, name: true, phone: true } },
      service: { select: { id: true, name: true, durationM: true, price: true } },
    },
  });

  return res.json({ appointment });
}

// DELETE /api/appointments/:id  (hard delete)
async function deleteAppointment(req, res) {
  const { salonId } = req.user;
  const { id } = req.params;

  const exists = await prisma.appointment.findFirst({
    where: { id, salonId },
    select: { id: true },
  });
  if (!exists) return res.status(404).json({ message: "Agendamento não encontrado." });

  await prisma.appointment.delete({ where: { id } });
  return res.json({ ok: true });
}

module.exports = {
  listAppointments,
  createAppointment,
  updateAppointment,
  deleteAppointment,
};

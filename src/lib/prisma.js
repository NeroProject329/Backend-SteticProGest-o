const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não está definida no ambiente.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Se der erro de SSL no Railway, descomenta:
  // ssl: { rejectUnauthorized: false },
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});

module.exports = { prisma };

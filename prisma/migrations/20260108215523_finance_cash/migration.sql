-- CreateEnum
CREATE TYPE "CashType" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CashSource" AS ENUM ('AUTO_APPOINTMENT', 'MANUAL');

-- CreateTable
CREATE TABLE "CashCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CashType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "salonId" TEXT NOT NULL,

    CONSTRAINT "CashCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashTransaction" (
    "id" TEXT NOT NULL,
    "type" "CashType" NOT NULL,
    "source" "CashSource" NOT NULL DEFAULT 'MANUAL',
    "name" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "salonId" TEXT NOT NULL,
    "categoryId" TEXT,
    "appointmentId" TEXT,

    CONSTRAINT "CashTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashCategory_salonId_idx" ON "CashCategory"("salonId");

-- CreateIndex
CREATE UNIQUE INDEX "CashCategory_salonId_name_key" ON "CashCategory"("salonId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CashTransaction_appointmentId_key" ON "CashTransaction"("appointmentId");

-- CreateIndex
CREATE INDEX "CashTransaction_salonId_occurredAt_idx" ON "CashTransaction"("salonId", "occurredAt");

-- CreateIndex
CREATE INDEX "CashTransaction_salonId_type_idx" ON "CashTransaction"("salonId", "type");

-- CreateIndex
CREATE INDEX "CashTransaction_salonId_categoryId_idx" ON "CashTransaction"("salonId", "categoryId");

-- AddForeignKey
ALTER TABLE "CashCategory" ADD CONSTRAINT "CashCategory_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CashCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

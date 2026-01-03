/*
  Warnings:

  - Added the required column `serviceId` to the `Appointment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "serviceId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Appointment_salonId_startAt_idx" ON "Appointment"("salonId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_salonId_clientId_idx" ON "Appointment"("salonId", "clientId");

-- CreateIndex
CREATE INDEX "Appointment_salonId_serviceId_idx" ON "Appointment"("salonId", "serviceId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

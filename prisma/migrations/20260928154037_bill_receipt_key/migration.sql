/*
  Warnings:

  - You are about to drop the column `receipt_url` on the `bills` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "bills" DROP COLUMN "receipt_url",
ADD COLUMN     "receipt_key" TEXT;

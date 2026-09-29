-- AlterTable
ALTER TABLE "bills" ADD COLUMN "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: bill cũ lấy ngày hoá đơn bằng thời điểm tạo bản ghi.
UPDATE "bills" SET "occurred_at" = "created_at";

-- CreateIndex
CREATE INDEX "bills_group_id_occurred_at_idx" ON "bills"("group_id", "occurred_at");

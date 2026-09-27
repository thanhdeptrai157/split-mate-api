-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "receipt_url" TEXT,
    "group_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bill_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_payers" (
    "id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "bill_payers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_item_shares" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "bill_item_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bills_group_id_idx" ON "bills"("group_id");

-- CreateIndex
CREATE INDEX "bills_created_by_id_idx" ON "bills"("created_by_id");

-- CreateIndex
CREATE INDEX "bill_items_bill_id_idx" ON "bill_items"("bill_id");

-- CreateIndex
CREATE INDEX "bill_payers_bill_id_idx" ON "bill_payers"("bill_id");

-- CreateIndex
CREATE INDEX "bill_payers_member_id_idx" ON "bill_payers"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "bill_payers_bill_id_member_id_key" ON "bill_payers"("bill_id", "member_id");

-- CreateIndex
CREATE INDEX "bill_item_shares_item_id_idx" ON "bill_item_shares"("item_id");

-- CreateIndex
CREATE INDEX "bill_item_shares_member_id_idx" ON "bill_item_shares"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "bill_item_shares_item_id_member_id_key" ON "bill_item_shares"("item_id", "member_id");

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payers" ADD CONSTRAINT "bill_payers_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payers" ADD CONSTRAINT "bill_payers_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "group_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_item_shares" ADD CONSTRAINT "bill_item_shares_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "bill_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_item_shares" ADD CONSTRAINT "bill_item_shares_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "group_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

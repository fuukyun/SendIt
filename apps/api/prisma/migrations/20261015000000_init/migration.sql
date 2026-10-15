-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('UPLOADING', 'READY', 'REJECTED', 'EXPIRED', 'DELETED');

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "manage_token_hash" TEXT NOT NULL,
    "title" TEXT,
    "message" TEXT,
    "password_hash" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "max_downloads" INTEGER,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "failed_unlocks" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "status" "TransferStatus" NOT NULL DEFAULT 'UPLOADING',
    "file_name" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "upload_id" TEXT,
    "part_size" INTEGER,
    "part_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "download_events" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "ip_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "download_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transfers_token_hash_key" ON "transfers"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_manage_token_hash_key" ON "transfers"("manage_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_storage_key_key" ON "transfers"("storage_key");

-- CreateIndex
CREATE INDEX "transfers_status_expires_at_idx" ON "transfers"("status", "expires_at");

-- CreateIndex
CREATE INDEX "download_events_transfer_id_created_at_idx" ON "download_events"("transfer_id", "created_at");

-- AddForeignKey
ALTER TABLE "download_events" ADD CONSTRAINT "download_events_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


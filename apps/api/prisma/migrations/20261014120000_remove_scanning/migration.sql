-- Files are published as soon as the upload completes: no type check, no virus scan.

-- Transfers waiting for a scan become downloadable; infected ones were already deleted.
UPDATE "transfers" SET "status" = 'READY' WHERE "status" = 'PROCESSING';
UPDATE "transfers" SET "status" = 'REJECTED' WHERE "status" = 'INFECTED';

ALTER TABLE "transfers"
  DROP COLUMN "content_type",
  DROP COLUMN "detected_type",
  DROP COLUMN "scan_warning",
  DROP COLUMN "scan_result",
  DROP COLUMN "scanned_at";

DROP TYPE "ScanWarning";

-- Postgres cannot drop enum values; recreate the type without PROCESSING and INFECTED.
ALTER TYPE "TransferStatus" RENAME TO "TransferStatus_old";
CREATE TYPE "TransferStatus" AS ENUM ('UPLOADING', 'READY', 'REJECTED', 'EXPIRED', 'DELETED');
ALTER TABLE "transfers" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "transfers" ALTER COLUMN "status" TYPE "TransferStatus" USING ("status"::text::"TransferStatus");
ALTER TABLE "transfers" ALTER COLUMN "status" SET DEFAULT 'UPLOADING';
DROP TYPE "TransferStatus_old";

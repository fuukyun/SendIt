-- CreateEnum
CREATE TYPE "ScanWarning" AS ENUM ('ENCRYPTED', 'LIMITS_EXCEEDED');

-- AlterTable: replace the encrypted flag with a general scan warning, keeping existing values.
ALTER TABLE "transfers" ADD COLUMN "scan_warning" "ScanWarning";
UPDATE "transfers" SET "scan_warning" = 'ENCRYPTED' WHERE "encrypted";
ALTER TABLE "transfers" DROP COLUMN "encrypted";

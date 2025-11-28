/*
  Warnings:

  - You are about to drop the column `disableHomepage` on the `SystemSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CalendarSettings" ALTER COLUMN "defaultColor" SET DEFAULT '#b48ead';

-- AlterTable
ALTER TABLE "SystemSettings" DROP COLUMN "disableHomepage";

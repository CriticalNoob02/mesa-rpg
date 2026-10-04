-- AlterEnum
ALTER TYPE "LogKind" ADD VALUE 'ATTACK';

-- AlterTable
ALTER TABLE "Token" ADD COLUMN     "stats" JSONB;

-- CreateTable
CREATE TABLE "Effect" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "modifiers" JSONB NOT NULL,
    "conditionKey" TEXT,
    "roundsLeft" INTEGER,
    "casterTokenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Effect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Combat" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "turnIndex" INTEGER NOT NULL DEFAULT 0,
    "order" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Combat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Effect_campaignId_idx" ON "Effect"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Combat_campaignId_key" ON "Combat"("campaignId");

-- AddForeignKey
ALTER TABLE "Effect" ADD CONSTRAINT "Effect_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Combat" ADD CONSTRAINT "Combat_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

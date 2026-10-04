-- CreateEnum
CREATE TYPE "PlayerRole" AS ENUM ('GM', 'PLAYER');

-- CreateEnum
CREATE TYPE "LogKind" AS ENUM ('CHAT', 'ROLL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "LogVisibility" AS ENUM ('ALL', 'GM');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "role" "PlayerRole" NOT NULL,
    "nickname" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogEntry" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "kind" "LogKind" NOT NULL,
    "visibility" "LogVisibility" NOT NULL DEFAULT 'ALL',
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_inviteCode_key" ON "Campaign"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "Player_tokenHash_key" ON "Player"("tokenHash");

-- CreateIndex
CREATE INDEX "Player_campaignId_idx" ON "Player"("campaignId");

-- CreateIndex
CREATE INDEX "LogEntry_campaignId_createdAt_idx" ON "LogEntry"("campaignId", "createdAt");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEntry" ADD CONSTRAINT "LogEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

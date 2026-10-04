-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Character_campaignId_idx" ON "Character"("campaignId");

-- CreateIndex
CREATE INDEX "Character_ownerId_idx" ON "Character"("ownerId");

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

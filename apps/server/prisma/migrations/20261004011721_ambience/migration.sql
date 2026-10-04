-- AlterTable
ALTER TABLE "Scene" ADD COLUMN     "ambientAssetId" TEXT,
ADD COLUMN     "audioPlaying" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "audioUrl" TEXT,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "narrationRevealed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Handout" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "assetId" TEXT,
    "recipients" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Handout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Handout_campaignId_idx" ON "Handout"("campaignId");

-- AddForeignKey
ALTER TABLE "Handout" ADD CONSTRAINT "Handout_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

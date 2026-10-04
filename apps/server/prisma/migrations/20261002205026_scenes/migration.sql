-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "activeSceneId" TEXT;

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetId" TEXT,
    "gridSize" INTEGER NOT NULL DEFAULT 70,
    "offsetX" INTEGER NOT NULL DEFAULT 0,
    "offsetY" INTEGER NOT NULL DEFAULT 0,
    "cols" INTEGER NOT NULL DEFAULT 30,
    "rows" INTEGER NOT NULL DEFAULT 20,
    "fogEnabled" BOOLEAN NOT NULL DEFAULT false,
    "revealed" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Token" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "characterId" TEXT,
    "name" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 1,
    "color" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "speed" INTEGER NOT NULL DEFAULT 30,
    "moveSpent" INTEGER NOT NULL DEFAULT 0,
    "diagParity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Asset_campaignId_idx" ON "Asset"("campaignId");

-- CreateIndex
CREATE INDEX "Scene_campaignId_idx" ON "Scene"("campaignId");

-- CreateIndex
CREATE INDEX "Token_sceneId_idx" ON "Token"("sceneId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

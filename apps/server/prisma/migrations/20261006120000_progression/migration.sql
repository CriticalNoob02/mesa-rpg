-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "hpMode" TEXT NOT NULL DEFAULT 'average',
ADD COLUMN     "startLevel" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "abilityRoll" JSONB;

-- Fichas que já existem ficam com o XP mínimo do nível atual.
UPDATE "Character"
SET "xp" = 500 * jsonb_array_length("base"->'levels') * (jsonb_array_length("base"->'levels') - 1)
WHERE jsonb_typeof("base"->'levels') = 'array';

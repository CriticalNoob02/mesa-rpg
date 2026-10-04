import { CharacterSheet } from "@/components/character/CharacterSheet";

export default async function CharacterPage({
  params,
}: PageProps<"/mesa/[id]/personagem/[charId]">) {
  const { charId } = await params;
  return <CharacterSheet characterId={charId} />;
}

import { CharacterWizard } from "@/components/character/CharacterWizard";

export default async function EditCharacterPage({
  params,
}: PageProps<"/mesa/[id]/personagem/[charId]/editar">) {
  const { charId } = await params;
  return <CharacterWizard characterId={charId} />;
}

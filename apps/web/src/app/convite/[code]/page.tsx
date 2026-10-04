import { InviteView } from "@/components/entry/InviteView";

export default async function InvitePage({ params }: PageProps<"/convite/[code]">) {
  const { code } = await params;
  return <InviteView code={code} />;
}

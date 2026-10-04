import { GmLinkView } from "@/components/entry/GmLinkView";

export default async function GmLinkPage({ params }: PageProps<"/gm/[token]">) {
  const { token } = await params;
  return <GmLinkView token={token} />;
}

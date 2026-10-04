import { MesaConnection } from "@/components/mesa/MesaConnection";

export default async function MesaLayout({ children, params }: LayoutProps<"/mesa/[id]">) {
  const { id } = await params;
  return <MesaConnection campaignId={id}>{children}</MesaConnection>;
}

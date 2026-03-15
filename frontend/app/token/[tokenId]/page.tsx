import { TokenDetailScreen } from "../../ui/token-detail-screen";

type TokenDetailPageProps = {
  params: Promise<{
    tokenId: string;
  }>;
};

export default async function TokenDetailPage({ params }: TokenDetailPageProps) {
  const { tokenId } = await params;
  return <TokenDetailScreen tokenId={tokenId} />;
}

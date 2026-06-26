import { TranscribatorApp } from '../../../src/components/transcribator-app';

export default async function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <TranscribatorApp view="videoDetail" videoId={id} />;
}

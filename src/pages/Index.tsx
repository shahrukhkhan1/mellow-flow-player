import { MusicPlayer } from "@/components/MusicPlayer";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const Index = () => {
  return (
    <ErrorBoundary>
      <MusicPlayer />
    </ErrorBoundary>
  );
};

export default Index;

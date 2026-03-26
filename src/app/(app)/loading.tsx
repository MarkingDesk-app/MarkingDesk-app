import { LoadingScreen } from "@/components/ui/loading-state";

export default function AppLoading() {
  return (
    <LoadingScreen
      title="Loading workspace"
      description="Fetching the latest module, marking, and moderation data."
    />
  );
}

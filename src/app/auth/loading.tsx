import { LoadingScreen } from "@/components/ui/loading-state";

export default function AuthLoading() {
  return (
    <LoadingScreen
      title="Loading account flow"
      description="Preparing the next sign-in or account request step."
    />
  );
}

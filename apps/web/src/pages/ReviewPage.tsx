import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FlashcardExperience } from "../components/flashcards/FlashcardExperience.js";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { useAuth } from "../providers/AuthProvider.js";

export function ReviewPage() {
  const { memberships, isLoading: isAuthLoading } = useAuth();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const orgApi = createOrganizationApi(apiClient);

  const orgQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: () => orgApi.listOrganizations(),
  });

  const organizationId =
    orgQuery.data?.items?.[0]?.id ||
    memberships?.[0]?.organization_id;

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const sessionId = searchParams.get("sessionId") || undefined;
  const courseIds = searchParams.get("courses")?.split(",").filter(Boolean) || [];
  const documentIds = searchParams.get("documents")?.split(",").filter(Boolean) || [];
  const rawMode = searchParams.get("mode");
  const mode = rawMode === "exam" ? "exam" : rawMode === "custom" ? "custom" : "normal";
  const customMode = (searchParams.get("customMode") || "weak") as "weak" | "forgotten" | "review_ahead" | "new";
  const aheadDays = searchParams.get("aheadDays") ? parseInt(searchParams.get("aheadDays")!, 10) : 3;
  const limit = searchParams.get("limit")
    ? searchParams.get("limit") === "all"
      ? undefined
      : parseInt(searchParams.get("limit")!, 10)
    : undefined;

  const handleBack = () => {
    navigate("/flashcards");
  };

  if (isAuthLoading || orgQuery.isLoading || !organizationId) {
    return (
      <div className="flex items-center justify-center py-20 min-h-screen bg-[#0b1116]">
        <Loader2 className="w-8 h-8 animate-spin text-[#14b8a6]" />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#0b1116] text-[#e0e6ed] relative overflow-x-hidden">
      <FlashcardExperience
        organizationId={organizationId}
        sessionId={sessionId}
        courseIds={courseIds}
        documentIds={documentIds}
        mode={mode}
        customMode={customMode}
        aheadDays={aheadDays}
        limit={limit}
        onBack={handleBack}
      />
    </div>
  );
}


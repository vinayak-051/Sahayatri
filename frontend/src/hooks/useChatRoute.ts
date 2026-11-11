// The open chat lives in the URL (?userId=…[&userName=…]), so notification and
// profile links open it directly and the device back button returns to the inbox.
import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { isUuid } from "./chatState";

export function useChatRoute(basePath: string) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const params = new URLSearchParams(location.search);
  const requested = params.get("userId");
  const nameHint = params.get("userName") || null;
  const valid = isUuid(requested) && requested !== user?.id;

  useEffect(() => {
    if (requested && user && !valid) {
      toast.error("That conversation link isn't valid.");
      navigate(basePath, { replace: true });
    }
  }, [requested, user, valid, basePath, navigate]);

  const openChat = useCallback(
    (partnerId: string, name?: string | null) => {
      const query = `userId=${partnerId}${name ? `&userName=${encodeURIComponent(name)}` : ""}`;
      navigate(`${basePath}?${query}`, { state: { fromInbox: true } });
    },
    [basePath, navigate],
  );

  const fromInbox = (location.state as { fromInbox?: boolean } | null)?.fromInbox === true;
  const closeChat = useCallback(() => {
    if (fromInbox) navigate(-1);
    else navigate(basePath, { replace: true });
  }, [fromInbox, basePath, navigate]);

  return { partnerId: valid ? requested : null, nameHint, openChat, closeChat };
}

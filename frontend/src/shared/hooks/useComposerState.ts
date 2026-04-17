import { useState } from "react";

export function useComposerState() {
  const [sendTargetMode, setSendTargetMode] = useState<"selected" | "new">("selected");
  const [planMode, setPlanMode] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [composeMessage, setComposeMessage] = useState("");
  const [composeCwdOverride, setComposeCwdOverride] = useState("");

  return {
    sendTargetMode,
    setSendTargetMode,
    planMode,
    setPlanMode,
    selectedProfileId,
    setSelectedProfileId,
    composeMessage,
    setComposeMessage,
    composeCwdOverride,
    setComposeCwdOverride
  };
}

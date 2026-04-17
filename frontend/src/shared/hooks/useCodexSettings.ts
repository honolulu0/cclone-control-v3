import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";

export function useCodexSettings() {
  const queryClient = useQueryClient();

  const snapshotQuery = useQuery({
    queryKey: ["codex-settings"],
    queryFn: api.codexSettings
  });

  const schemaQuery = useQuery({
    queryKey: ["codex-settings-schema"],
    queryFn: api.codexSettingsSchema
  });

  const updateMutation = useMutation({
    mutationFn: api.updateCodexSettings,
    onSuccess: (next) => {
      queryClient.setQueryData(["codex-settings"], next);
      void queryClient.invalidateQueries({ queryKey: ["codex-settings-schema"] });
    }
  });

  return {
    snapshotQuery,
    schemaQuery,
    updateMutation
  };
}

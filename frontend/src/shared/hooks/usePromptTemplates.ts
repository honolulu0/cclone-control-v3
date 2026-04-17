import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import type { TemplateRecord } from "../types";

export function usePromptTemplates() {
  const queryClient = useQueryClient();
  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: async () => (await api.templates()).data
  });

  const createMutation = useMutation({
    mutationFn: (body: Pick<TemplateRecord, "name" | "content" | "tags">) => api.createTemplate(body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["templates"] })
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Pick<TemplateRecord, "name" | "content" | "tags">> }) =>
      api.updateTemplate(id, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["templates"] })
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteTemplate(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["templates"] })
  });

  return {
    templatesQuery,
    createMutation,
    updateMutation,
    deleteMutation
  };
}

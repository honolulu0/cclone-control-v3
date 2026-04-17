import type { V3Store } from "../../db/store";

export function createHistoryService(store: V3Store) {
  return {
    list: () => store.listHistory(),
    record: (input: {
      workspaceId: string | null;
      threadId: string;
      turnId: string | null;
      requestBody: unknown;
      status: string;
    }) => store.recordHistory(input)
  };
}

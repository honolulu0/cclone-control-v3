import { useQuery } from "@tanstack/react-query";

import { api } from "../../shared/api/client";
import { ListRow } from "../../shared/components/ListRow";
import { SectionCard } from "../../shared/components/SectionCard";
import { threadTimeLabel } from "../../shared/utils/time";

export function HistoryPage() {
  const historyQuery = useQuery({
    queryKey: ["history"],
    queryFn: async () => (await api.history()).data
  });

  return (
    <div className="pageGrid">
      <main className="pagePane pagePane-main">
        <SectionCard eyebrow="发送历史" title="发送历史">
          <div className="scrollRegion listStack">
            {(historyQuery.data || []).map((entry) => (
              <ListRow key={entry.id} title={entry.threadId} meta={threadTimeLabel(entry.createdAt)} preview={entry.turnId || "无 turnId"} />
            ))}
          </div>
        </SectionCard>
      </main>
    </div>
  );
}

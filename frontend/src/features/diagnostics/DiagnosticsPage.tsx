import { useQuery } from "@tanstack/react-query";

import { api } from "../../shared/api/client";
import { SectionCard } from "../../shared/components/SectionCard";

export function DiagnosticsPage() {
  const healthQuery = useQuery({ queryKey: ["health"], queryFn: api.health });
  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: api.models });
  const collaborationQuery = useQuery({ queryKey: ["collaboration-modes"], queryFn: api.collaborationModes });

  return (
    <div className="pageGrid">
      <main className="pagePane pagePane-main">
        <SectionCard eyebrow="系统诊断" title="健康检查">
          <pre className="jsonPanel">{JSON.stringify(healthQuery.data || {}, null, 2)}</pre>
        </SectionCard>
        <SectionCard eyebrow="模型" title="模型列表">
          <pre className="jsonPanel">{JSON.stringify(modelsQuery.data || {}, null, 2)}</pre>
        </SectionCard>
      </main>
      <aside className="pagePane pagePane-right">
        <SectionCard eyebrow="协作模式" title="协作模式">
          <pre className="jsonPanel">{JSON.stringify(collaborationQuery.data || {}, null, 2)}</pre>
        </SectionCard>
      </aside>
    </div>
  );
}

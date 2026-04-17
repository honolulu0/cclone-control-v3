import type { V3Store } from "../../db/store";

export function createTemplateService(store: V3Store) {
  return {
    list: () => store.listTemplates(),
    create: (body: { name: string; content: string; tags?: string[] }) => store.createTemplate(body),
    update: (id: string, body: { name?: string; content?: string; tags?: string[] }) => store.updateTemplate(id, body),
    remove: (id: string) => store.deleteTemplate(id)
  };
}

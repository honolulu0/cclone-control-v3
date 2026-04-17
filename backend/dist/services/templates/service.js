"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTemplateService = createTemplateService;
function createTemplateService(store) {
    return {
        list: () => store.listTemplates(),
        create: (body) => store.createTemplate(body),
        update: (id, body) => store.updateTemplate(id, body),
        remove: (id) => store.deleteTemplate(id)
    };
}

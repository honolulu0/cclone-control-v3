"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHistoryService = createHistoryService;
function createHistoryService(store) {
    return {
        list: () => store.listHistory(),
        record: (input) => store.recordHistory(input)
    };
}

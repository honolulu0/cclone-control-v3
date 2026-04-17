"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProfileService = createProfileService;
function createProfileService(store) {
    return {
        list: () => store.listProfiles(),
        read: (id) => store.readProfile(id),
        create: (body) => store.createProfile(body),
        update: (id, body) => store.updateProfile(id, body),
        remove: (id) => store.deleteProfile(id)
    };
}

import type { ProfileRecord, V3Store } from "../../db/store";

export function createProfileService(store: V3Store) {
  return {
    list: () => store.listProfiles(),
    read: (id: string) => store.readProfile(id),
    create: (body: Omit<ProfileRecord, "id" | "createdAt" | "updatedAt">) => store.createProfile(body),
    update: (id: string, body: Partial<Omit<ProfileRecord, "id" | "createdAt" | "updatedAt">>) => store.updateProfile(id, body),
    remove: (id: string) => store.deleteProfile(id)
  };
}

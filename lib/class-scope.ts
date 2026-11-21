import "server-only";
import { accessibleLibraryClasses } from "@/lib/study-library-access";
import type {Profile} from "@/types/database";
export async function scopedClasses(profile:Profile) {
 return accessibleLibraryClasses({profile,userId:profile.id});
}

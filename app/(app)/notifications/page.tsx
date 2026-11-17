import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { NotificationList } from "@/components/notification-list";
export default async function NotificationsPage(){const profile=await requireProfile();const supabase=await createClient();const {data}=await supabase.from("notifications").select("id,type,title,body,href,read_at,created_at").eq("user_id",profile.id).order("created_at",{ascending:false}).limit(50);return <><PageHeader title="Notifications" description="A personal feed of academic activity and important updates."/><NotificationList initial={data??[]}/></>;}

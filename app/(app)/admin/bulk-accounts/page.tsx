import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import BulkAccountManager from "@/components/bulk-account-manager";

export default async function BulkAccountsPage() {
 await requireRole(["admin"]);
 return <><PageHeader title="Bulk Import / Create Accounts" description="Generate demonstration identities, import a spreadsheet, or paste a mixed faculty and student batch."/><BulkAccountManager/></>;
}

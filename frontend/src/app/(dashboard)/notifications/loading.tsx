import { PageSkeleton } from "@/components/page-skeleton";

export default function NotificationsLoading() {
  return <PageSkeleton cards={3} table rows={6} />;
}

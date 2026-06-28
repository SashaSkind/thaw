/** Legacy draft URL redirects to the canonical email review page. */

import { redirect } from "next/navigation";

export default async function LegacyDraftPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;
  redirect(`/email/${draftId}`);
}

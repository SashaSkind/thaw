/** Legacy demo route forwards to the main chat page. */

import { redirect } from "next/navigation";

export default function DemoPage() {
  redirect("/chat");
}

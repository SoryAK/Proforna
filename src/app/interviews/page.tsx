import { redirect } from "next/navigation";

export default function InterviewsPage() {
  redirect("/job-search?tab=interviews");
}

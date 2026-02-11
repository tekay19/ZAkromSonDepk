import { Suspense } from "react";
import DashboardClient from "./DashboardClient";

// Wrap client-side search params usage in Suspense to satisfy Next.js CSR bailout rules.
export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#030303]" />}>
      <DashboardClient />
    </Suspense>
  );
}

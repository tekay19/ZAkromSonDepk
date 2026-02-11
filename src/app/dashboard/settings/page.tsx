import { Suspense } from "react";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[60vh] flex items-center justify-center text-white/60">
          Yükleniyor...
        </div>
      }
    >
      <SettingsClient />
    </Suspense>
  );
}


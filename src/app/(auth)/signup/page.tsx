import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { getDictionary } from "@/lib/i18n";

export const metadata: Metadata = { title: "Ro'yxatdan o'tish" };

export default function SignupPage() {
  const t = getDictionary("uz");
  return (
    <div className="w-full max-w-[400px] rounded-[12px] border border-border bg-bg p-8 shadow-sm">
      <h1 className="mb-6 text-center text-[24px] font-semibold">{t.auth.signupTitle}</h1>
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </div>
  );
}

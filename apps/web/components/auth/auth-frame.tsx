import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { getConfig } from "@/lib/server/services";
import { BrandMark } from "./brand-mark";
import { Spotlight } from "./spotlight";

/**
 * Shell of the sign-in and setup pages: a dim stage with one card in the
 * light. People come here to get in, so nothing competes with the form.
 */
export async function AuthFrame({
  children,
  note,
}: {
  children: ReactNode;
  note: "closedAccess" | "setupNote";
}) {
  const t = await getTranslations("AuthFrame");
  const { appName } = getConfig();

  return (
    <Spotlight>
      <main className="mx-auto flex min-h-svh w-full max-w-[440px] flex-col items-center px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-0">
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-6 py-4 sm:gap-8">
          <div className="flex items-center gap-2.5 text-body">
            <BrandMark name={appName} />
            <span className="text-[16px] font-semibold tracking-[-0.015em]">{appName}</span>
          </div>

          <div className="w-full">
            {/* The light rests on this card; depth comes from light, not shadow. */}
            <div
              data-spot-home
              className="spot-edge spot-sheen w-full rounded-[22px] border border-line bg-card p-6 sm:p-8"
            >
              <div className="relative z-10">{children}</div>
            </div>

            <p className="mt-5 px-2 text-center text-[12px] leading-relaxed text-balance text-[var(--spot-ink)]">
              <Lock
                size={13}
                strokeWidth={2}
                className="me-1.5 inline-block -translate-y-px align-middle"
              />
              {t(note)}
            </p>
          </div>
        </div>
      </main>
    </Spotlight>
  );
}

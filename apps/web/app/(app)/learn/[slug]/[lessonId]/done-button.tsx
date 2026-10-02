"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setLessonDoneAction } from "../../actions";

export function DoneButton({ lessonId, done }: { lessonId: string; done: boolean }) {
  const t = useTranslations("Learn");
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      tone={done ? "secondary" : "primary"}
      size="lg"
      disabled={pending}
      aria-pressed={done}
      onClick={() =>
        start(async () => {
          await setLessonDoneAction(lessonId, !done);
          router.refresh();
        })
      }
    >
      {done ? <Check size={16} strokeWidth={2.25} className="text-success" /> : null}
      {pending ? t("saving") : done ? t("markNotDone") : t("markDone")}
    </Button>
  );
}

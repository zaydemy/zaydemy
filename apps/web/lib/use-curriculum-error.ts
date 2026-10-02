"use client";

import { useTranslations } from "next-intl";
import type { CurriculumError } from "@/app/(app)/programs/actions";

/** Turns a curriculum action's error code into a translated message. */
export function useCurriculumError() {
  const common = useTranslations("Common");
  const errors = useTranslations("Programs.errors");
  const assignments = useTranslations("Programs.assignments");
  return (error: CurriculumError): string => {
    switch (error) {
      case "forbidden":
        return common("forbidden");
      case "not-found":
        return common("notFound");
      case "invalid-title":
        return errors("invalidTitle");
      case "invalid-url":
        return errors("invalidUrl");
      case "slug-taken":
        return errors("slugTaken");
      case "already-assigned":
        return assignments("alreadyAssigned");
      case "prerequisite-self":
        return errors("prerequisite", { reason: "self" });
      case "prerequisite-cycle":
        return errors("prerequisite", { reason: "cycle" });
      case "prerequisite-different-target":
        return errors("prerequisite", { reason: "different-target" });
    }
  };
}

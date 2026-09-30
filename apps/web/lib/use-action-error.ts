"use client";

import { useTranslations } from "next-intl";
import type { ActionError } from "@/app/(app)/organization-actions";

/**
 * Turns an action's error code into a translated message. `scope` picks the
 * wording for errors that mean different things for a class and a person.
 */
export function useActionError(scope: "class" | "person" = "class") {
  const common = useTranslations("Common");
  const classes = useTranslations("Classes.errors");
  const people = useTranslations("People.errors");
  return (error: ActionError): string => {
    switch (error) {
      case "forbidden":
        return common("forbidden");
      case "not-found":
        return common("notFound");
      case "invalid-name":
        return scope === "person" ? people("invalidName") : classes("invalidName");
      case "invalid-color":
        return classes("invalidColor");
      case "invalid-email":
        return people("invalidEmail");
      case "invalid-class":
        return people("invalidClass");
      case "already-member":
        return people("alreadyMember");
    }
  };
}

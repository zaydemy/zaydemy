/** Outcomes shared by organization operations. UI maps them to messages. */
export type Denied = { status: "forbidden" } | { status: "not-found" };

export const forbidden = { status: "forbidden" } as const;
export const notFound = { status: "not-found" } as const;
export const ok = { status: "ok" } as const;

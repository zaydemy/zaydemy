// First-run setup from the command line, for automated installs:
//
//   node core/dist/setup.mjs --name "Ada Lovelace" --email ada@example.com \
//     --organization "Example Academy" [--preset individual|academy|school] [--locale en]
//
// Does the same as the web setup wizard and, like it, only works while no
// account exists. Operator-facing output, so plain English.
import { parseArgs } from "node:util";
import { createDatabase } from "@zaydemy/db";
import { organizationPresets, type OrganizationPreset } from "@zaydemy/db/schema";
import { completeSetup } from "../platform/setup";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    email: { type: "string" },
    organization: { type: "string" },
    preset: { type: "string", default: "academy" },
    locale: { type: "string" },
  },
});

const fail = (message: string): never => {
  console.error(`[setup] ${message}`);
  process.exit(2);
};

const url = process.env.DATABASE_URL ?? fail("DATABASE_URL is not set.");
const name = values.name?.trim() || fail("--name is required.");
const email = values.email?.trim() || fail("--email is required.");
const organizationName = values.organization?.trim() || fail("--organization is required.");
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("--email is not a valid address.");
if (!(organizationPresets as readonly string[]).includes(values.preset!)) {
  fail(`--preset must be one of: ${organizationPresets.join(", ")}.`);
}

const { db, close } = createDatabase(url, { max: 1 });
try {
  const result = await completeSetup(db, {
    name,
    email,
    organizationName,
    preset: values.preset as OrganizationPreset,
    locale: values.locale,
  });
  if (result.status === "already-set-up") {
    console.error("[setup] This instance is already set up; invite people from the app instead.");
    process.exitCode = 1;
  } else {
    console.log(
      `[setup] Created ${email} (platform admin) and "${organizationName}". Sign in with a code sent to that address.`,
    );
  }
} finally {
  await close();
}

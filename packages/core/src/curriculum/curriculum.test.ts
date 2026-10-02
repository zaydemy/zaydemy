import { schema } from "@zaydemy/db";
import {
  addMember,
  addTeamMember,
  createTeam,
  createTwoTenants,
  createUser,
  useTestDatabase,
  type Transaction,
} from "@zaydemy/db/testing";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { resolveTenantContext } from "../tenancy/context";
import { withTenant, type TenantTransaction } from "../tenancy/with-tenant";
import {
  addLesson,
  addSection,
  createProgram,
  deleteLesson,
  deleteProgram,
  getLessonForEditing,
  getProgramOutline,
  listPrograms,
  moveLesson,
  moveSection,
  restoreLessonNote,
  setProgramStatus,
  updateLesson,
  updateProgram,
} from "./authoring";
import {
  assignProgram,
  getEnrollmentAccess,
  listEnrollments,
  removeEnrollment,
  setAccessMode,
  setLessonAccess,
  setLessonVideo,
  setPrerequisite,
} from "./enrollments";
import {
  getLessonForLearner,
  getProgramForLearner,
  listMyPrograms,
  setLessonDone,
} from "./learning";

const database = useTestDatabase();

async function as<T>(
  tx: Transaction,
  userId: string,
  organizationId: string,
  fn: (t: TenantTransaction) => Promise<T>,
) {
  const context = await resolveTenantContext(tx, { userId, organizationId });
  return withTenant(tx, context, fn);
}

/**
 * Tenant A: owner, an instructor teaching `cls` with students `ali` and
 * `veli`, another class with its own instructor, and a published program
 * "HTML" with two sections of two lessons, given to `cls`.
 */
async function school(tx: Transaction) {
  const { a, b } = await createTwoTenants(tx);
  const org = a.org.id;
  const owner = await createUser(tx);
  await addMember(tx, org, owner.id, "owner");
  const veli = await createUser(tx);
  await addMember(tx, org, veli.id, "student");
  await addTeamMember(tx, a.cls.id, veli.id);
  const otherClass = await createTeam(tx, org, { name: "Other" });
  const otherInstructor = await createUser(tx);
  await addMember(tx, org, otherInstructor.id, "instructor");
  await addTeamMember(tx, otherClass.id, otherInstructor.id);

  const html = await build(tx, owner.id, org, "HTML");
  const enrollmentId = await enroll(tx, owner.id, org, html.id, { teamId: a.cls.id });
  return {
    a,
    b,
    org,
    owner,
    instructor: a.instructor,
    ali: a.student,
    veli,
    cls: a.cls,
    otherClass,
    otherInstructor,
    html,
    enrollmentId,
  };
}

/** A published program with sections [2 lessons, 2 lessons]. */
async function build(tx: Transaction, ownerId: string, org: string, title: string) {
  return as(tx, ownerId, org, async (t) => {
    const created = await createProgram(t, { title });
    if (created.status !== "created") throw new Error(created.status);
    const lessons: string[] = [];
    const sections: string[] = [];
    for (const s of ["Basics", "More"]) {
      const section = await addSection(t, created.id, s);
      if (section.status !== "created") throw new Error(section.status);
      sections.push(section.id);
      for (const l of ["One", "Two"]) {
        const lesson = await addLesson(t, section.id, `${s} ${l}`);
        if (lesson.status !== "created") throw new Error(lesson.status);
        lessons.push(lesson.id);
      }
    }
    await setProgramStatus(t, created.id, "published");
    return { id: created.id, slug: created.slug, sections, lessons };
  });
}

async function enroll(
  tx: Transaction,
  actor: string,
  org: string,
  programId: string,
  target: { teamId: string } | { userId: string },
) {
  const result = await as(tx, actor, org, (t) => assignProgram(t, { programId, ...target }));
  if (result.status !== "created") throw new Error(result.status);
  return result.id;
}

const openLessons = async (tx: Transaction, userId: string, org: string, slug: string) => {
  const result = await as(tx, userId, org, (t) => getProgramForLearner(t, slug));
  if (result.status !== "ok") return result.status;
  return result.program.sections.flatMap((s) =>
    s.lessons.filter((l) => l.unlocked).map((l) => l.id),
  );
};

describe("authoring", () => {
  it("lets owners and admins write, staff read, students nothing", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      expect(await as(tx, s.instructor.id, s.org, (t) => createProgram(t, { title: "X" }))).toEqual(
        { status: "forbidden" },
      );
      expect(await as(tx, s.ali.id, s.org, (t) => listPrograms(t))).toEqual({
        status: "forbidden",
      });
      const list = await as(tx, s.instructor.id, s.org, (t) => listPrograms(t));
      expect(list.status === "ok" && list.programs).toMatchObject([
        { title: "HTML", lessons: 4, enrollments: 1, status: "published" },
      ]);
      expect(
        await as(tx, s.instructor.id, s.org, (t) =>
          updateLesson(t, s.html.lessons[0]!, { title: "no" }),
        ),
      ).toEqual({
        status: "forbidden",
      });
    }));

  it("gives each program a unique slug within the organization", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      const again = await as(tx, s.owner.id, s.org, (t) => createProgram(t, { title: "HTML" }));
      expect(again).toMatchObject({ status: "created", slug: "html-2" });
      expect(
        await as(tx, s.owner.id, s.org, (t) => updateProgram(t, s.html.id, { slug: "html-2" })),
      ).toEqual({ status: "slug-taken" });
      expect(
        await as(tx, s.owner.id, s.org, (t) =>
          updateProgram(t, s.html.id, { slug: "Web Temelleri" }),
        ),
      ).toEqual({
        status: "ok",
        slug: "web-temelleri",
      });
    }));

  it("reorders sections and lessons by swapping neighbours", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      const order = async () => {
        const outline = await as(tx, s.owner.id, s.org, (t) => getProgramOutline(t, s.html.slug));
        return outline.status === "ok"
          ? outline.program.sections.map((x) => [x.title, x.lessons.map((l) => l.title)])
          : [];
      };
      await as(tx, s.owner.id, s.org, (t) => moveSection(t, s.html.sections[1]!, -1));
      await as(tx, s.owner.id, s.org, (t) => moveLesson(t, s.html.lessons[0]!, 1));
      // Moving past the edge is a no-op.
      expect(await as(tx, s.owner.id, s.org, (t) => moveLesson(t, s.html.lessons[0]!, 1))).toEqual({
        status: "ok",
      });
      expect(await order()).toEqual([
        ["More", ["More One", "More Two"]],
        ["Basics", ["Basics Two", "Basics One"]],
      ]);
    }));

  it("keeps replaced lesson notes as revisions and restores them", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      const id = s.html.lessons[0]!;
      const save = (note: string) =>
        as(tx, s.owner.id, s.org, (t) => updateLesson(t, id, { note }));
      await save("first");
      await save("second");
      await save("second"); // unchanged: no revision
      const editing = await as(tx, s.owner.id, s.org, (t) => getLessonForEditing(t, id));
      if (editing.status !== "ok") throw new Error(editing.status);
      expect(editing.lesson.note).toBe("second");
      expect(editing.revisions.map((r) => r.note)).toEqual(["first"]);

      expect(
        await as(tx, s.owner.id, s.org, (t) => restoreLessonNote(t, id, editing.revisions[0]!.id)),
      ).toEqual({ status: "ok" });
      const after = await as(tx, s.owner.id, s.org, (t) => getLessonForEditing(t, id));
      if (after.status !== "ok") throw new Error(after.status);
      expect(after.lesson.note).toBe("first");
      // Restoring is an edit: "second" is now a revision too.
      expect(after.revisions.map((r) => r.note).sort()).toEqual(["first", "second"]);
      // A revision of another lesson cannot be applied here.
      expect(
        await as(tx, s.owner.id, s.org, (t) =>
          restoreLessonNote(t, s.html.lessons[1]!, editing.revisions[0]!.id),
        ),
      ).toEqual({
        status: "not-found",
      });
    }));

  it("validates lesson fields", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      const id = s.html.lessons[0]!;
      expect(
        await as(tx, s.owner.id, s.org, (t) =>
          updateLesson(t, id, { videoUrl: "javascript:alert(1)" }),
        ),
      ).toEqual({
        status: "invalid-url",
      });
      expect(await as(tx, s.owner.id, s.org, (t) => updateLesson(t, id, { title: "  " }))).toEqual({
        status: "invalid-title",
      });
      expect(
        await as(tx, s.owner.id, s.org, (t) =>
          updateLesson(t, id, { videoUrl: "https://video.example/1", durationMinutes: 45 }),
        ),
      ).toEqual({
        status: "ok",
      });
    }));

  it("warns before deleting content with progress or enrollments", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      const lessonId = s.html.lessons[0]!;
      await as(tx, s.ali.id, s.org, (t) => setLessonDone(t, lessonId, true));
      expect(await as(tx, s.owner.id, s.org, (t) => deleteLesson(t, lessonId))).toMatchObject({
        status: "in-use",
        completions: 1,
      });
      expect(await as(tx, s.owner.id, s.org, (t) => deleteProgram(t, s.html.id))).toMatchObject({
        status: "in-use",
        enrollments: 1,
      });
      expect(
        await as(tx, s.owner.id, s.org, (t) => deleteProgram(t, s.html.id, { force: true })),
      ).toEqual({ status: "ok" });
      expect(await tx.select().from(schema.lessonProgress)).toEqual([]);
    }));

  it("cannot reach another tenant's curriculum", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      const bOwner = await createUser(tx);
      await addMember(tx, s.b.org.id, bOwner.id, "owner");
      expect(await as(tx, bOwner.id, s.b.org.id, (t) => getProgramOutline(t, s.html.slug))).toEqual(
        { status: "not-found" },
      );
      expect(
        await as(tx, bOwner.id, s.b.org.id, (t) =>
          updateLesson(t, s.html.lessons[0]!, { title: "hijack" }),
        ),
      ).toEqual({
        status: "not-found",
      });
      expect(
        await as(tx, bOwner.id, s.b.org.id, (t) =>
          assignProgram(t, { programId: s.html.id, teamId: s.b.cls.id }),
        ),
      ).toEqual({
        status: "not-found",
      });
    }));
});

describe("enrollments", () => {
  it("lets instructors manage enrollments of their own classes and students only", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      const css = await build(tx, s.owner.id, s.org, "CSS");
      expect(
        await as(tx, s.instructor.id, s.org, (t) =>
          assignProgram(t, { programId: css.id, teamId: s.cls.id }),
        ),
      ).toMatchObject({
        status: "created",
      });
      expect(
        await as(tx, s.instructor.id, s.org, (t) =>
          assignProgram(t, { programId: css.id, teamId: s.cls.id }),
        ),
      ).toEqual({
        status: "already-assigned",
      });
      expect(
        await as(tx, s.instructor.id, s.org, (t) =>
          assignProgram(t, { programId: css.id, teamId: s.otherClass.id }),
        ),
      ).toEqual({
        status: "forbidden",
      });
      expect(
        await as(tx, s.instructor.id, s.org, (t) =>
          assignProgram(t, { programId: css.id, userId: s.ali.id }),
        ),
      ).toMatchObject({
        status: "created",
      });
      expect(
        await as(tx, s.otherInstructor.id, s.org, (t) =>
          setAccessMode(t, s.enrollmentId, "selected"),
        ),
      ).toEqual({ status: "forbidden" });
      expect(
        await as(tx, s.ali.id, s.org, (t) =>
          assignProgram(t, { programId: css.id, userId: s.ali.id }),
        ),
      ).toEqual({ status: "forbidden" });

      const mine = await as(tx, s.instructor.id, s.org, (t) => listEnrollments(t));
      const theirs = await as(tx, s.otherInstructor.id, s.org, (t) => listEnrollments(t));
      expect(mine.status === "ok" && mine.enrollments).toHaveLength(3);
      expect(theirs.status === "ok" && theirs.enrollments).toHaveLength(0);
    }));

  it("validates prerequisites", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      const css = await build(tx, s.owner.id, s.org, "CSS");
      const cssId = await enroll(tx, s.owner.id, s.org, css.id, { teamId: s.cls.id });
      const otherId = await enroll(tx, s.owner.id, s.org, css.id, { teamId: s.otherClass.id });
      const set = (id: string, requires: string | null) =>
        as(tx, s.owner.id, s.org, (t) => setPrerequisite(t, id, requires));

      expect(await set(cssId, s.enrollmentId)).toEqual({ status: "ok" });
      expect(await set(s.enrollmentId, cssId)).toEqual({
        status: "invalid-prerequisite",
        reason: "cycle",
      });
      expect(await set(cssId, cssId)).toEqual({ status: "invalid-prerequisite", reason: "self" });
      expect(await set(cssId, otherId)).toEqual({
        status: "invalid-prerequisite",
        reason: "different-target",
      });
      expect(await set(cssId, null)).toEqual({ status: "ok" });
    }));
});

describe("lesson access", () => {
  it("opens everything by default", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      expect(await openLessons(tx, s.ali.id, s.org, s.html.slug)).toEqual(s.html.lessons);
    }));

  it("locks everything in 'selected' mode until lessons are opened", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      await as(tx, s.instructor.id, s.org, (t) => setAccessMode(t, s.enrollmentId, "selected"));
      expect(await openLessons(tx, s.ali.id, s.org, s.html.slug)).toEqual([]);
      await as(tx, s.instructor.id, s.org, (t) =>
        setLessonAccess(t, s.enrollmentId, { lessonId: s.html.lessons[1]! }, true),
      );
      await as(tx, s.instructor.id, s.org, (t) =>
        setLessonAccess(t, s.enrollmentId, { sectionId: s.html.sections[1]! }, true),
      );
      expect(await openLessons(tx, s.ali.id, s.org, s.html.slug)).toEqual(s.html.lessons.slice(1));
    }));

  it("closes single lessons in 'open' mode, and a null override returns to the default", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      const lessonId = s.html.lessons[2]!;
      await as(tx, s.instructor.id, s.org, (t) =>
        setLessonAccess(t, s.enrollmentId, { lessonId }, false),
      );
      expect(await openLessons(tx, s.ali.id, s.org, s.html.slug)).not.toContain(lessonId);
      const access = await as(tx, s.instructor.id, s.org, (t) =>
        getEnrollmentAccess(t, s.enrollmentId),
      );
      expect(
        access.status === "ok" && access.lessons.find((l) => l.lessonId === lessonId),
      ).toMatchObject({ override: false, unlocked: false });

      await as(tx, s.instructor.id, s.org, (t) =>
        setLessonAccess(t, s.enrollmentId, { lessonId }, null),
      );
      expect(await openLessons(tx, s.ali.id, s.org, s.html.slug)).toContain(lessonId);
      // The neutral row is not kept.
      expect(await tx.select().from(schema.enrollmentLesson)).toEqual([]);
    }));

  it("lets the open enrollment win when two enrollments disagree", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      const lessonId = s.html.lessons[0]!;
      await as(tx, s.instructor.id, s.org, (t) =>
        setLessonAccess(t, s.enrollmentId, { lessonId }, false),
      );
      expect(await openLessons(tx, s.ali.id, s.org, s.html.slug)).not.toContain(lessonId);
      // The same program given to Ali personally, open.
      await enroll(tx, s.owner.id, s.org, s.html.id, { userId: s.ali.id });
      expect(await openLessons(tx, s.ali.id, s.org, s.html.slug)).toContain(lessonId);
      // Veli only has the class enrollment.
      expect(await openLessons(tx, s.veli.id, s.org, s.html.slug)).not.toContain(lessonId);
    }));

  it("hides programs and lessons from people they were not given to", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      const outsider = await createUser(tx);
      await addMember(tx, s.org, outsider.id, "student");
      expect(await openLessons(tx, outsider.id, s.org, s.html.slug)).toBe("not-found");
      expect(
        await as(tx, outsider.id, s.org, (t) => getLessonForLearner(t, s.html.lessons[0]!)),
      ).toEqual({ status: "not-found" });
      expect(await as(tx, outsider.id, s.org, (t) => listMyPrograms(t))).toEqual([]);
      // Joining the class later is enough.
      await addTeamMember(tx, s.cls.id, outsider.id);
      expect(await openLessons(tx, outsider.id, s.org, s.html.slug)).toEqual(s.html.lessons);
    }));

  it("hides drafts and unpublished lessons from students but not from staff", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      const hidden = s.html.lessons[3]!;
      await as(tx, s.owner.id, s.org, (t) => updateLesson(t, hidden, { published: false }));
      expect(await openLessons(tx, s.ali.id, s.org, s.html.slug)).toEqual(
        s.html.lessons.slice(0, 3),
      );
      expect(await as(tx, s.ali.id, s.org, (t) => getLessonForLearner(t, hidden))).toEqual({
        status: "not-found",
      });
      const preview = await as(tx, s.instructor.id, s.org, (t) => getLessonForLearner(t, hidden));
      expect(preview.status === "ok" && preview.lesson.preview).toBe(true);

      await as(tx, s.owner.id, s.org, (t) => setProgramStatus(t, s.html.id, "draft"));
      expect(await openLessons(tx, s.ali.id, s.org, s.html.slug)).toBe("not-found");
      expect(await as(tx, s.ali.id, s.org, (t) => listMyPrograms(t))).toEqual([]);
      expect(await openLessons(tx, s.instructor.id, s.org, s.html.slug)).toEqual(s.html.lessons);
    }));
});

describe("class-specific video", () => {
  const video = async (tx: Transaction, userId: string, org: string, lessonId: string) => {
    const result = await as(tx, userId, org, (t) => getLessonForLearner(t, lessonId));
    return result.status === "ok" ? result.lesson.videoUrl : result.status;
  };

  it("uses the lesson's own video unless the enrollment sets one", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      const lessonId = s.html.lessons[0]!;
      await as(tx, s.owner.id, s.org, (t) =>
        updateLesson(t, lessonId, { videoUrl: "https://v.example/lesson" }),
      );
      expect(await video(tx, s.ali.id, s.org, lessonId)).toBe("https://v.example/lesson");
      await as(tx, s.instructor.id, s.org, (t) =>
        setLessonVideo(t, s.enrollmentId, lessonId, "https://v.example/class"),
      );
      expect(await video(tx, s.ali.id, s.org, lessonId)).toBe("https://v.example/class");
      expect(
        await as(tx, s.instructor.id, s.org, (t) =>
          setLessonVideo(t, s.enrollmentId, lessonId, "ftp://x"),
        ),
      ).toEqual({
        status: "invalid-url",
      });
    }));

  it("does not let an empty personal setting hide the class's video", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      const lessonId = s.html.lessons[0]!;
      await as(tx, s.instructor.id, s.org, (t) =>
        setLessonVideo(t, s.enrollmentId, lessonId, "https://v.example/class"),
      );
      const personal = await enroll(tx, s.owner.id, s.org, s.html.id, { userId: s.ali.id });
      await as(tx, s.owner.id, s.org, (t) => setLessonAccess(t, personal, { lessonId }, true));
      expect(await video(tx, s.ali.id, s.org, lessonId)).toBe("https://v.example/class");
      await as(tx, s.owner.id, s.org, (t) =>
        setLessonVideo(t, personal, lessonId, "https://v.example/personal"),
      );
      expect(await video(tx, s.ali.id, s.org, lessonId)).toBe("https://v.example/personal");
    }));
});

describe("progress", () => {
  const progress = async (tx: Transaction, userId: string, org: string) =>
    (await as(tx, userId, org, (t) => listMyPrograms(t))).map((p) => [
      p.title,
      p.doneLessons,
      p.totalLessons,
      p.locked,
      p.lockedBy,
    ]);

  it("counts only open lessons, in both numerator and denominator", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      await as(tx, s.ali.id, s.org, (t) => setLessonDone(t, s.html.lessons[0]!, true));
      await as(tx, s.ali.id, s.org, (t) => setLessonDone(t, s.html.lessons[0]!, true)); // idempotent
      expect(await progress(tx, s.ali.id, s.org)).toEqual([["HTML", 1, 4, false, null]]);

      // Two lessons get locked, one of them already completed.
      await as(tx, s.instructor.id, s.org, (t) =>
        setLessonAccess(t, s.enrollmentId, { sectionId: s.html.sections[0]! }, false),
      );
      expect(await progress(tx, s.ali.id, s.org)).toEqual([["HTML", 0, 2, false, null]]);

      await as(tx, s.ali.id, s.org, (t) => setLessonDone(t, s.html.lessons[2]!, true));
      await as(tx, s.ali.id, s.org, (t) => setLessonDone(t, s.html.lessons[2]!, false));
      expect(await progress(tx, s.ali.id, s.org)).toEqual([["HTML", 0, 2, false, null]]);
    }));

  it("refuses to complete locked lessons and does not track staff previews", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      await as(tx, s.instructor.id, s.org, (t) =>
        setLessonAccess(t, s.enrollmentId, { lessonId: s.html.lessons[0]! }, false),
      );
      expect(
        await as(tx, s.ali.id, s.org, (t) => setLessonDone(t, s.html.lessons[0]!, true)),
      ).toEqual({ status: "not-found" });
      expect(
        await as(tx, s.instructor.id, s.org, (t) => setLessonDone(t, s.html.lessons[1]!, true)),
      ).toEqual({ status: "forbidden" });
      expect(await tx.select().from(schema.lessonProgress)).toEqual([]);
    }));

  it("locks a program until its prerequisite is finished", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      const css = await build(tx, s.owner.id, s.org, "CSS");
      const cssId = await enroll(tx, s.owner.id, s.org, css.id, { teamId: s.cls.id });
      await as(tx, s.owner.id, s.org, (t) => setPrerequisite(t, cssId, s.enrollmentId));

      expect(await progress(tx, s.ali.id, s.org)).toEqual([
        ["HTML", 0, 4, false, null],
        ["CSS", 0, 4, true, "HTML"],
      ]);
      expect(await openLessons(tx, s.ali.id, s.org, css.slug)).toEqual([]);
      expect(await as(tx, s.ali.id, s.org, (t) => getLessonForLearner(t, css.lessons[0]!))).toEqual(
        { status: "not-found" },
      );

      for (const id of s.html.lessons)
        await as(tx, s.ali.id, s.org, (t) => setLessonDone(t, id, true));
      expect(await progress(tx, s.ali.id, s.org)).toEqual([
        ["HTML", 4, 4, false, null],
        ["CSS", 0, 4, false, null],
      ]);
      expect(await openLessons(tx, s.ali.id, s.org, css.slug)).toEqual(css.lessons);
      // Veli has not finished HTML: still locked for him.
      expect((await progress(tx, s.veli.id, s.org))[1]).toEqual(["CSS", 0, 4, true, "HTML"]);
    }));

  it("does not treat a prerequisite with no open lessons as finished", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      const css = await build(tx, s.owner.id, s.org, "CSS");
      const cssId = await enroll(tx, s.owner.id, s.org, css.id, { teamId: s.cls.id });
      await as(tx, s.owner.id, s.org, (t) => setPrerequisite(t, cssId, s.enrollmentId));
      await as(tx, s.owner.id, s.org, (t) => setAccessMode(t, s.enrollmentId, "selected"));
      expect((await progress(tx, s.ali.id, s.org))[1]).toEqual(["CSS", 0, 4, true, "HTML"]);
    }));

  it("keeps progress when a program is taken back and given again", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      await as(tx, s.ali.id, s.org, (t) => setLessonDone(t, s.html.lessons[0]!, true));
      await as(tx, s.owner.id, s.org, (t) => removeEnrollment(t, s.enrollmentId));
      expect(await progress(tx, s.ali.id, s.org)).toEqual([]);
      await enroll(tx, s.owner.id, s.org, s.html.id, { teamId: s.cls.id });
      expect(await progress(tx, s.ali.id, s.org)).toEqual([["HTML", 1, 4, false, null]]);
    }));
});

describe("tenant boundary", () => {
  it("does not show a learner another tenant's lesson, even with its id", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      expect(
        await as(tx, s.b.student.id, s.b.org.id, (t) => getLessonForLearner(t, s.html.lessons[0]!)),
      ).toEqual({
        status: "not-found",
      });
      const rows = await as(tx, s.b.student.id, s.b.org.id, (t) => t.select().from(schema.lesson));
      expect(rows).toEqual([]);
    }));

  it("refuses an enrollment whose class belongs to another tenant at the database level", () =>
    database.rollback(async (tx) => {
      const s = await school(tx);
      await expect(
        tx.transaction((sp) =>
          sp
            .insert(schema.enrollment)
            .values({ organizationId: s.org, programId: s.html.id, teamId: s.b.cls.id }),
        ),
      ).rejects.toThrow();
      const rows = await tx
        .select()
        .from(schema.enrollment)
        .where(eq(schema.enrollment.teamId, s.b.cls.id));
      expect(rows).toEqual([]);
    }));
});

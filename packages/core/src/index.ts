export { canAccessClass, listAccessibleClasses, seesAllClasses } from "./tenancy/access";
export { NotAMemberError, resolveTenantContext, type TenantContext } from "./tenancy/context";
export { contextOf, withTenant, type TenantTransaction } from "./tenancy/with-tenant";
export { isRateLimited, pruneRateLimitHits, type RateLimitRule } from "./platform/rate-limit";
export {
  completeSetup,
  isSetupRequired,
  isTimeZone,
  slugify,
  type SetupInput,
  type SetupResult,
} from "./platform/setup";
export { updateOwnProfile, type ProfileUpdate, type ProfileUpdateResult } from "./account/profile";
export {
  createClass,
  deleteClass,
  getClassRoster,
  listClassOverview,
  normalizeColor,
  setClassArchived,
  updateClass,
  type ClassInput,
  type ClassOverview,
  type ClassRoster,
} from "./organization/classes";
export {
  addPerson,
  addToClass,
  listPeople,
  removeFromClass,
  removeMembers,
  setMemberRole,
  setMemberStatus,
  type AddPersonInput,
  type AddPersonResult,
  type PeopleFilter,
  type PersonRow,
} from "./organization/people";
export type { Denied } from "./organization/results";
export {
  assignableRoles,
  canManageMember,
  isStaff,
  managesOrganization,
} from "./tenancy/permissions";
export {
  addLesson,
  addSection,
  createProgram,
  deleteLesson,
  deleteProgram,
  deleteSection,
  getLessonForEditing,
  getProgramOutline,
  listPrograms,
  moveLesson,
  moveSection,
  renameSection,
  restoreLessonNote,
  setProgramStatus,
  updateLesson,
  updateProgram,
  type LessonPatch,
  type ProgramOutline,
  type ProgramSummary,
} from "./curriculum/authoring";
export {
  assignProgram,
  getEnrollmentAccess,
  listEnrollments,
  removeEnrollment,
  setAccessMode,
  setLessonAccess,
  setLessonVideo,
  setPrerequisite,
  type EnrollmentLessonState,
  type EnrollmentRow,
} from "./curriculum/enrollments";
export {
  getLessonForLearner,
  getProgramForLearner,
  listMyPrograms,
  setLessonDone,
  type LearnerLesson,
  type LearnerLessonContent,
  type LearnerProgram,
  type ProgramProgress,
} from "./curriculum/learning";
export {
  checkPrerequisite,
  type EnrollmentNode,
  type PrerequisiteCheck,
} from "./curriculum/prerequisite";
export { toEmbedUrl } from "./curriculum/video";

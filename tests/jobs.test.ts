import { describe, expect, it } from "vitest";
import { canAccessJob } from "../src/lib/jobs";

describe("canAccessJob", () => {
  it("lets an owner read their own job", () => {
    expect(canAccessJob({ user_id: "user_abc" }, "user_abc")).toBe(true);
  });

  it("hides an owned job from another signed-in user", () => {
    expect(canAccessJob({ user_id: "user_abc" }, "user_xyz")).toBe(false);
  });

  it("hides an owned job from a signed-out visitor", () => {
    expect(canAccessJob({ user_id: "user_abc" }, null)).toBe(false);
  });

  // Email-originated jobs have no Clerk user, and the emailed download link carries
  // no session — the job UUID is the only credential they can have.
  it("keeps an ownerless job readable by anyone holding the id", () => {
    expect(canAccessJob({ user_id: null }, null)).toBe(true);
    expect(canAccessJob({ user_id: null }, "user_abc")).toBe(true);
  });
});

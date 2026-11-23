import { z } from "zod";

export const usernameSchema = z.string().trim().toLowerCase().regex(
  /^[a-z0-9_]{3,30}$/,
  "Use 3–30 letters, numbers or underscores.",
);

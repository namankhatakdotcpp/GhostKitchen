/**
 * Zod validation schemas for authentication
 * 
 * WHY Zod:
 * - Runtime type safety
 * - Clear error messages
 * - Composable schemas
 * - Works with TypeScript
 * 
 * WHY separate schemas:
 * - Single Responsibility Principle
 * - Reusable across API + inputs
 * - Easy to maintain and update
 */

import { z } from "zod";

// Base schemas for common fields
const emailSchema = z
  .string()
  .email("Invalid email address")
  .toLowerCase()
  .trim();

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password should not exceed 128 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const nameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name should not exceed 100 characters")
  .trim();

const phoneSchema = z
  .string()
  .regex(/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/, "Invalid phone number")
  .optional()
  .nullable();

const roleSchema = z.enum(["CUSTOMER", "SHOPKEEPER", "DELIVERY", "ADMIN"]);

// Register validation schema
export const registerSchema = z.object({
  body: z.object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    phone: phoneSchema,
    role: roleSchema.default("CUSTOMER"),
  }),
});

// Login validation schema
export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string().min(1, "Password is required"),
  }),
});

// Refresh token validation schema
export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, "Refresh token is required"),
  }),
});

// Update profile validation schema
export const updateProfileSchema = z.object({
  body: z.object({
    name: nameSchema.optional(),
    phone: phoneSchema.optional(),
  }),
});

// Change password validation schema
export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  }),
});

/**
 * Type Validators - Used by TypeScript consumers
 * 
 * These can be used to extract types from Zod schemas:
 * @example
 * const input: RegisterInput = { email: "test@example.com", ... };
 * 
 * For TypeScript files:
 * import { registerSchema } from "./auth.schema.js";
 * export type RegisterInput = z.infer<typeof registerSchema>;
 */

// Note: Type definitions should be in a .d.ts file or TypeScript consumer files
// These JSDoc comments document the Zod schemas for reference

// Validation middleware helper
export const validate = (schema) => (req, res, next) => {
  try {
    const validatedData = schema.parse({
      body: req.body,
    });
    req.validated = validatedData;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errorMessages,
      });
    }
    next(error);
  }
};

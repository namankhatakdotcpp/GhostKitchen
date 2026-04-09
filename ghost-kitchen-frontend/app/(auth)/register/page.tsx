/**
 * Signup Page (Register)
 * 
 * Features:
 * - Full name, email, password, phone inputs
 * - Password strength validation (8+ chars, uppercase, lowercase, number)
 * - Role selection (CUSTOMER, SHOPKEEPER, DELIVERY, ADMIN)
 * - Error handling
 * - Loading states
 * - Responsive design
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import { z } from "zod";

// Validation schema
const signupSchema = z
  .object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name should not exceed 100 characters"),
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string(),
    phone: z
      .string()
      .regex(
        /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/,
        "Invalid phone number"
      )
      .optional()
      .or(z.literal("")),
    role: z.enum(["CUSTOMER", "SHOPKEEPER", "DELIVERY", "ADMIN"]).default("CUSTOMER"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type SignupInput = z.infer<typeof signupSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading, error, clearError } = useAuthStore();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    role: "CUSTOMER" as const,
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Check password strength
  const checkPasswordStrength = (pwd: string) => {
    const strength = {
      length: pwd.length >= 8,
      uppercase: /[A-Z]/.test(pwd),
      lowercase: /[a-z]/.test(pwd),
      number: /[0-9]/.test(pwd),
    };
    return strength;
  };

  const passwordStrength = checkPasswordStrength(formData.password);
  const allCriteriaMet = Object.values(passwordStrength).every((v) => v);

  // Handle input change
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error for this field when user starts typing
    if (validationErrors[name]) {
      setValidationErrors((prev) => ({ ...prev, [name]: "" }));
    }
    setSubmitError(null);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors({});
    setSubmitError(null);

    // Validate input
    const validation = signupSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        errors[err.path[0] as string] = err.message;
      });
      setValidationErrors(errors);
      return;
    }

    try {
      clearError();
      await register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        phone: formData.phone || undefined,
        role: formData.role,
      });
      // Redirect to dashboard on success
      router.push("/");
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || "Registration failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">🍕 GhostKitchen</h1>
          <h2 className="mt-6 text-2xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-orange-600 hover:text-orange-500">
              Sign in
            </Link>
          </p>
        </div>

        {/* Error Messages */}
        {submitError && (
          <div className="rounded-md bg-red-50 p-4 border border-red-200">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 p-4 border border-red-200">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Name Field */}
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={formData.name}
                onChange={handleInputChange}
                className={`relative block w-full appearance-none rounded-md border px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-orange-500 focus:outline-none focus:ring-orange-500 sm:text-sm ${
                  validationErrors.name ? "border-red-300" : "border-gray-300"
                }`}
                placeholder="John Doe"
              />
              {validationErrors.name && (
                <p className="mt-1 text-sm text-red-600">{validationErrors.name}</p>
              )}
            </div>

            {/* Email Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={handleInputChange}
                className={`relative block w-full appearance-none rounded-md border px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-orange-500 focus:outline-none focus:ring-orange-500 sm:text-sm ${
                  validationErrors.email ? "border-red-300" : "border-gray-300"
                }`}
                placeholder="you@example.com"
              />
              {validationErrors.email && (
                <p className="mt-1 text-sm text-red-600">{validationErrors.email}</p>
              )}
            </div>

            {/* Phone Field */}
            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Phone Number (Optional)
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={formData.phone}
                onChange={handleInputChange}
                className={`relative block w-full appearance-none rounded-md border px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-orange-500 focus:outline-none focus:ring-orange-500 sm:text-sm ${
                  validationErrors.phone ? "border-red-300" : "border-gray-300"
                }`}
                placeholder="+91 9876543210"
              />
              {validationErrors.phone && (
                <p className="mt-1 text-sm text-red-600">{validationErrors.phone}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={formData.password}
                onChange={handleInputChange}
                className={`relative block w-full appearance-none rounded-md border px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-orange-500 focus:outline-none focus:ring-orange-500 sm:text-sm ${
                  validationErrors.password ? "border-red-300" : "border-gray-300"
                }`}
                placeholder="••••••••"
              />
              {validationErrors.password && (
                <p className="mt-1 text-sm text-red-600">{validationErrors.password}</p>
              )}

              {/* Password Strength Indicator */}
              {formData.password && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-gray-700">Password must include:</p>
                  <div className="space-y-1">
                    <div className="flex items-center text-xs">
                      <span
                        className={`inline-block w-2 h-2 rounded-full mr-2 ${
                          passwordStrength.length ? "bg-green-500" : "bg-gray-300"
                        }`}
                      ></span>
                      <span className={passwordStrength.length ? "text-green-700" : "text-gray-500"}>
                        At least 8 characters
                      </span>
                    </div>
                    <div className="flex items-center text-xs">
                      <span
                        className={`inline-block w-2 h-2 rounded-full mr-2 ${
                          passwordStrength.uppercase ? "bg-green-500" : "bg-gray-300"
                        }`}
                      ></span>
                      <span
                        className={
                          passwordStrength.uppercase ? "text-green-700" : "text-gray-500"
                        }
                      >
                        Upper case letter
                      </span>
                    </div>
                    <div className="flex items-center text-xs">
                      <span
                        className={`inline-block w-2 h-2 rounded-full mr-2 ${
                          passwordStrength.lowercase ? "bg-green-500" : "bg-gray-300"
                        }`}
                      ></span>
                      <span
                        className={
                          passwordStrength.lowercase ? "text-green-700" : "text-gray-500"
                        }
                      >
                        Lower case letter
                      </span>
                    </div>
                    <div className="flex items-center text-xs">
                      <span
                        className={`inline-block w-2 h-2 rounded-full mr-2 ${
                          passwordStrength.number ? "bg-green-500" : "bg-gray-300"
                        }`}
                      ></span>
                      <span className={passwordStrength.number ? "text-green-700" : "text-gray-500"}>
                        Number
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password Field */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={formData.confirmPassword}
                onChange={handleInputChange}
                className={`relative block w-full appearance-none rounded-md border px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-orange-500 focus:outline-none focus:ring-orange-500 sm:text-sm ${
                  validationErrors.confirmPassword
                    ? "border-red-300"
                    : "border-gray-300"
                }`}
                placeholder="••••••••"
              />
              {validationErrors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">
                  {validationErrors.confirmPassword}
                </p>
              )}
            </div>

            {/* Role Selection */}
            <div>
              <label
                htmlFor="role"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Account Type
              </label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleInputChange}
                className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-orange-500 focus:outline-none focus:ring-orange-500 sm:text-sm"
              >
                <option value="CUSTOMER">Customer</option>
                <option value="SHOPKEEPER">Restaurant Owner</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Select your account type. You can change this later.
              </p>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Creating account...
              </>
            ) : (
              "Create account"
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-gray-600">
          By creating an account, you agree to our{" "}
          <a href="#" className="font-medium text-orange-600 hover:text-orange-500">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="#" className="font-medium text-orange-600 hover:text-orange-500">
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}

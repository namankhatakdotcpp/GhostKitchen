"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { z } from "zod";

const signupSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters").max(100),
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain uppercase letter")
      .regex(/[a-z]/, "Must contain lowercase letter")
      .regex(/[0-9]/, "Must contain a number"),
    confirmPassword: z.string(),
    phone: z
      .string()
      .regex(/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/, "Invalid phone number")
      .optional()
      .or(z.literal("")),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading, clearError } = useAuthStore();

  const [formData, setFormData] = useState({ name: "", email: "", password: "", confirmPassword: "", phone: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const passwordStrength = {
    length: formData.password.length >= 8,
    uppercase: /[A-Z]/.test(formData.password),
    lowercase: /[a-z]/.test(formData.password),
    number: /[0-9]/.test(formData.password),
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (validationErrors[name]) setValidationErrors((prev) => ({ ...prev, [name]: "" }));
    setSubmitError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors({});
    setSubmitError(null);

    const validation = signupSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((err) => { errors[err.path[0] as string] = err.message; });
      setValidationErrors(errors);
      return;
    }

    try {
      clearError();
      await register({ name: formData.name, email: formData.email, password: formData.password, phone: formData.phone || undefined });
      router.replace("/"); // New accounts are always CUSTOMER → home
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; error?: string } } };
      setSubmitError(axiosErr.response?.data?.message || axiosErr.response?.data?.error || "Registration failed. Please try again.");
    }
  };

  const inputClass = (field: string) =>
    `w-full rounded-md border px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 sm:text-sm ${
      validationErrors[field] ? "border-red-300 bg-red-50" : "border-gray-300"
    }`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">🍕 GhostKitchen</h1>
          <h2 className="mt-4 text-2xl font-bold text-gray-900">Create your account</h2>
          <p className="mt-2 text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-orange-600 hover:text-orange-500">Sign in</Link>
          </p>
        </div>

        {submitError && (
          <div className="rounded-md bg-red-50 border border-red-200 p-4">
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input name="name" type="text" required value={formData.name} onChange={handleInputChange} className={inputClass("name")} placeholder="John Doe" />
            {validationErrors.name && <p className="mt-1 text-xs text-red-600">{validationErrors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input name="email" type="email" required value={formData.email} onChange={handleInputChange} className={inputClass("email")} placeholder="you@example.com" />
            {validationErrors.email && <p className="mt-1 text-xs text-red-600">{validationErrors.email}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number <span className="text-gray-400">(Optional)</span></label>
            <input name="phone" type="tel" value={formData.phone} onChange={handleInputChange} className={inputClass("phone")} placeholder="+91 9876543210" />
            {validationErrors.phone && <p className="mt-1 text-xs text-red-600">{validationErrors.phone}</p>}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input name="password" type={showPassword ? "text" : "password"} required value={formData.password} onChange={handleInputChange} className={inputClass("password") + " pr-10"} placeholder="••••••••" />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {validationErrors.password && <p className="mt-1 text-xs text-red-600">{validationErrors.password}</p>}
            {formData.password && (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-medium text-gray-600">Password must include:</p>
                {[
                  { key: "length", label: "At least 8 characters" },
                  { key: "uppercase", label: "Upper case letter" },
                  { key: "lowercase", label: "Lower case letter" },
                  { key: "number", label: "Number" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center text-xs gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${passwordStrength[key as keyof typeof passwordStrength] ? "bg-green-500" : "bg-gray-300"}`} />
                    <span className={passwordStrength[key as keyof typeof passwordStrength] ? "text-green-700" : "text-gray-500"}>{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <div className="relative">
              <input name="confirmPassword" type={showConfirm ? "text" : "password"} required value={formData.confirmPassword} onChange={handleInputChange} className={inputClass("confirmPassword") + " pr-10"} placeholder="••••••••" />
              <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {validationErrors.confirmPassword && <p className="mt-1 text-xs text-red-600">{validationErrors.confirmPassword}</p>}
          </div>

          {/* Account type note */}
          <p className="text-xs text-gray-500 bg-gray-50 rounded-md p-3 border border-gray-200">
            All accounts start as <strong>Customer</strong>. You can add a Restaurant Owner or Delivery Agent role from your profile after signing up.
          </p>

          <button type="submit" disabled={isLoading} className="w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-semibold rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition">
            {isLoading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-500">
          By creating an account, you agree to our{" "}
          <a href="#" className="text-orange-600 hover:text-orange-500">Terms of Service</a> and{" "}
          <a href="#" className="text-orange-600 hover:text-orange-500">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}

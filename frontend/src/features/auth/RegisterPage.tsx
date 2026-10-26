import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../../lib/auth";
import { Button } from "../../components/ui/Button";
import { Field, FormError } from "../../components/ui/Field";
import { AuthLayout } from "./AuthLayout";
import { Link } from "react-router-dom";
import { useState } from "react";
import React from "react";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

type FormValues = z.infer<typeof schema>;

export const RegisterPage = () => {
  const { register: registerUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await registerUser(values.email, values.password);
    } catch (err) {
      setError("Registration failed.");
      console.error(err);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start tracking your money in minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-accent hover:text-accent-hover">
            Log in
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        <Field label="Email" error={errors.email?.message}>
          <input type="email" autoComplete="email" className="field" {...register("email")} />
        </Field>
        <Field label="Password" error={errors.password?.message} hint="At least 6 characters">
          <input
            type="password"
            autoComplete="new-password"
            className="field"
            {...register("password")}
          />
        </Field>
        {error && <FormError>{error}</FormError>}
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
};

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../../lib/auth";
import { Button } from "../../components/ui/Button";
import { Field, FormError } from "../../components/ui/Field";
import { AuthLayout } from "./AuthLayout";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import React from "react";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

type FormValues = z.infer<typeof schema>;

export const LoginPage = () => {
  const { login } = useAuth();
  const location = useLocation();
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
      await login(values.email, values.password);
    } catch (err) {
      setError("Invalid email or password.");
      console.error(err);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={
        location.state?.from
          ? "Please log in to continue."
          : "Log in to view your budgets and transactions."
      }
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link to="/register" className="font-medium text-accent hover:text-accent-hover">
            Sign up
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        <Field label="Email" error={errors.email?.message}>
          <input type="email" autoComplete="email" className="field" {...register("email")} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <input
            type="password"
            autoComplete="current-password"
            className="field"
            {...register("password")}
          />
        </Field>
        {error && <FormError>{error}</FormError>}
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>
          {isSubmitting ? "Logging in..." : "Log in"}
        </Button>
      </form>
    </AuthLayout>
  );
};

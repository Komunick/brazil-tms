"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  ASSIGNABLE_ROLES,
  createUserSchema,
  type CreateUserInput,
  type Role,
} from "@brazil-tms/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";

type OnboardingMethod = "invite" | "temp_password";

export interface UserFormProps {
  onSubmit: (input: CreateUserInput) => Promise<void> | void;
  onCancel: () => void;
  submitting: boolean;
  errorMessage?: string | null;
}

/**
 * Create-user form (FR-013, FR-013a). The RHF model mirrors `CreateUserInput` exactly, so
 * `zodResolver(createUserSchema)` validates name/email/role and the `onboarding` discriminated
 * union (temp-password length) in one pass.
 */
export function UserForm({ onSubmit, onCancel, submitting, errorMessage }: UserFormProps) {
  const t = useTranslations("AdminUsers");
  const tRoles = useTranslations("Roles");
  const tCommon = useTranslations("Common");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      role: ASSIGNABLE_ROLES[0],
      onboarding: { method: "invite" },
    },
  });

  const role = watch("role");
  const method = watch("onboarding.method");
  const onboardingErrors = errors.onboarding as
    | { tempPassword?: { message?: string } }
    | undefined;

  function setMethod(value: OnboardingMethod): void {
    if (value === "temp_password") {
      setValue("onboarding", { method: "temp_password", tempPassword: "" });
    } else {
      setValue("onboarding", { method: "invite" });
    }
  }

  return (
    <form onSubmit={handleSubmit((values) => onSubmit(values))} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" autoComplete="name" {...register("name")} />
        {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email ? <p className="text-sm text-destructive">{errors.email.message}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">{t("role")}</Label>
        <Select value={role} onValueChange={(v) => setValue("role", v as Role)}>
          <SelectTrigger id="role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSIGNABLE_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {tRoles(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.role ? <p className="text-sm text-destructive">{errors.role.message}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="method">{t("onboarding")}</Label>
        <Select value={method} onValueChange={(v) => setMethod(v as OnboardingMethod)}>
          <SelectTrigger id="method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="invite">{t("onboardingInvite")}</SelectItem>
            <SelectItem value="temp_password">{t("onboardingTempPassword")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {method === "temp_password" ? (
        <div className="space-y-2">
          <Label htmlFor="tempPassword">{t("tempPassword")}</Label>
          <Input
            id="tempPassword"
            type="text"
            autoComplete="off"
            {...register("onboarding.tempPassword")}
          />
          {onboardingErrors?.tempPassword ? (
            <p className="text-sm text-destructive">{onboardingErrors.tempPassword.message}</p>
          ) : null}
        </div>
      ) : null}

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? tCommon("saving") : t("createUser")}
        </Button>
      </DialogFooter>
    </form>
  );
}

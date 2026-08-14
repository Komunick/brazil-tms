"use client";

import { useForm, useWatch, type Resolver, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { createDriverSchema, type CreateDriverInput } from "@brazil-tms/shared";
import { Input } from "@/components/ui/input";
import { EntityFormShell, Field } from "@/components/master-data/entity-form";
import {
  ExpiryDateField,
  fieldMessage,
  OwnershipCarrierFields,
  ResourceStatusSelect,
} from "@/components/master-data/resource-form-fields";

export interface DriverFormProps {
  defaultValues?: Partial<CreateDriverInput>;
  submitting: boolean;
  errorMessage?: string | null;
  submitLabel?: string;
  onSubmit: (values: CreateDriverInput) => void;
  onCancel: () => void;
}

/**
 * Numeric-only field: strips every non-digit as the user types (and on paste, so a copied
 * "390.533.447-05" / "(11) 99999-8888" lands normalized) before react-hook-form reads the event.
 */
function registerDigits(registration: UseFormRegisterReturn): UseFormRegisterReturn {
  return {
    ...registration,
    onChange: (event: { target: { value?: string } }) => {
      event.target.value = (event.target.value ?? "").replace(/\D/g, "");
      return registration.onChange(event);
    },
  };
}

/** Create/edit form for a driver (US3). Validates with the shared `createDriverSchema`. */
export function DriverForm({
  defaultValues,
  submitting,
  errorMessage,
  submitLabel,
  onSubmit,
  onCancel,
}: DriverFormProps) {
  const t = useTranslations("Resources.drivers");
  const tResources = useTranslations("Resources");

  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateDriverInput>({
    resolver: zodResolver(createDriverSchema) as Resolver<CreateDriverInput>,
    defaultValues: {
      name: "",
      phone: "",
      cpf: "",
      licenseNumber: "",
      licenseCategory: "",
      licenseExpiry: "",
      ownershipType: "owned",
      carrierId: "",
      employer: "",
      status: "active",
      notes: "",
      ...defaultValues,
    },
  });

  const ownershipType = useWatch({ control, name: "ownershipType" });

  return (
    <EntityFormShell
      submitting={submitting}
      errorMessage={errorMessage}
      submitLabel={submitLabel}
      onCancel={onCancel}
      onSubmit={handleSubmit((values) => onSubmit(values))}
    >
      <Field label={t("name")} htmlFor="name" required error={fieldMessage(errors.name)}>
        <Input id="name" {...register("name")} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("phone")} htmlFor="phone" error={fieldMessage(errors.phone)}>
          <Input
            id="phone"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="11999998888"
            {...registerDigits(register("phone"))}
          />
        </Field>
        <Field label={t("cpf")} htmlFor="cpf" error={fieldMessage(errors.cpf)}>
          <Input
            id="cpf"
            inputMode="numeric"
            placeholder="00000000000"
            {...registerDigits(register("cpf"))}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={t("licenseNumber")}
          htmlFor="licenseNumber"
          error={fieldMessage(errors.licenseNumber)}
        >
          <Input id="licenseNumber" {...register("licenseNumber")} />
        </Field>
        <Field
          label={t("licenseCategory")}
          htmlFor="licenseCategory"
          error={fieldMessage(errors.licenseCategory)}
        >
          <Input id="licenseCategory" {...register("licenseCategory")} />
        </Field>
      </div>

      <ExpiryDateField
        label={t("licenseExpiry")}
        htmlFor="licenseExpiry"
        error={fieldMessage(errors.licenseExpiry)}
        registration={register("licenseExpiry")}
      />

      <OwnershipCarrierFields
        control={control}
        ownershipType={ownershipType}
        ownershipName="ownershipType"
        carrierName="carrierId"
        ownershipError={fieldMessage(errors.ownershipType)}
        carrierError={fieldMessage(errors.carrierId)}
        onClearCarrier={() => setValue("carrierId", "")}
      />

      <Field label={t("employer")} htmlFor="employer" error={fieldMessage(errors.employer)}>
        <Input id="employer" {...register("employer")} />
      </Field>

      <ResourceStatusSelect control={control} name="status" error={fieldMessage(errors.status)} />

      <Field label={tResources("notes")} htmlFor="notes" error={fieldMessage(errors.notes)}>
        <Input id="notes" {...register("notes")} />
      </Field>
    </EntityFormShell>
  );
}

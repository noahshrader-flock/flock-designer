import * as React from "react"
import { cn } from "@/lib/utils"
import { Label } from "@/ui/label"

/** One form field, as shadcn lays it out: its label, its control, and a line of description under the control. */
function Field({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="field"
      className={cn("group/field flex w-full flex-col gap-2", className)}
      {...props}
    />
  )
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={cn("w-fit", className)} {...props} />
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "text-muted-foreground text-sm leading-normal font-normal [&>a]:underline [&>a]:underline-offset-4",
        className
      )}
      {...props}
    />
  )
}

export { Field, FieldLabel, FieldDescription }

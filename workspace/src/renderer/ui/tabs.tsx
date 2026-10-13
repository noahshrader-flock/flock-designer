import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { titleCase } from "../../shared/titleCase"
import { Tabs as TabsPrimitive } from "radix-ui"

type TabsVariant = "default" | "line"

/** The variant is said once, on `Tabs`; its list, triggers and content take it from here. */
const TabsVariantContext = React.createContext<TabsVariant>("default")

/**
 * `variant="line"` is the app's tabs for a panel or a screen: **one strip, the same everywhere**. It runs edge to edge
 * across its box, resting on a bottom border, as tall as a toolbar and on its background; its tabs are as wide as their
 * labels, at the left, inset by `--tabs-inset` (the page's padding, so the strip lines up with what is under it; a panel
 * with less padding of its own says so once, on its root, never on the tabs). Never tabs stretched to fill the width, which
 * makes one strip look unlike the next. A strip with more tabs than fit scrolls sideways, from the first. The content under
 * it is padded and scrolls on its own, so the strip stays at the top. Used as shadcn's Tabs are: a root, a list of
 * triggers, and a content for each.
 */
function Tabs({
  className,
  orientation = "horizontal",
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & { variant?: TabsVariant }) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-variant={variant}
        data-orientation={orientation}
        className={cn(
          "group/tabs flex gap-2 data-horizontal:flex-col",
          // Fills the panel: the strip first, and the content taking what is left.
          variant === "line" && "min-h-0 flex-1 gap-0",
          className
        )}
        {...props}
      />
    </TabsVariantContext.Provider>
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        // As wide as its tabs and at least its box, starting at the left: when the tabs do not fit, the strip is wider than
        // the box that scrolls it (`TabsList`), never a centered row spilling off both ends with the first out of reach.
        line: "w-max min-w-full justify-start gap-1 border-b",
      },
      // The sizes of a Button (default and lg), so a row of tabs and a row of buttons beside it are the same height.
      size: {
        default: "group-data-horizontal/tabs:h-8",
        lg: "group-data-horizontal/tabs:h-9",
      },
    },
    // A line strip is the same whatever size is asked for: as tall as a toolbar (the Design System's and every panel's), on
    // its background, inset as the content under it is, its tabs as wide as their labels and not shares of the width.
    compoundVariants: [
      {
        variant: "line",
        class:
          "bg-card px-(--tabs-inset,var(--page-padding)) group-data-horizontal/tabs:h-(--toolbar-height) [&>[role=tab]]:flex-none",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function TabsList({
  className,
  variant,
  size = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const inherited = React.useContext(TabsVariantContext)
  variant ??= inherited
  const list = (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      data-size={size}
      className={cn(tabsListVariants({ variant, size }), className)}
      {...props}
    />
  )
  if (variant !== "line") return list
  // A line strip is carried by a box that scrolls it sideways when its tabs do not fit; the scrollbar is hidden, as what is
  // cut off at the edge says there is more. The box has a pixel of room below the strip, taken back by its margin: a tab's
  // underline is drawn over the strip's bottom border, and a box that clips would otherwise cut it off there.
  return (
    <div
      data-slot="tabs-scroll"
      className="-mb-px shrink-0 overflow-x-auto pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {list}
    </div>
  )
}

function TabsTrigger({
  className,
  children,
  onFocus,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      // A tab chosen by click or key is brought into view in a strip that scrolls, never left half cut off.
      onFocus={(event) => {
        onFocus?.(event)
        event.currentTarget.scrollIntoView?.({ inline: "nearest", block: "nearest" })
      }}
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    >
      {/* A tab's label is always in title case, whatever it was written in. */}
      {typeof children === "string" ? titleCase(children) : children}
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  const variant = React.useContext(TabsVariantContext)
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "flex-1 text-sm outline-none",
        // Under a line strip it scrolls on its own, so the strip stays at the top, and it is the one with the padding.
        variant === "line" && "min-h-0 overflow-y-auto p-4",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }

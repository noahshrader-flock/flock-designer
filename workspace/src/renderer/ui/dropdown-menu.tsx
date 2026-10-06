import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import type * as React from 'react';
import { cn } from '../lib/utils';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export const DropdownMenuContent = ({
	className,
	sideOffset = 4,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) => (
	<DropdownMenuPrimitive.Portal>
		<DropdownMenuPrimitive.Content
			data-slot="dropdown-menu-content"
			sideOffset={sideOffset}
			className={cn(
				'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md',
				className,
			)}
			{...props}
		/>
	</DropdownMenuPrimitive.Portal>
);

export const DropdownMenuItem = ({
	className,
	variant = 'default',
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { variant?: 'default' | 'destructive' }) => (
	<DropdownMenuPrimitive.Item
		data-slot="dropdown-menu-item"
		data-variant={variant}
		className={cn(
			"focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
			className,
		)}
		{...props}
	/>
);

export const DropdownMenuSeparator = ({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) => (
	<DropdownMenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn('bg-border -mx-1 my-1 h-px', className)} {...props} />
);

export const DropdownMenuLabel = ({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) => (
	<DropdownMenuPrimitive.Label data-slot="dropdown-menu-label" className={cn('px-2 py-1.5 text-sm font-medium', className)} {...props} />
);

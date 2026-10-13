import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { APPEARANCES, type Appearance, isAppearance } from '../shared/appearance';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Field, FieldLabel } from './ui/field';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { ErrorAlert } from './ErrorAlert';
import { closeUnlessBusy } from './dialogClose';

const ICONS = { system: MonitorIcon, light: SunIcon, dark: MoonIcon } as const;

/**
 * Settings, from the account menu: the theme, as one button group of Auto (the computer's own light or dark setting, which
 * it starts as), Light and Dark, with the one in use pressed. A choice is set at once, for the whole
 * app, and kept; if it cannot be, the group goes back to what it was and says why.
 */
export const Settings = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
	const [appearance, setAppearance] = useState<Appearance>('system');
	const [error, setError] = useState<string | null>(null);
	// What is in use is asked each time Settings opens, so it is never what it was when the window began.
	useEffect(() => {
		if (!open) return;
		setError(null);
		void window.workspace.appearance().then((r) => r.ok && setAppearance(r.value));
	}, [open]);
	const choose = async (next: Appearance) => {
		const before = appearance;
		setAppearance(next);
		setError(null);
		const r = await window.workspace.setAppearance(next);
		if (r.ok) return;
		setAppearance(before);
		setError(r.error);
	};
	return (
		<Dialog open={open} onOpenChange={closeUnlessBusy(onClose)}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Field>
						<FieldLabel>Theme</FieldLabel>
						<ToggleGroup
							type="single"
							variant="outline"
							spacing={0}
							fullWidth
							aria-label="Theme"
							value={appearance}
							// Pressing the one in use would unpress it, which the group says as an empty value: ignored, so one stays pressed.
							onValueChange={(next) => isAppearance(next) && void choose(next)}
						>
							{APPEARANCES.map(({ value, label }) => {
								const Icon = ICONS[value];
								return (
									<ToggleGroupItem key={value} value={value} aria-label={label}>
										<Icon />
										{label}
									</ToggleGroupItem>
								);
							})}
						</ToggleGroup>
					</Field>
					{error && <ErrorAlert error={error} />}
				</DialogBody>
				<DialogFooter>
					<Button onClick={onClose}>Done</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

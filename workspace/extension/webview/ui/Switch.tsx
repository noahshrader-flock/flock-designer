/**
 * A choice that is on or off, as a switch: a button that says it is one to assistive technology (`role="switch"`), named
 * by the label beside it, its knob at the start when off and at the end when on, in the brand when on.
 */
export const Switch = ({ id, on, onChange }: { id: string; on: boolean; onChange: (on: boolean) => void }) => (
	<button id={id} type="button" role="switch" aria-checked={on} className="switch" onClick={() => onChange(!on)}>
		<span className="switch-knob" />
	</button>
);

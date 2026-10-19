export const Switch = ({ id, on, onChange }: { id: string; on: boolean; onChange: (on: boolean) => void }) => (
	<button id={id} type="button" role="switch" aria-checked={on} className="switch" onClick={() => onChange(!on)}>
		<span className="switch-knob" />
	</button>
);

import { type Criterion, requiredAt, understanding, type WcagLevel, type WcagTarget, type WcagVersion } from './wcag';

/**
 * WCAG 2.2's Level A and AA success criteria as a matrix, held here once: each one's number, name, level and version, so a
 * measure of it can be said to be at a product's target or above (`requiredAt`); what only a person can judge (`person`);
 * and when the manual list must carry it (`manual`). 4.1.1 Parsing is not here: WCAG 2.2 took it out.
 */
/** When the manual list must carry a criterion, as the matrix's last column says it. */
export interface ManualMark {
	/** Assistive technology is the only real answer (with what, when it says: "voice control"). */
	at: boolean;
	with: string | null;
	/** Only when the work has this ("video", "a time limit exists"). */
	when: string | null;
	/** Decided by the page around the work, which a measure of the work alone does not have. */
	host: boolean;
}

export interface MatrixRow extends Criterion {
	person: string | null;
	manual: ManualMark | null;
}

/** The matrix's Manual column, as written ("AT; if: charts or complex images", "AT (voice control)", "host"), as fields. */
const mark = (written: string | null): ManualMark | null => {
	if (written === null) return null;
	const parts = written.split(';').map((p) => p.trim());
	const at = parts.find((p) => p.startsWith('AT'));
	return {
		at: at !== undefined,
		with: at ? (/\(([^)]+)\)/.exec(at)?.[1] ?? null) : null,
		when:
			parts
				.find((p) => p.startsWith('if:'))
				?.slice(3)
				.trim() ?? null,
		host: parts.includes('host'),
	};
};

const row = (
	sc: string,
	name: string,
	level: WcagLevel,
	since: WcagVersion,
	slug: string,
	person: string | null,
	manual: string | null,
): MatrixRow => ({
	sc,
	name,
	level,
	since,
	url: understanding(slug),
	person,
	manual: mark(manual),
});

export const CRITERIA: MatrixRow[] = [
	row(
		'1.1.1',
		'Non-text Content',
		'A',
		'2.0',
		'non-text-content',
		'alt text is meaningful; decorative vs informative',
		'AT; if: charts or complex images',
	),
	row('1.2.1', 'Audio-only and Video-only (Prerecorded)', 'A', '2.0', 'audio-only-and-video-only-prerecorded', null, 'if: audio or video'),
	row('1.2.2', 'Captions (Prerecorded)', 'A', '2.0', 'captions-prerecorded', null, 'if: video'),
	row(
		'1.2.3',
		'Audio Description or Media Alternative (Prerecorded)',
		'A',
		'2.0',
		'audio-description-or-media-alternative-prerecorded',
		null,
		'if: video',
	),
	row('1.2.4', 'Captions (Live)', 'AA', '2.0', 'captions-live', null, 'if: live media'),
	row('1.2.5', 'Audio Description (Prerecorded)', 'AA', '2.0', 'audio-description-prerecorded', null, 'if: video'),
	row('1.3.1', 'Info and Relationships', 'A', '2.0', 'info-and-relationships', 'markup carries what the layout shows', 'AT'),
	row('1.3.2', 'Meaningful Sequence', 'A', '2.0', 'meaningful-sequence', 'whether a mismatch matters', 'AT'),
	row('1.3.3', 'Sensory Characteristics', 'A', '2.0', 'sensory-characteristics', 'copy that names shape, color or position', null),
	row('1.3.4', 'Orientation', 'AA', '2.1', 'orientation', 'content kept in both', null),
	row('1.3.5', 'Identify Input Purpose', 'AA', '2.1', 'identify-input-purpose', 'fields that collect personal data have a purpose', null),
	row('1.4.1', 'Use of Color', 'A', '2.0', 'use-of-color', 'state still readable', null),
	row('1.4.2', 'Audio Control', 'A', '2.0', 'audio-control', null, 'if: audio'),
	row('1.4.3', 'Contrast (Minimum)', 'AA', '2.0', 'contrast-minimum', null, null),
	row('1.4.4', 'Resize Text', 'AA', '2.0', 'resize-text', 'loss of content', null),
	row('1.4.5', 'Images of Text', 'AA', '2.0', 'images-of-text', 'text inside images', null),
	row('1.4.10', 'Reflow', 'AA', '2.1', 'reflow', 'loss of content or function', null),
	row('1.4.11', 'Non-text Contrast', 'AA', '2.1', 'non-text-contrast', 'which parts carry meaning', null),
	row('1.4.12', 'Text Spacing', 'AA', '2.1', 'text-spacing', 'loss of content', null),
	row('1.4.13', 'Content on Hover or Focus', 'AA', '2.1', 'content-on-hover-or-focus', null, null),
	row('2.1.1', 'Keyboard', 'A', '2.0', 'keyboard', null, null),
	row('2.1.2', 'No Keyboard Trap', 'A', '2.0', 'no-keyboard-trap', null, null),
	row('2.1.4', 'Character Key Shortcuts', 'A', '2.1', 'character-key-shortcuts', 'whether they can be turned off or remapped', null),
	row('2.2.1', 'Timing Adjustable', 'A', '2.0', 'timing-adjustable', 'whether the user can extend', 'if: a time limit exists'),
	row('2.2.2', 'Pause, Stop, Hide', 'A', '2.0', 'pause-stop-hide', null, null),
	row('2.3.1', 'Three Flashes or Below Threshold', 'A', '2.0', 'three-flashes-or-below-threshold', null, 'if: flashing content or media'),
	row('2.4.1', 'Bypass Blocks', 'A', '2.0', 'bypass-blocks', null, 'host'),
	row('2.4.2', 'Page Titled', 'A', '2.0', 'page-titled', 'titles describe the page', null),
	row('2.4.3', 'Focus Order', 'A', '2.0', 'focus-order', 'whether a mismatch matters', 'AT'),
	row('2.4.4', 'Link Purpose (In Context)', 'A', '2.0', 'link-purpose-in-context', 'link purpose from its text and context', null),
	row('2.4.5', 'Multiple Ways', 'AA', '2.0', 'multiple-ways', null, 'host'),
	row('2.4.6', 'Headings and Labels', 'AA', '2.0', 'headings-and-labels', 'headings and labels describe their content', 'AT'),
	row('2.4.7', 'Focus Visible', 'AA', '2.0', 'focus-visible', 'indicator is clear', null),
	row('2.4.11', 'Focus Not Obscured (Minimum)', 'AA', '2.2', 'focus-not-obscured-minimum', null, null),
	row('2.5.1', 'Pointer Gestures', 'A', '2.1', 'pointer-gestures', null, 'if: such a gesture'),
	row('2.5.2', 'Pointer Cancellation', 'A', '2.1', 'pointer-cancellation', null, null),
	row('2.5.3', 'Label in Name', 'A', '2.1', 'label-in-name', 'visible label against name', 'AT (voice control)'),
	row('2.5.4', 'Motion Actuation', 'A', '2.1', 'motion-actuation', null, 'if: motion input'),
	row('2.5.7', 'Dragging Movements', 'AA', '2.2', 'dragging-movements', 'a single-pointer alternative', 'if: dragging'),
	row('2.5.8', 'Target Size (Minimum)', 'AA', '2.2', 'target-size-minimum', null, null),
	row('3.1.1', 'Language of Page', 'A', '2.0', 'language-of-page', null, null),
	row('3.1.2', 'Language of Parts', 'AA', '2.0', 'language-of-parts', 'foreign-language text left unmarked', null),
	row('3.2.1', 'On Focus', 'A', '2.0', 'on-focus', null, null),
	row('3.2.2', 'On Input', 'A', '2.0', 'on-input', null, null),
	row('3.2.3', 'Consistent Navigation', 'AA', '2.0', 'consistent-navigation', null, 'host'),
	row('3.2.4', 'Consistent Identification', 'AA', '2.0', 'consistent-identification', 'same function, same name, across states', null),
	row('3.2.6', 'Consistent Help', 'A', '2.2', 'consistent-help', null, 'host'),
	row('3.3.1', 'Error Identification', 'A', '2.0', 'error-identification', 'the message is clear', 'AT'),
	row('3.3.2', 'Labels or Instructions', 'A', '2.0', 'labels-or-instructions', 'labels and instructions are enough', 'AT'),
	row('3.3.3', 'Error Suggestion', 'AA', '2.0', 'error-suggestion', 'error says how to fix it', null),
	row(
		'3.3.4',
		'Error Prevention (Legal, Financial, Data)',
		'AA',
		'2.0',
		'error-prevention-legal-financial-data',
		'flow can be reversed, checked or confirmed',
		'if: legal, financial or data-changing flow',
	),
	row('3.3.7', 'Redundant Entry', 'A', '2.2', 'redundant-entry', 'steps that ask for the same thing twice', 'if: a multi-step flow'),
	row('3.3.8', 'Accessible Authentication (Minimum)', 'AA', '2.2', 'accessible-authentication-minimum', null, 'host'),
	row('4.1.2', 'Name, Role, Value', 'A', '2.0', 'name-role-value', 'names make sense; state is exposed', 'AT'),
	row('4.1.3', 'Status Messages', 'AA', '2.1', 'status-messages', 'message is worth announcing', 'AT'),
];

/** A criterion by its number; throws for one that is not in the matrix, so a cell can never name one that does not exist. */
export const wcagCriterion = (sc: string): MatrixRow => {
	const found = CRITERIA.find((c) => c.sc === sc);
	if (!found) throw new Error(`WCAG ${sc} is not a Level A or AA criterion of WCAG 2.2.`);
	return found;
};

/** Whether a product's target asks for a criterion, by its number. */
export const atTarget = (sc: string, target: WcagTarget): boolean => requiredAt(wcagCriterion(sc), target);

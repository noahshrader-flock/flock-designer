import { type Criterion, requiredAt, type WcagLevel, type WcagTarget, type WcagVersion } from './wcag';

/**
 * WCAG 2.2's Level A and AA success criteria (the accessibility plan's matrix, its 55 rows): each one's number, name,
 * level and the version it came in, so what is measured of one can be said to be at a product's target or above it
 * (`requiredAt`). 4.1.1 Parsing is not here: WCAG 2.2 took it out.
 */
const row = (sc: string, name: string, level: WcagLevel, since: WcagVersion, slug: string): Criterion => ({
	sc,
	name,
	level,
	since,
	url: `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`,
});

export const CRITERIA: Criterion[] = [
	row('1.1.1', 'Non-text Content', 'A', '2.0', 'non-text-content'),
	row('1.2.1', 'Audio-only and Video-only (Prerecorded)', 'A', '2.0', 'audio-only-and-video-only-prerecorded'),
	row('1.2.2', 'Captions (Prerecorded)', 'A', '2.0', 'captions-prerecorded'),
	row('1.2.3', 'Audio Description or Media Alternative (Prerecorded)', 'A', '2.0', 'audio-description-or-media-alternative-prerecorded'),
	row('1.2.4', 'Captions (Live)', 'AA', '2.0', 'captions-live'),
	row('1.2.5', 'Audio Description (Prerecorded)', 'AA', '2.0', 'audio-description-prerecorded'),
	row('1.3.1', 'Info and Relationships', 'A', '2.0', 'info-and-relationships'),
	row('1.3.2', 'Meaningful Sequence', 'A', '2.0', 'meaningful-sequence'),
	row('1.3.3', 'Sensory Characteristics', 'A', '2.0', 'sensory-characteristics'),
	row('1.3.4', 'Orientation', 'AA', '2.1', 'orientation'),
	row('1.3.5', 'Identify Input Purpose', 'AA', '2.1', 'identify-input-purpose'),
	row('1.4.1', 'Use of Color', 'A', '2.0', 'use-of-color'),
	row('1.4.2', 'Audio Control', 'A', '2.0', 'audio-control'),
	row('1.4.3', 'Contrast (Minimum)', 'AA', '2.0', 'contrast-minimum'),
	row('1.4.4', 'Resize Text', 'AA', '2.0', 'resize-text'),
	row('1.4.5', 'Images of Text', 'AA', '2.0', 'images-of-text'),
	row('1.4.10', 'Reflow', 'AA', '2.1', 'reflow'),
	row('1.4.11', 'Non-text Contrast', 'AA', '2.1', 'non-text-contrast'),
	row('1.4.12', 'Text Spacing', 'AA', '2.1', 'text-spacing'),
	row('1.4.13', 'Content on Hover or Focus', 'AA', '2.1', 'content-on-hover-or-focus'),
	row('2.1.1', 'Keyboard', 'A', '2.0', 'keyboard'),
	row('2.1.2', 'No Keyboard Trap', 'A', '2.0', 'no-keyboard-trap'),
	row('2.1.4', 'Character Key Shortcuts', 'A', '2.1', 'character-key-shortcuts'),
	row('2.2.1', 'Timing Adjustable', 'A', '2.0', 'timing-adjustable'),
	row('2.2.2', 'Pause, Stop, Hide', 'A', '2.0', 'pause-stop-hide'),
	row('2.3.1', 'Three Flashes or Below Threshold', 'A', '2.0', 'three-flashes-or-below-threshold'),
	row('2.4.1', 'Bypass Blocks', 'A', '2.0', 'bypass-blocks'),
	row('2.4.2', 'Page Titled', 'A', '2.0', 'page-titled'),
	row('2.4.3', 'Focus Order', 'A', '2.0', 'focus-order'),
	row('2.4.4', 'Link Purpose (In Context)', 'A', '2.0', 'link-purpose-in-context'),
	row('2.4.5', 'Multiple Ways', 'AA', '2.0', 'multiple-ways'),
	row('2.4.6', 'Headings and Labels', 'AA', '2.0', 'headings-and-labels'),
	row('2.4.7', 'Focus Visible', 'AA', '2.0', 'focus-visible'),
	row('2.4.11', 'Focus Not Obscured (Minimum)', 'AA', '2.2', 'focus-not-obscured-minimum'),
	row('2.5.1', 'Pointer Gestures', 'A', '2.1', 'pointer-gestures'),
	row('2.5.2', 'Pointer Cancellation', 'A', '2.1', 'pointer-cancellation'),
	row('2.5.3', 'Label in Name', 'A', '2.1', 'label-in-name'),
	row('2.5.4', 'Motion Actuation', 'A', '2.1', 'motion-actuation'),
	row('2.5.7', 'Dragging Movements', 'AA', '2.2', 'dragging-movements'),
	row('2.5.8', 'Target Size (Minimum)', 'AA', '2.2', 'target-size-minimum'),
	row('3.1.1', 'Language of Page', 'A', '2.0', 'language-of-page'),
	row('3.1.2', 'Language of Parts', 'AA', '2.0', 'language-of-parts'),
	row('3.2.1', 'On Focus', 'A', '2.0', 'on-focus'),
	row('3.2.2', 'On Input', 'A', '2.0', 'on-input'),
	row('3.2.3', 'Consistent Navigation', 'AA', '2.0', 'consistent-navigation'),
	row('3.2.4', 'Consistent Identification', 'AA', '2.0', 'consistent-identification'),
	row('3.2.6', 'Consistent Help', 'A', '2.2', 'consistent-help'),
	row('3.3.1', 'Error Identification', 'A', '2.0', 'error-identification'),
	row('3.3.2', 'Labels or Instructions', 'A', '2.0', 'labels-or-instructions'),
	row('3.3.3', 'Error Suggestion', 'AA', '2.0', 'error-suggestion'),
	row('3.3.4', 'Error Prevention (Legal, Financial, Data)', 'AA', '2.0', 'error-prevention-legal-financial-data'),
	row('3.3.7', 'Redundant Entry', 'A', '2.2', 'redundant-entry'),
	row('3.3.8', 'Accessible Authentication (Minimum)', 'AA', '2.2', 'accessible-authentication-minimum'),
	row('4.1.2', 'Name, Role, Value', 'A', '2.0', 'name-role-value'),
	row('4.1.3', 'Status Messages', 'AA', '2.1', 'status-messages'),
];

/** A criterion by its number; throws for one that is not in the matrix, so a cell can never name one that does not exist. */
export const wcagCriterion = (sc: string): Criterion => {
	const found = CRITERIA.find((c) => c.sc === sc);
	if (!found) throw new Error(`WCAG ${sc} is not a Level A or AA criterion of WCAG 2.2.`);
	return found;
};

/** Whether a product's target asks for a criterion, by its number. */
export const atTarget = (sc: string, target: WcagTarget): boolean => requiredAt(wcagCriterion(sc), target);

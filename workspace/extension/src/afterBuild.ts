import type { WorkspaceApi } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { type Offer, type Tell, handedTo } from './agentWork';

const FIX = 'Fix in Claude Code';

/** Rule names as a sentence: all of them up to three, else the first three and how many more. */
const named = (rules: string[]): string => {
	if (rules.length > 3) return `${rules.slice(0, 3).join(', ')} and ${rules.length - 3} more`;
	return rules.length < 2 ? (rules[0] ?? '') : `${rules.slice(0, -1).join(', ')} and ${rules.at(-1)}`;
};

/**
 * What DSNR does itself once a prototype Claude Code built is saved, so that it never depends on the agent: the prototype's
 * accessibility check, run here (T7), and what it found said to the person, against the product's target. Found issues are
 * offered back to Claude Code to fix, in a conversation of its own (`handPrototypeFix`). It never says the page passed: at
 * most, that automated checks found no issues, which is not a full review. A check that could not run is said as not run.
 */
export const checkBuilt = async ({
	api,
	root,
	projectId,
	name,
	title,
	tell,
	offer,
}: {
	api: Pick<WorkspaceApi, 'checkAccessibility' | 'handPrototypeFix'>;
	/** The product folder the build was handed over in: where a fix goes too. */
	root: string;
	projectId: string;
	name: string;
	title: string;
	tell: Tell;
	offer: Offer;
}): Promise<void> => {
	const checked = await api.checkAccessibility(projectId, name);
	if (!checked.ok) return tell(`${title} is saved. Its accessibility check was not run: ${checked.error}`);
	const { violations, ran } = checked.value;
	if (violations.length === 0)
		return tell(`${title} is saved. Its accessibility check found no issues by automated checks (${ran.target}); that is not a full review.`);
	const asked = await offer(
		`${title} is saved. Its accessibility check found ${plural(violations.length, 'issue')} (${ran.target}): ${named(violations.map((v) => v.rule))}.`,
		[FIX],
	);
	if (asked !== FIX) return;
	const handed = await api.handPrototypeFix(root, projectId, name);
	if (!handed.ok) return tell(`The fix for ${title} was not handed over: ${handed.error}`);
	tell(handedTo(handed.value, `The fix for ${title}`));
};

import type { Agent, AgentId } from './agent';
import { claudeCode } from './claudeCode';
import { codex } from './codex';
import { copilot } from './copilot';

/** Every agent DSNR can hand work to, as this machine has it. */
export const agentsHere = (): Record<AgentId, Agent> => ({ 'claude-code': claudeCode(), codex: codex(), copilot: copilot() });

/** Types for lib/machine-secret.js — see that file for the rationale. */
export type GateResult = { ok: true } | { ok: false; status: number; error: string };

type HeaderCarrier = { headers: { get(name: string): string | null } };
type EnvLike = Record<string, string | undefined>;

export function safeEqual(a: string, b: string): boolean;
export function machineSecret(env?: EnvLike): string | null;
export function hasMachineSecret(req: HeaderCarrier, env?: EnvLike): boolean;
export function requireMachineSecret(req: HeaderCarrier, env?: EnvLike): GateResult;

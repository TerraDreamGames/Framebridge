export const BEHAVIOR_VERSION: string;
export const BEHAVIOR_RUNTIME: string;
export const BEHAVIOR_CLIENT_SOURCE: string;
export const BEHAVIOR_BOOTSTRAP_SOURCE: string;
export function behaviorModuleSource(clientSource: string): string;

export const THEMED_BEHAVIOR_RUNTIME: string;
export const THEMED_BEHAVIOR_CLIENT_SOURCE: string;
export const PARTICLE_BEHAVIOR_RUNTIME: string;
export const THEMED_PARTICLE_BEHAVIOR_RUNTIME: string;
export const PARTICLE_BEHAVIOR_CLIENT_SOURCE: string;
export const THEMED_PARTICLE_BEHAVIOR_CLIENT_SOURCE: string;
export function selectBehaviorRuntime(
  themes: boolean,
  particles: boolean,
): string;
export function selectBehaviorClient(
  themes: boolean,
  particles: boolean,
): string;

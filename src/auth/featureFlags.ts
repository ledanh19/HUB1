/**
 * Feature Flags — Session Recovery V1
 * 
 * Gate all new session recovery behaviors behind this flag
 * for safe rollout and instant rollback capability.
 */

/** Enable session auto-recovery on idle tab resume */
export const SESSION_RECOVERY_V1 = true;

/** Enable structured request logging in dev console */
export const SESSION_RECOVERY_LOGGING = import.meta.env.DEV;

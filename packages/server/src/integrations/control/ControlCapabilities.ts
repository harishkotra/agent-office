/**
 * Ciudadan AgentOffice — Block 4: capability report of the control
 * surface. Everything here is HONEST by design: a capability is only
 * `available` when it was actually validated against the real system.
 */

export interface ControlCapabilities {
    /** SDK module (@cline/core) could be loaded. */
    sdkLoaded: boolean;
    /** The hub discovery record exists with url + authToken. */
    hubRecordReadable: boolean;
    /** A live connection to the hub daemon was established. */
    hubConnected: boolean;
    /** The hub currently knows at least one dispatchable session
     *  (hub-created; TUI sessions are NOT hub-registered). */
    hubSessions: number;
    /** Instruction dispatch is enabled by configuration AND the
     *  adapter is validated. If false, `dispatchCause` explains why. */
    dispatchAvailable: boolean;
    /** Human-readable, non-secret explanation for disabled dispatch. */
    dispatchCause: string;
    /** Read-only observation capabilities (always true in this build). */
    readOnly: {
        listSessions: boolean;
        getSession: boolean;
        readMessages: boolean;
        subscribe: boolean;
    };
    checkedAt: string;
}

export const BLOCKED_DISPATCH_REASONS = {
    disabledByConfig:
        'INSTRUCTION_DISPATCH_ENABLED=false (por defecto). El envío de instrucciones está desactivado por configuración.',
    noSdk:
        'El SDK @cline/core no está disponible en esta máquina (CLINE_SDK_PATH).',
    noHubRecord:
        'Sin registro de descubrimiento del hub legible (CLINE_HUB_RECORD_PATH); no hay token de acceso autorizado.',
    hubUnreachable:
        'El hub daemon de Cline no acepta conexiones en este momento.',
    hubLacksProvider:
        'El hub puede hospedar sesiones, pero su directorio de configuración (~/.cline) no tiene credenciales de proveedor válidas, por lo que no puede ejecutar inferencia end-to-end. Configura el proveedor en el hub (sin copiar claves manualmente) para activar el envío.',
    noDispatchableSessions:
        'El hub no tiene sesiones despachables. Las sesiones TUI existentes NO están registradas en el hub (adjuntarlas requeriría una segunda ejecución invasiva — no permitido).'
} as const;

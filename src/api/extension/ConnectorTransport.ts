/** Carries untrusted replies and events; protocol validation belongs to DuoFollowConnector. */
export interface ConnectorTransport {
  request(message: unknown, signal?: AbortSignal): Promise<unknown>;
  watch(onMessage: (message: unknown) => void, onDisconnect: () => void): (() => void) | undefined;
}

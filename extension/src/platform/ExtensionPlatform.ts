/** Browser-owned capabilities. Core receives trusted sender metadata through this boundary. */
export interface ExtensionPermissions {
  permissions?: string[];
  origins?: string[];
}

/** Permissions currently requested by DuoFollow; event payloads may contain other permissions. */
export interface ExtensionPermissionRequest {
  permissions?: 'cookies'[];
  origins?: string[];
}

export interface ExtensionStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ExtensionTab {
  id?: number;
  index: number;
  windowId: number;
}

export interface ExtensionSender {
  id?: string;
  url?: string;
  frameId?: number;
  documentId?: string;
  tab?: ExtensionTab;
}

interface ExtensionEvent<Listener> {
  addListener(listener: Listener): void;
}

export type ExtensionMessageListener = (
  message: unknown,
  sender: ExtensionSender,
  reply: (response: unknown) => void,
) => true | void;

export interface ExtensionPort {
  name: string;
  sender?: ExtensionSender;
  postMessage(message: unknown): void;
  disconnect(): void;
  onDisconnect: ExtensionEvent<() => void>;
}

export interface ExtensionPlatform {
  readonly id: string;
  readonly sitePatterns: readonly string[];
  extensionUrl(path: string): string;
  readCookie(url: string, name: string): Promise<string | undefined>;
  storage: { local: ExtensionStorage; session: ExtensionStorage };
  permissions: {
    contains(value: ExtensionPermissionRequest): Promise<boolean>;
    request(value: ExtensionPermissionRequest): Promise<boolean>;
    remove(value: ExtensionPermissionRequest): Promise<boolean>;
  };
  openSettings(source?: ExtensionTab): Promise<void>;
  openConfirmation(requestId: string): Promise<number | undefined>;
  sendInternal(message: unknown): Promise<unknown>;
  uiLanguage(): string;
  events: {
    message: ExtensionEvent<ExtensionMessageListener>;
    externalMessage: ExtensionEvent<ExtensionMessageListener>;
    externalConnect: ExtensionEvent<(port: ExtensionPort) => void>;
    permissionsRemoved: ExtensionEvent<(permissions: ExtensionPermissions) => void>;
    storageChanged: ExtensionEvent<
      (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void
    >;
    windowRemoved: ExtensionEvent<(id: number) => void>;
    action: ExtensionEvent<() => void>;
  };
}

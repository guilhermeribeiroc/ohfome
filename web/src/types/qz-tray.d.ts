declare module "qz-tray" {
  interface QzSecurity {
    setCertificatePromise(handler: (resolve: (certificate: string) => void, reject: (reason?: unknown) => void) => void): void;
    setSignatureAlgorithm(algorithm: "SHA1" | "SHA256" | "SHA512"): void;
    setSignaturePromise(handler: (payload: string) => (resolve: (signature: string) => void, reject: (reason?: unknown) => void) => void): void;
  }

  interface QzTray {
    websocket: {
      connect(): Promise<void>;
      isActive(): boolean;
    };
    printers: {
      find(query?: string): Promise<string | string[]>;
    };
    configs: {
      create(printer: string, options?: { forceRaw?: boolean; encoding?: string }): unknown;
    };
    security: QzSecurity;
    print(config: unknown, data: string[]): Promise<void>;
  }

  const qz: QzTray;
  export = qz;
}

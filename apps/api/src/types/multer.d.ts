declare module 'multer' {
  export function diskStorage(options: {
    destination?: string | ((req: unknown, file: any, cb: (error: Error | null, destination: string) => void) => void);
    filename?: (req: unknown, file: any, cb: (error: Error | null, filename: string) => void) => void;
  }): unknown;
}

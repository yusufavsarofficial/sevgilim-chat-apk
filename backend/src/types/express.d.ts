export type Role = "ADMIN" | "USER";

export type AuthContext = {
  userId: string;
  username: string;
  role: Role;
  token: string;
  sessionId: string;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      clientIpAddress?: string;
      clientDeviceInfo?: string;
    }
  }
}

export {};
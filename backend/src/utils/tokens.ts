import jwt from "jsonwebtoken";
import { config } from "../config.js";

export type JwtRole = "ADMIN" | "USER";

export type JwtPayload = {
  sub: string;
  username: string;
  role: JwtRole;
  sessionId: string;
  type: "access" | "refresh";
};

const accessExpiresIn = config.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"];
const refreshExpiresIn = config.REFRESH_TOKEN_EXPIRES_IN as jwt.SignOptions["expiresIn"];

export function signAccessToken(payload: Omit<JwtPayload, "type">): string {
  return jwt.sign({ ...payload, type: "access" }, config.JWT_SECRET, {
    expiresIn: accessExpiresIn
  });
}

export function signRefreshToken(payload: Omit<JwtPayload, "type">): string {
  return jwt.sign({ ...payload, type: "refresh" }, config.JWT_SECRET, {
    expiresIn: refreshExpiresIn
  });
}

export function verifyJwt(token: string): JwtPayload {
  return jwt.verify(token, config.JWT_SECRET) as JwtPayload;
}

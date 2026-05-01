import { NextFunction, Request, Response } from "express";

function extractIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  return req.ip || "unknown";
}

export function requestMetaMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.clientIpAddress = extractIp(req);
  req.clientDeviceInfo = req.headers["user-agent"] ? String(req.headers["user-agent"]).slice(0, 512) : "unknown";
  next();
}
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
  const userAgent = req.headers["user-agent"] ? String(req.headers["user-agent"]).slice(0, 512) : "unknown";
  const deviceParts = [
    userAgent,
    req.headers["x-device-brand"] ? `brand=${String(req.headers["x-device-brand"]).slice(0, 80)}` : "",
    req.headers["x-device-model"] ? `model=${String(req.headers["x-device-model"]).slice(0, 120)}` : "",
    req.headers["x-os-name"] ? `os=${String(req.headers["x-os-name"]).slice(0, 80)}` : "",
    req.headers["x-os-version"] ? `osVersion=${String(req.headers["x-os-version"]).slice(0, 80)}` : "",
    req.headers["x-app-version"] ? `app=${String(req.headers["x-app-version"]).slice(0, 40)}` : ""
  ].filter(Boolean);
  req.clientDeviceInfo = deviceParts.join("; ").slice(0, 512);
  next();
}

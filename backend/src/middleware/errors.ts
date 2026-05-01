import { NextFunction, Request, Response } from "express";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Endpoint bulunamadı." });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof Error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Beklenmeyen sunucu hatası." });
}
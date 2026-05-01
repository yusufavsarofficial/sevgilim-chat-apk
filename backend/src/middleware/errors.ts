import { NextFunction, Request, Response } from "express";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "İşlem tamamlanamadı. Lütfen tekrar deneyin." });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof Error) {
    process.stderr.write(`Beklenmeyen hata: ${error.message}\n`);
  }
  res.status(500).json({ error: "İşlem tamamlanamadı. Lütfen tekrar deneyin." });
}

import { NextFunction, Request, Response } from "express";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "İşlem tamamlanamadı. Lütfen tekrar deneyin." });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof Error) {
    process.stderr.write(`Beklenmeyen hata: ${error.message}\n`);
  }
  if (
    error &&
    typeof error === "object" &&
    "type" in error &&
    (error as { type?: string }).type === "entity.too.large"
  ) {
    res.status(413).json({ error: "Puantaj verisi çok büyük. Lütfen tekrar deneyin veya destek alın." });
    return;
  }
  res.status(500).json({ error: "İşlem tamamlanamadı. Lütfen tekrar deneyin." });
}

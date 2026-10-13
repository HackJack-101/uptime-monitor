import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: string[],
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: string[]) => new HttpError(400, message, details);
export const forbidden = (message = 'You do not have permission to perform this action') => new HttpError(403, message);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
    throw badRequest('Validation failed', details);
  }
  return result.data;
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export function paramId(req: FastifyRequest): number {
  return parse(idParam, req.params).id;
}

export const passwordSchema = z.string().min(10, 'Password must be at least 10 characters').max(256);
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const nameSchema = z.string().trim().min(1).max(100);

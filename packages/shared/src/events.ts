import { z } from 'zod';

export const ClientEventSchemas = {
  'heartbeat': z.object({}),
  'global:send': z.object({
    body: z.string().min(1).max(500)
  }),
  'match:search': z.object({
    filter: z.union([z.literal('ANY'), z.literal('SAME_YEAR'), z.array(z.number())])
  }),
  'match:cancel': z.object({}),
  'match:leave': z.object({}),
  'match:skip': z.object({}),
  'session:message': z.object({
    body: z.string().min(1).max(500)
  }),
  'session:typing': z.object({
    isTyping: z.boolean()
  })
};

export type ClientEvents = {
  [K in keyof typeof ClientEventSchemas]: z.infer<typeof ClientEventSchemas[K]>
};

export interface GlobalMessagePayload {
  id: string;
  body: string;
  alias: string;
  createdAt: string;
  flags?: string[];
}

export interface SessionMessagePayload {
  id: string;
  body: string;
  createdAt: string;
}

export interface ServerEvents {
  'online-count': (count: number) => void;
  'error': (err: { message: string, code: string }) => void;
  'global:receive': (msg: GlobalMessagePayload) => void;
  'global:delete': (data: { id: string }) => void;
  'match:joined': (data: { sessionId: string }) => void;
  'match:widen-offer': (data: { message: string }) => void;
  'match:ended': (data: { reason: string }) => void;
  'session:receive': (msg: SessionMessagePayload) => void;
  'session:typing': (data: { isTyping: boolean }) => void;
}

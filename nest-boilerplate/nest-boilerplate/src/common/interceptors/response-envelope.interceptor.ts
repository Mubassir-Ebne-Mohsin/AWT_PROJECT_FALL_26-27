import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, map } from "rxjs";

/** Return this from a handler to send `meta` (pagination, etc.) next to `data`. */
export class WithMeta<T, M = Record<string, unknown>> {
  constructor(
    public readonly data: T,
    public readonly meta: M,
  ) {}
}

/** Wraps every successful response as `{ data, meta? }`. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((result) => {
        if (result instanceof WithMeta) {
          return { data: result.data, meta: result.meta };
        }
        return { data: result === undefined ? null : result };
      }),
    );
  }
}

import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

export function partieTopic(partieId: string): string {
  return `partie:${partieId}`;
}

export function userTopic(userId: string): string {
  return `user:${userId}`;
}

@Injectable()
export class RealtimeEventsService {
  private readonly events$ = new Subject<{ topic: string }>();

  emit(topic: string): void {
    this.events$.next({ topic });
  }

  subscribe(topic: string): Observable<{ topic: string }> {
    return this.events$.pipe(filter((e) => e.topic === topic));
  }
}

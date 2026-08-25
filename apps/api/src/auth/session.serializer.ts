import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { UsersService } from '../users/users.service';
import { toAuthUser } from '../users/to-auth-user.util';

// Décide ce qu'on stocke dans la session (juste l'id) et comment on recharge
// l'utilisateur à chaque requête à partir de cet id.
@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly users: UsersService) {
    super();
  }

  serializeUser(
    user: { id: string },
    done: (err: Error | null, id?: string) => void,
  ) {
    done(null, user.id);
  }

  async deserializeUser(
    id: string,
    done: (err: Error | null, user?: unknown) => void,
  ) {
    const user = await this.users.findByIdWithCalendarLayers(id);
    if (!user) {
      done(null, null);
      return;
    }
    done(null, toAuthUser(user));
  }
}

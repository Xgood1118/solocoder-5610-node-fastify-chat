import { v4 as uuidv4 } from 'uuid';
import { User, UserStatus, PublicUser } from '../types';
import { storage } from '../storage';
import { eventBus } from '../events';
import { hashPassword, verifyPassword } from '../auth';

export class UserService {
  async register(
    username: string,
    password: string,
    avatar?: string,
    signature?: string
  ): Promise<User> {
    if (!username || username.length < 3) {
      throw new Error('用户名至少3个字符');
    }
    if (!password || password.length < 6) {
      throw new Error('密码至少6个字符');
    }
    const existing = storage.getUserByUsername(username);
    if (existing) {
      throw new Error('用户名已存在');
    }
    const hashedPwd = await hashPassword(password);
    const now = Date.now();
    const user: User = {
      id: uuidv4(),
      username,
      password: hashedPwd,
      avatar: avatar || '',
      signature: signature || '',
      status: 'offline',
      lastOnline: now,
      createdAt: now,
    };
    storage.addUser(user);
    return user;
  }

  async login(username: string, password: string): Promise<User> {
    const user = storage.getUserByUsername(username);
    if (!user) {
      throw new Error('用户名或密码错误');
    }
    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      throw new Error('用户名或密码错误');
    }
    return user;
  }

  updateProfile(
    userId: string,
    updates: {
      avatar?: string;
      signature?: string;
      username?: string;
    }
  ): PublicUser {
    const user = storage.updateUser(userId, updates);
    if (!user) {
      throw new Error('用户不存在');
    }
    if (updates.username) {
      const existing = storage.getUserByUsername(updates.username);
      if (existing && existing.id !== userId) {
        throw new Error('用户名已存在');
      }
    }
    const { password: _, ...publicUser } = user;
    return publicUser as PublicUser;
  }

  setStatus(userId: string, status: UserStatus): PublicUser {
    const now = Date.now();
    const updates: Partial<User> = { status };
    if (status !== 'online') {
      updates.lastOnline = now;
    }
    const user = storage.updateUser(userId, updates);
    if (!user) {
      throw new Error('用户不存在');
    }
    eventBus.emitUserStatusChanged({
      userId,
      status,
      lastOnline: user.lastOnline,
    });
    const { password: _, ...publicUser } = user;
    return publicUser as PublicUser;
  }

  getProfile(userId: string): PublicUser {
    const user = storage.getPublicUser(userId);
    if (!user) {
      throw new Error('用户不存在');
    }
    return user;
  }

  searchUsers(query: string, limit: number = 20): PublicUser[] {
    return storage.searchUsers(query, limit);
  }

  getById(userId: string): User | undefined {
    return storage.getUserById(userId);
  }
}

export const userService = new UserService();

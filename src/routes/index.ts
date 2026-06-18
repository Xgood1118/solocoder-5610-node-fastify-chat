import { FastifyInstance } from 'fastify';
import { ServerConfig } from '../types';
import { authRoutes } from './auth';
import { userRoutes } from './users';
import { conversationRoutes } from './conversations';
import { messageRoutes } from './messages';
import { fileRoutes } from './files';

export async function registerRoutes(
  fastify: FastifyInstance,
  config: ServerConfig
): Promise<void> {
  fastify.register(authRoutes, { prefix: '/api/auth' });
  fastify.register(userRoutes, { prefix: '/api/users' });
  fastify.register(conversationRoutes, { prefix: '/api/conversations' });
  fastify.register(messageRoutes, { prefix: '/api/messages' });
  fastify.register(fileRoutes, { prefix: '/uploads', config });

  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: Date.now(),
    };
  });
}

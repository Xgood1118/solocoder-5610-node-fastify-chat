import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { userService } from '../services/userService';
import { generateToken, authenticate, getCurrentUser } from '../auth';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as any;
      const { username, password, avatar, signature } = body || {};
      const user = await userService.register(username, password, avatar, signature);
      const token = generateToken(fastify, user);
      const { password: _, ...userInfo } = user;
      return reply.code(201).send({
        token,
        user: userInfo,
      });
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as any;
      const { username, password } = body || {};
      const user = await userService.login(username, password);
      const token = generateToken(fastify, user);
      const { password: _, ...userInfo } = user;
      return reply.send({
        token,
        user: userInfo,
      });
    } catch (e: any) {
      return reply.code(401).send({ error: e.message });
    }
  });

  fastify.get('/me', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getCurrentUser(request).userId;
      const user = userService.getProfile(userId);
      return reply.send({ user });
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });
}

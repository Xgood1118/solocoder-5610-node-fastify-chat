import bcrypt from 'bcrypt';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { User, JwtPayload, ServerConfig } from '../types';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(
  fastify: FastifyInstance,
  user: User
): string {
  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
  };
  return fastify.jwt.sign(payload, { expiresIn: '7d' });
}

export function registerJwt(
  fastify: FastifyInstance,
  config: ServerConfig
): void {
  fastify.register(fastifyJwt, {
    secret: config.jwtSecret,
  });
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const decoded = await request.jwtVerify<JwtPayload>();
    request.user = decoded;
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}

export async function authenticateWs(
  token: string,
  fastify: FastifyInstance
): Promise<JwtPayload | null> {
  try {
    const decoded = await fastify.jwt.verify<JwtPayload>(token);
    return decoded;
  } catch (err) {
    return null;
  }
}

export function getCurrentUser(request: FastifyRequest): JwtPayload {
  return request.user as JwtPayload;
}

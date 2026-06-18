import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, getCurrentUser } from '../auth';
import { fileService } from '../services/fileService';
import { ServerConfig } from '../types';

export async function fileRoutes(fastify: FastifyInstance, opts: { config: ServerConfig }) {
  fastify.post(
    '/upload',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getCurrentUser(request).userId;
        const parts = request.parts();
        const uploads: any[] = [];
        for await (const part of parts) {
          if ('file' in part) {
            const result = await fileService.uploadFile(part as any, userId);
            uploads.push(result);
          }
        }
        if (uploads.length === 0) {
          return reply.code(400).send({ error: '未找到上传的文件' });
        }
        return reply.code(201).send({
          files: uploads,
        });
      } catch (e: any) {
        return reply.code(400).send({ error: e.message });
      }
    }
  );
}

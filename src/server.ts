import Fastify, { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { ServerConfig } from './types';
import { registerJwt } from './auth';
import { registerRoutes } from './routes';
import { registerWebSocket } from './ws';
import { fileService } from './services/fileService';
import { storage } from './storage';

const DEFAULT_PORT = 3000;
const DEFAULT_JWT_SECRET = 'default-secret-key-change-in-production';
const DEFAULT_UPLOAD_DIR = 'uploads/';
const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024;
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_PAGE_SIZE = 50;

function parseArgs(): ServerConfig {
  const args = process.argv.slice(2);
  let port = DEFAULT_PORT;
  let jwtSecret = DEFAULT_JWT_SECRET;
  let uploadDir = DEFAULT_UPLOAD_DIR;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--port':
        port = parseInt(args[++i], 10) || DEFAULT_PORT;
        break;
      case '--jwt-secret':
        jwtSecret = args[++i] || DEFAULT_JWT_SECRET;
        break;
      case '--upload-dir':
        uploadDir = args[++i] || DEFAULT_UPLOAD_DIR;
        break;
    }
  }

  return {
    port,
    jwtSecret,
    uploadDir: path.isAbsolute(uploadDir) ? uploadDir : path.resolve(process.cwd(), uploadDir),
    maxFileSize: DEFAULT_MAX_FILE_SIZE,
    messageRetentionDays: DEFAULT_RETENTION_DAYS,
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

async function buildServer(config: ServerConfig): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: true,
    bodyLimit: config.maxFileSize,
  });

  registerJwt(fastify, config);

  fastify.register(fastifyWebsocket);

  fastify.register(fastifyMultipart, {
    limits: {
      fileSize: config.maxFileSize,
      files: 10,
    },
  });

  const rootDir = path.resolve(config.uploadDir);
  fastify.register(fastifyStatic, {
    root: rootDir,
    prefix: '/uploads/',
    decorateReply: false,
  });

  fileService.init(config);

  await registerRoutes(fastify, config);

  await registerWebSocket(fastify);

  startMaintenanceTasks(config);

  return fastify;
}

function startMaintenanceTasks(config: ServerConfig): void {
  const PURGE_INTERVAL = 6 * 60 * 60 * 1000;
  setInterval(() => {
    try {
      const purged = storage.purgeOldMessages(config.messageRetentionDays);
      if (purged > 0) {
        fastify_log(`清理过期消息: ${purged} 条`);
      }
    } catch (e) {
      console.error('清理过期消息失败:', e);
    }
  }, PURGE_INTERVAL);
}

function fastify_log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function start(): Promise<void> {
  const config = parseArgs();

  console.log('========================================');
  console.log('   Fastify Chat Server');
  console.log('========================================');
  console.log(`  端口: ${config.port}`);
  console.log(`  上传目录: ${config.uploadDir}`);
  console.log(`  最大文件大小: ${(config.maxFileSize / 1024 / 1024).toFixed(0)}MB`);
  console.log(`  消息保留: ${config.messageRetentionDays} 天`);
  console.log('========================================');

  const fastify = await buildServer(config);

  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`\n  服务已启动!`);
    console.log(`  HTTP: http://localhost:${config.port}`);
    console.log(`  WS:   ws://localhost:${config.port}/ws?token=<JWT>`);
    console.log(`  健康检查: http://localhost:${config.port}/health`);
    console.log('');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();

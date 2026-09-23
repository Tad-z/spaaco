import type { Request, Response } from 'express';
import { createUser, listUsers, updateUser } from '../../services/user.service.js';
import { listAuditLogs } from '../../services/audit.service.js';
import { toAdminUser, toAuditLogEntry } from '../../serializers/user.serializer.js';
import { toMeta } from '../../helpers/pagination.helper.js';
import { readBody, readParams, readQuery } from '../../middlewares/validate.middleware.js';
import { idParams, pagination } from '../../validators/common.validator.js';
import { createUserBody, listAuditQuery, updateUserBody } from '../../validators/auth.validator.js';

export async function listUsersHandler(req: Request, res: Response): Promise<void> {
  const query = readQuery(req, pagination);
  const { items, total } = await listUsers(query);

  res.json({ data: items.map(toAdminUser), meta: toMeta(query.page, query.pageSize, total) });
}

export async function createUserHandler(req: Request, res: Response): Promise<void> {
  const user = await createUser(readBody(req, createUserBody));

  res.status(201).json({ data: toAdminUser(user) });
}

export async function updateUserHandler(req: Request, res: Response): Promise<void> {
  const { id } = readParams(req, idParams);
  const user = await updateUser(id, readBody(req, updateUserBody));

  res.json({ data: toAdminUser(user) });
}

export async function listAuditLogsHandler(req: Request, res: Response): Promise<void> {
  const query = readQuery(req, listAuditQuery);
  const { items, total } = await listAuditLogs(query);

  res.json({
    data: items.map(toAuditLogEntry),
    meta: toMeta(query.page, query.pageSize, total),
  });
}

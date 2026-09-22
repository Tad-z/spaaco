import { Router } from 'express';
import { getSiteShell } from '../../controllers/public/site.controller.js';
import { optionalPreviewAuth } from '../../middlewares/auth.middleware.js';

export const siteRoutes: Router = Router();

siteRoutes.get('/site', optionalPreviewAuth, getSiteShell);

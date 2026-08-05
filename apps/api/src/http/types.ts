import type { FastifyRequest } from "fastify";
import type { ApiConfig } from "../config.js";
import type { UserId } from "@avana/domain";

export type AuthenticatedUser = {
  userId: UserId;
  email: string;
};

export type RequestContext = {
  requestId: string;
  config: ApiConfig;
  user?: AuthenticatedUser;
};

export type ApiRequest = FastifyRequest & {
  context: RequestContext;
};

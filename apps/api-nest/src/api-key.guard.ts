import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

import { readConfig } from "./config";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = readConfig().readOnlyApiKey;
    if (!expected) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ header(name: string): string | undefined }>();
    const actual = request.header("x-api-key");
    if (actual === expected) {
      return true;
    }
    throw new UnauthorizedException("Invalid API key.");
  }
}

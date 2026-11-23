import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { MemberActivityInterceptor } from "./member-activity.interceptor";
import { PerformanceController } from "./performance.controller";
import { PerformanceService } from "./performance.service";

@Module({
  controllers: [PerformanceController],
  providers: [
    PerformanceService,
    { provide: APP_INTERCEPTOR, useClass: MemberActivityInterceptor },
  ],
})
export class PerformanceModule {}

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./common/prisma/prisma.module";
import { MinioModule } from "./common/minio/minio.module";
import { AnnexDocumentModule } from "./common/annexes/annex-document.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { SubmissionsModule } from "./modules/submissions/submissions.module";
import { StratificationModule } from "./modules/stratification/stratification.module";
import { QualificationsModule } from "./modules/qualification/qualifications.module";
import { AnnexesModule } from "./modules/annexes/annexes.module";
import { AdminModule } from "./modules/admin/admin.module";
import { ReviewsModule } from "./modules/reviews/reviews.module";
import { ConsultantsModule } from "./modules/extensions/consultants/consultants.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../.env"],
    }),
    PrismaModule,
    MinioModule,
    AnnexDocumentModule,
    AuthModule,
    UsersModule,
    SubmissionsModule,
    StratificationModule,
    QualificationsModule,
    AnnexesModule,
    AdminModule,
    ReviewsModule,
    ConsultantsModule,
  ],
})
export class AppModule {}
